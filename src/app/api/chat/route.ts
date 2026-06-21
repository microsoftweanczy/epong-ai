import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat with real-time data via Google News RSS + Wikipedia + DDG.
 * All free, no API keys, extremely stable.
 *
 * Search chain (all run in parallel):
 *  1. Google News RSS — real-time news, any language, ~100ms response
 *  2. Wikipedia REST API — factual/educational data, 99.99% uptime
 *  3. DuckDuckGo Instant Answer API — quick answers, definitions
 *  4. z-ai SDK web_search — bonus broader coverage
 */

// ── Smart detection ──
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

// ── Provider 1: Google News RSS (real-time news, fastest) ──
async function searchGoogleNews(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return []
    const xml = await res.text()

    const results: SearchResult[] = []
    // Parse RSS XML with regex (lightweight, no XML parser needed)
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []

    for (const item of items.slice(0, 5)) {
      const titleMatch = item.match(/<title>(.*?)<\/title>/)
      const linkMatch = item.match(/<link>(.*?)<\/link>/)
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)
      const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/)

      const title = titleMatch ? titleMatch[1].trim() : ''
      // Clean HTML from description
      const desc = descMatch
        ? descMatch[1].replace(/<[^>]*>/g, '').trim().slice(0, 250)
        : ''
      const url = linkMatch ? linkMatch[1].trim() : ''
      const source = sourceMatch ? sourceMatch[1].trim() : 'Google News'

      if (title) {
        results.push({ title, snippet: desc || title, url, source })
      }
    }

    return results
  } catch {
    return []
  }
}

// ── Provider 2: Wikipedia REST API (factual, extremely stable) ──
async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const searchResults = searchData?.query?.search || []
    if (searchResults.length === 0) return []

    // Get summary for top article
    const topTitle = searchResults[0].title
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!summaryRes.ok) return []

    const summary = await summaryRes.json()
    const results: SearchResult[] = []

    if (summary.extract) {
      results.push({
        title: summary.title || topTitle,
        snippet: summary.extract.slice(0, 300),
        url: summary.content_urls?.desktop?.page || '',
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

// ── Provider 3: DuckDuckGo Instant Answer API ──
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: SearchResult[] = []

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
        source: 'DuckDuckGo',
      })
    }
    if (data.Answer) {
      results.push({
        title: `Answer: ${query}`,
        snippet: typeof data.Answer === 'string' ? data.Answer : String(data.Answer),
        url: '',
        source: 'DuckDuckGo',
      })
    }
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 2)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || query,
            snippet: topic.Text.slice(0, 200),
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          })
        }
      }
    }
    return results
  } catch {
    return []
  }
}

// ── Provider 4: z-ai SDK web_search (bonus) ──
async function searchViaZAI(query: string): Promise<SearchResult[]> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num: 5 })
    if (!Array.isArray(results)) return []
    return results.map((r: any) => ({
      title: r.name || '',
      snippet: r.snippet || '',
      url: r.url || '',
      source: r.host_name || 'Web',
    }))
  } catch {
    return []
  }
}

// ── Multi-provider parallel search ──
async function smartWebSearch(query: string): Promise<{ context: string; sourceCount: number }> {
  // Run ALL 4 providers in parallel for maximum speed + coverage
  const [news, wiki, ddg, zai] = await Promise.allSettled([
    searchGoogleNews(query),
    searchWikipedia(query),
    searchDuckDuckGo(query),
    searchViaZAI(query),
  ])

  const allResults: SearchResult[] = []
  const seenUrls = new Set<string>()

  // Google News first (most relevant for real-time queries)
  if (news.status === 'fulfilled') {
    for (const r of news.value) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r) }
    }
  }
  // Then Wikipedia (most stable for facts)
  if (wiki.status === 'fulfilled') {
    for (const r of wiki.value) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r) }
    }
  }
  // Then DuckDuckGo (quick answers)
  if (ddg.status === 'fulfilled') {
    for (const r of ddg.value) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r) }
    }
  }
  // Then z-ai (bonus)
  if (zai.status === 'fulfilled') {
    for (const r of zai.value) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r) }
    }
  }

  if (allResults.length === 0) return { context: '', sourceCount: 0 }

  const context = allResults
    .slice(0, 6)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Sumber: ${r.source}`)
    .join('\n\n')

  return { context, sourceCount: allResults.length }
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
  const systemInstruction = buildInstruction(body.prefs, body.behaviorProfile, body.insights, body.memory)

  // Check if web search is needed
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  let searchContext = ''
  let searchFailed = false
  let searchSourceCount = 0

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
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

  let fullSystem: string
  if (searchContext) {
    fullSystem = `${systemInstruction}

REAL-TIME DATA (${searchSourceCount} sources):
${searchContext}

Use this real-time data. Cite source names. Current date: ${new Date().toISOString().split('T')[0]}.`
  } else if (searchFailed) {
    fullSystem = `${systemInstruction}

CRITICAL: Web search failed. Do NOT use training data for current events. Tell user: "Maaf, pencarian internet bermasalah. Coba lagi sebentar." Never present old data as current.`
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

      if (searchContext) send({ searchPerformed: true, sources: searchSourceCount })
      else if (searchFailed) send({ searchFailed: true })

      const ok = await streamChat(messages, (delta) => send({ content: delta }))
      if (!ok) send({ content: '*(Maaf, AI bermasalah. Coba lagi ya.)*' })

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
    'Always use correct spelling, grammar, and punctuation.',
  ]

  const toneMap: Record<string, string> = {
    santai: 'Style: casual and friendly. Use "kamu".',
    akrab: 'Style: very warm. Use "kamu".',
    profesional: 'Style: professional. Use "Anda".',
    formal: 'Style: formal. Use "Anda".',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  const verbMap: Record<string, string> = {
    ringkas: 'Length: concise, max 2-3 sentences.',
    seimbang: 'Length: balanced, use bullet points for complex topics.',
    rinci: 'Length: detailed, headings and bullet points.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: disabled.',
    sedikit: 'Humor: occasional.',
    sering: 'Humor: playful and witty.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  if (p.empathy) parts.push('Respond with empathy.')
  if (p.critical) parts.push('Be critically honest.')

  if (behaviorProfile?.trim()) {
    parts.push(`USER BEHAVIOR PROFILE:\n${behaviorProfile.trim()}`)
  }
  if (insights?.length) {
    parts.push(`USER INSIGHTS:\n${insights.map((i) => `- ${i}`).join('\n')}`)
  }
  if (memory?.length) {
    parts.push(`USER MEMORY:\n${memory.slice(0, 15).map((m: any) => `- ${m.content}`).join('\n')}`)
  }

  parts.push('Be natural, warm, and genuinely helpful.')
  return parts.join('\n')
}
