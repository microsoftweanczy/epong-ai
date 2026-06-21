import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat endpoint with Smart Web Search.
 *
 * Search providers (in order of reliability):
 *  1. DuckDuckGo Instant Answer API (api.duckduckgo.com) — JSON, no key, stable
 *  2. Wikipedia REST API — for factual/educational info, extremely stable
 *  3. z-ai SDK web_search — bonus when available
 *
 * Anti-hallucination: if search fails, AI is told NOT to use old training data.
 */

// ── Smart detection patterns ──
const REALTIME_PATTERNS: RegExp[] = [
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|kemarin/i,
  /latest|today|current|recent|right now|yesterday/i,
  /berita|news|update|pengumuman|umumkan/i,
  /harga|price|cuaca|weather|suhu|saham|stock|bitcoin|crypto|kurs|dollar/i,
  /jadwal|schedule|result|hasil|skor|score|pertandingan|match/i,
  /trending|viral|populer/i,
  /\b202[4-9]\b/i,
  /apa yang sedang|what.*happening|what.*going on/i,
  /status terbaru|kondisi sekarang|perkembangan/i,
  /berapa|how much|how many|berapa harga/i,
]

function needsWebSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((p) => p.test(text))
}

interface SearchResult {
  title: string
  snippet: string
  url: string
  source: string
}

/**
 * Multi-provider search: runs DDG Instant Answer + Wikipedia in parallel,
 * then z-ai SDK as bonus. Returns merged, deduplicated results.
 */
async function smartWebSearch(query: string): Promise<{
  context: string
  sourceCount: number
}> {
  // Run all 3 providers in parallel (fast — all respond in ~1-2s)
  const [ddgResults, wikiResults, zaiResults] = await Promise.allSettled([
    searchDuckDuckGoAPI(query),
    searchWikipedia(query),
    searchViaZAI(query),
  ])

  const allResults: SearchResult[] = []
  const seenUrls = new Set<string>()

  // Add DDG results (most relevant for real-time/news)
  if (ddgResults.status === 'fulfilled') {
    for (const r of ddgResults.value) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url)
        allResults.push(r)
      }
    }
  }

  // Add Wikipedia results (most stable for factual info)
  if (wikiResults.status === 'fulfilled') {
    for (const r of wikiResults.value) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url)
        allResults.push(r)
      }
    }
  }

  // Add z-ai results (bonus — may have broader coverage)
  if (zaiResults.status === 'fulfilled') {
    for (const r of zaiResults.value) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url)
        allResults.push(r)
      }
    }
  }

  if (allResults.length === 0) {
    return { context: '', sourceCount: 0 }
  }

  // Build context — top 5 results
  const context = allResults
    .slice(0, 5)
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.snippet}\n   Sumber: ${r.source} (${r.url})`
    )
    .join('\n\n')

  return { context, sourceCount: allResults.length }
}

// ── Provider 1: DuckDuckGo Instant Answer API (JSON, stable, no key) ──
// Official DDG API — returns JSON, no HTML scraping needed
async function searchDuckDuckGoAPI(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: { 'User-Agent': 'EpongAI/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    const results: SearchResult[] = []

    // Abstract (main answer)
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
        source: 'DuckDuckGo',
      })
    }

    // Answer (direct answer)
    if (data.Answer) {
      results.push({
        title: `Answer: ${query}`,
        snippet: typeof data.Answer === 'string' ? data.Answer : JSON.stringify(data.Answer),
        url: '',
        source: 'DuckDuckGo',
      })
    }

    // Definition
    if (data.Definition) {
      results.push({
        title: `Definition: ${query}`,
        snippet: data.Definition,
        url: data.DefinitionURL || '',
        source: 'DuckDuckGo',
      })
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || query,
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          })
        }
        // Nested topics
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const subTopic of topic.Topics.slice(0, 1)) {
            if (subTopic.Text && subTopic.FirstURL) {
              results.push({
                title: subTopic.Text.split(' - ')[0] || query,
                snippet: subTopic.Text,
                url: subTopic.FirstURL,
                source: 'DuckDuckGo',
              })
            }
          }
        }
      }
    }

    return results
  } catch {
    return []
  }
}

// ── Provider 2: Wikipedia REST API (extremely stable, fast, no key) ──
// Wikipedia OpenSearch + summary — great for factual/educational queries
async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    // Step 1: Search Wikipedia for article titles
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      {
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const searchResults = searchData?.query?.search || []
    if (searchResults.length === 0) return []

    // Step 2: Get summary for top article
    const topTitle = searchResults[0].title
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`,
      {
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!summaryRes.ok) return []

    const summary = await summaryRes.json()
    const results: SearchResult[] = []

    if (summary.extract) {
      results.push({
        title: summary.title || topTitle,
        snippet: summary.extract.slice(0, 300),
        url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topTitle)}`,
        source: 'Wikipedia',
      })
    }

    // Add other search results as brief snippets
    for (const sr of searchResults.slice(1, 3)) {
      const snippet = (sr.snippet || '').replace(/<[^>]*>/g, '')
      if (snippet) {
        results.push({
          title: sr.title,
          snippet: snippet.slice(0, 200),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(sr.title)}`,
          source: 'Wikipedia',
        })
      }
    }

    return results
  } catch {
    return []
  }
}

// ── Provider 3: z-ai SDK web_search (bonus, may not work on Vercel) ──
async function searchViaZAI(query: string): Promise<SearchResult[]> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query,
      num: 5,
    })
    if (!Array.isArray(results)) return []
    return results.map((r: any) => ({
      title: r.name || '',
      snippet: r.snippet || '',
      url: r.url || '',
      source: r.host_name || (r.url ? new URL(r.url).hostname : 'Web'),
    }))
  } catch {
    return []
  }
}

// ── Main handler ──

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    prefs?: Preferences | null
    memory?: any[]
    behaviorProfile?: string
    insights?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemInstruction = buildInstruction(
    body.prefs,
    body.behaviorProfile,
    body.insights,
    body.memory
  )

  // Check if web search is needed
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  let searchContext = ''
  let searchFailed = false
  let searchSourceCount = 0

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    // Run search with 8s timeout (parallel providers are fast)
    const searchResult = await Promise.race([
      smartWebSearch(lastUserMsg.content),
      new Promise<{ context: string; sourceCount: number }>((resolve) =>
        setTimeout(() => resolve({ context: '', sourceCount: 0 }), 8000)
      ),
    ])
    searchContext = searchResult.context
    searchSourceCount = searchResult.sourceCount
    if (!searchContext) searchFailed = true
  }

  // Build system prompt based on search outcome
  let fullSystem: string
  if (searchContext) {
    fullSystem = `${systemInstruction}

REAL-TIME WEB SEARCH RESULTS (${searchSourceCount} sources found):
${searchContext}

IMPORTANT: Use the above real-time data to answer. Cite source names. Current date: ${new Date().toISOString().split('T')[0]}.`
  } else if (searchFailed) {
    fullSystem = `${systemInstruction}

CRITICAL: Web search was needed but all providers failed. Do NOT use training data for current events. Tell user: "Maaf, saya tidak bisa mengakses informasi real-time saat ini. Silakan coba lagi sebentar." Never present old data as current.`
  } else {
    fullSystem = systemInstruction
  }

  const messages: ApiMessage[] = [
    { role: 'system', content: fullSystem },
    ...incoming.slice(-20),
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      if (searchContext) {
        send({ searchPerformed: true, sources: searchSourceCount })
      } else if (searchFailed) {
        send({ searchFailed: true })
      }

      const ok = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!ok) {
        send({ content: '*(Maaf, AI sedang bermasalah. Coba lagi ya.)*' })
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ── System instruction builder ──

function buildInstruction(
  prefs?: Preferences | null,
  behaviorProfile?: string,
  insights?: string[],
  memory?: any[]
): string {
  const p = prefs || {}
  const parts: string[] = [
    'You are Epong AI, a helpful AI assistant built by Wensy Corp (Epong) — a handsome guy from Mbodong and Waemata, Labuan Bajo.',
    'Detect the language the user speaks and respond in that same language.',
    'Always use correct spelling, grammar, and punctuation — never mirror the user\'s typos.',
  ]

  const toneMap: Record<string, string> = {
    santai: 'Style: casual and friendly. Use "kamu".',
    akrab: 'Style: very warm, like a best friend. Use "kamu".',
    profesional: 'Style: professional but approachable. Use "Anda".',
    formal: 'Style: formal and respectful. Use "Anda".',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  const verbMap: Record<string, string> = {
    ringkas: 'Length: concise, max 2-3 sentences for simple questions.',
    seimbang: 'Length: balanced, use bullet points for complex topics.',
    rinci: 'Length: detailed, use headings and bullet points.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: disabled.',
    sedikit: 'Humor: occasional, never during serious topics.',
    sering: 'Humor: playful and witty when appropriate.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  if (p.empathy) parts.push('Read the user\'s emotion and respond with empathy.')
  if (p.critical) parts.push('Be critically honest — challenge bad ideas respectfully.')

  if (behaviorProfile && behaviorProfile.trim()) {
    parts.push(`USER BEHAVIOR PROFILE (adapt your style accordingly):\n${behaviorProfile.trim()}`)
  }

  if (insights && insights.length > 0) {
    parts.push(`USER INSIGHTS:\n${insights.map((i) => `- ${i}`).join('\n')}`)
  }

  if (memory && memory.length > 0) {
    const memoryText = memory.slice(0, 15).map((m: any) => `- ${m.content}`).join('\n')
    parts.push(`USER MEMORY (use naturally, don't mention "from memory"):\n${memoryText}`)
  }

  parts.push('Be natural, warm, and genuinely helpful.')
  return parts.join('\n')
}
