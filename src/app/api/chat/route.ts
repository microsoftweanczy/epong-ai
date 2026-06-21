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
 * Flow:
 * 1. Detect if user asks about real-time/current info
 * 2. If yes: search web (z-ai SDK → DuckDuckGo fallback) with 6s timeout
 * 3. Inject results into AI context
 * 4. Stream AI response with source citations
 *
 * Anti-hallucination: if search fails, AI is told NOT to use old training data.
 */

// ── Smart detection patterns ──
const REALTIME_PATTERNS: RegExp[] = [
  // Time references (ID + EN)
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|kemarin/i,
  /latest|today|current|recent|right now|yesterday/i,
  // News / updates
  /berita|news|update|pengumuman|umumkan/i,
  // Real-time data
  /harga|price|cuaca|weather|suhu|saham|stock|bitcoin|crypto|kurs|dollar/i,
  // Events / schedules
  /jadwal|schedule|result|hasil|skor|score|pertandingan|match/i,
  // Trending
  /trending|viral|populer/i,
  // Years
  /\b202[4-9]\b/i,
  // Current state questions
  /apa yang sedang|what.*happening|what.*going on/i,
  /status terbaru|kondisi sekarang|perkembangan/i,
  // Specific real-time queries
  /berapa|how much|how many|berapa harga/i,
]

function needsWebSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((p) => p.test(text))
}

// ── Web search: z-ai SDK → DuckDuckGo fallback ──

interface SearchResult {
  title: string
  snippet: string
  url: string
  source: string
}

async function smartWebSearch(query: string): Promise<{
  context: string
  sourceCount: number
}> {
  // Try z-ai SDK first
  let results = await searchViaZAI(query)

  // Fallback: DuckDuckGo (free, no key, works on Vercel)
  if (results.length === 0) {
    results = await searchViaDuckDuckGo(query)
  }

  if (results.length === 0) {
    return { context: '', sourceCount: 0 }
  }

  // Build context string
  const context = results
    .slice(0, 5)
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.snippet}\n   Sumber: ${r.source} (${r.url})`
    )
    .join('\n\n')

  return { context, sourceCount: results.length }
}

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
      source: r.host_name || (r.url ? new URL(r.url).hostname : ''),
    }))
  } catch {
    return []
  }
}

async function searchViaDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return []
    const html = await res.text()
    const results: SearchResult[] = []
    const regex =
      /<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g
    let match
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const rawUrl = match[1] || ''
      const title = match[2].replace(/<[^>]*>/g, '').trim()
      const snippet = match[3].replace(/<[^>]*>/g, '').trim()
      if (!title || !rawUrl) continue
      const url = rawUrl.includes('uddg=')
        ? decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] || rawUrl)
        : rawUrl
      try {
        results.push({
          title,
          snippet: snippet.slice(0, 250),
          url,
          source: new URL(url).hostname,
        })
      } catch {
        // skip invalid URLs
      }
    }
    return results
  } catch {
    return []
  }
}

// ── Main handler ──

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[]; prefs?: Preferences | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemInstruction = buildInstruction(body.prefs)

  // Check if web search is needed
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  let searchContext = ''
  let searchFailed = false
  let searchSourceCount = 0

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    // Run search with 6s timeout
    const searchResult = await Promise.race([
      smartWebSearch(lastUserMsg.content),
      new Promise<{ context: string; sourceCount: number }>((resolve) =>
        setTimeout(() => resolve({ context: '', sourceCount: 0 }), 6000)
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

IMPORTANT: Use the above real-time data to answer. Cite source names (e.g. "menurut detikcom..."). Current date: ${new Date().toISOString().split('T')[0]}.`
  } else if (searchFailed) {
    fullSystem = `${systemInstruction}

CRITICAL: The user is asking about current/recent events, but web search failed. Do NOT use training data for current events — it is outdated. Tell the user honestly: "Maaf, saya tidak bisa mengakses informasi real-time saat ini. Silakan coba lagi sebentar." Never present old data as current.`
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

      // Notify client about search
      if (searchContext) {
        send({ searchPerformed: true, sources: searchSourceCount })
      } else if (searchFailed) {
        send({ searchFailed: true })
      }

      const ok = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!ok) {
        send({
          content:
            '*(Maaf, AI sedang bermasalah. Coba lagi ya.)*',
        })
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

function buildInstruction(prefs?: Preferences | null): string {
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

  parts.push('Be natural, warm, and genuinely helpful.')
  return parts.join('\n')
}
