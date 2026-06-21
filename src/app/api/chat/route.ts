import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint with enhanced web search.
 *
 * Features:
 * - Dynamic system instruction from user preferences
 * - Enhanced web search: multi-query + page content extraction
 * - Builder identity: Wensy Corp (Epong)
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

// Comprehensive keywords that suggest the user needs real-time data
const REALTIME_PATTERNS: RegExp[] = [
  // Time-based (ID + EN)
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|tahun ini|minggu ini|bulan ini|kemarin/i,
  /latest|today|current|recent|right now|this week|this month|this year|yesterday/i,
  // News/update
  /berita|news|update|updates|pengumuman|umumkan/i,
  // Real-time data
  /harga|price|cuaca|weather|suhu|saham|stock|bitcoin|crypto|kurs|dollar|nilai tukar/i,
  // Events
  /jadwal|schedule|result|hasil|skor|score|pertandingan|match|turnamen/i,
  // Trending
  /trending|viral|populer|hot|ramai/i,
  // Years (current data)
  /\b202[4-9]\b/i,
  // Questions about current state
  /apa yang sedang|what.*happening|what.*going on/i,
  // People/orgs current status
  /status terbaru|kondisi sekarang|perkembangan/i,
]

function needsWebSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((pattern) => pattern.test(text))
}

interface SearchResult {
  title: string
  snippet: string
  url: string
  source: string
}

/**
 * Enhanced web search: runs multiple query variations + extracts full page
 * content from the top 2 results for maximum accuracy.
 */
async function enhancedWebSearch(userQuery: string): Promise<{
  context: string
  sourceCount: number
  pagesRead: number
}> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    // Strategy: search with original query + a refined "latest" variant
    const queries = [
      userQuery.trim(),
      `${userQuery.trim()} latest 2026`,
    ]

    // Run searches in parallel
    const searchPromises = queries.map((q) =>
      zai.functions.invoke('web_search', { query: q, num: 5 }).catch(() => [])
    )
    const searchResults = await Promise.all(searchPromises)

    // Merge + deduplicate results by URL
    const allResults: SearchResult[] = []
    const seenUrls = new Set<string>()

    for (const results of searchResults) {
      if (!Array.isArray(results)) continue
      for (const r of results) {
        const url = r.url || ''
        if (!url || seenUrls.has(url)) continue
        seenUrls.add(url)
        allResults.push({
          title: r.name || 'Untitled',
          snippet: r.snippet || '',
          url,
          source: r.host_name || new URL(url).hostname,
        })
      }
    }

    if (allResults.length === 0) {
      return { context: '', sourceCount: 0, pagesRead: 0 }
    }

    // Sort by relevance: prefer results with date, longer snippets
    allResults.sort((a, b) => {
      const aScore = (a.snippet.length > 100 ? 1 : 0) + (a.title.length > 10 ? 1 : 0)
      const bScore = (b.snippet.length > 100 ? 1 : 0) + (b.title.length > 10 ? 1 : 0)
      return bScore - aScore
    })

    // Take top 5 results for snippets
    const topResults = allResults.slice(0, 5)

    // Read full content from the top 2 most relevant pages (parallel)
    const pageReadPromises = topResults.slice(0, 2).map(async (r) => {
      try {
        const pageResult: any = await zai.functions.invoke('page_reader', { url: r.url })
        const data = pageResult?.data || pageResult
        const text = extractPlainText(data?.html || data?.text || '')
        return {
          title: data?.title || r.title,
          url: r.url,
          source: r.source,
          text: text.slice(0, 1500), // limit to 1500 chars per page
          publishedTime: data?.publishedTime || data?.publish_time || '',
        }
      } catch {
        return null
      }
    })
    const pageContents = (await Promise.all(pageReadPromises)).filter(Boolean)

    // Build the context for the AI
    let context = `WEB SEARCH RESULTS for "${userQuery}" — ${allResults.length} sources found.\n\n`

    // Add full page content (most valuable)
    if (pageContents.length > 0) {
      context += '=== FULL ARTICLE CONTENT (extracted from top sources) ===\n\n'
      for (const page of pageContents) {
        context += `📄 ${page.title}\n`
        context += `   Source: ${page.source}\n`
        if (page.publishedTime) context += `   Published: ${page.publishedTime}\n`
        context += `   URL: ${page.url}\n`
        context += `   Content:\n   ${page.text.replace(/\n/g, '\n   ')}\n\n`
      }
    }

    // Add snippets from remaining results
    const snippetOnly = topResults.filter(
      (r) => !pageContents.some((p) => p?.url === r.url)
    )
    if (snippetOnly.length > 0) {
      context += '=== ADDITIONAL SOURCES (snippets) ===\n\n'
      for (const r of snippetOnly) {
        context += `• ${r.title}\n  ${r.snippet}\n  Source: ${r.source}\n\n`
      }
    }

    context += `=== INSTRUCTIONS ===\nUse the above real-time data to answer the user's question. Cite sources when relevant (mention the source name). If the data is insufficient, say so honestly. Current date: ${new Date().toISOString().split('T')[0]}`

    return {
      context,
      sourceCount: allResults.length,
      pagesRead: pageContents.length,
    }
  } catch (e: any) {
    console.error('[chat] enhanced web search failed:', e?.message)
    return { context: '', sourceCount: 0, pagesRead: 0 }
  }
}

/** Strip HTML tags and return clean text */
function extractPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    prefs?: Preferences | null
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemInstruction = buildInstruction(body.prefs)

  // Check if the latest user message needs real-time data
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  let searchContext = ''
  let searchInfo = { sourceCount: 0, pagesRead: 0 }

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    const result = await enhancedWebSearch(lastUserMsg.content)
    searchContext = result.context
    searchInfo = { sourceCount: result.sourceCount, pagesRead: result.pagesRead }
  }

  const fullSystem = searchContext
    ? `${systemInstruction}\n\n${searchContext}`
    : systemInstruction

  const messages: ApiMessage[] = [
    { role: 'system', content: fullSystem },
    ...incoming.slice(-20),
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      // Notify client that web search was performed (with stats)
      if (searchContext) {
        send({
          searchPerformed: true,
          sources: searchInfo.sourceCount,
          pagesRead: searchInfo.pagesRead,
        })
      }

      const ok = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!ok) {
        send({
          content:
            '*(Maaf, AI provider sedang bermasalah. Coba lagi sebentar ya.)*',
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

/**
 * Build a dynamic system instruction from user preferences + builder identity.
 */
function buildInstruction(prefs?: Preferences | null): string {
  const p = prefs || {}
  const parts: string[] = [
    'You are Epong AI, a helpful AI assistant built by Wensy Corp (Epong) — a handsome guy from Mbodong and Waemata, Labuan Bajo.',
    'Detect the language the user speaks and respond in that same language.',
    'Always use correct spelling, grammar, and punctuation — never mirror the user\'s typos or slang spelling.',
  ]

  const toneMap: Record<string, string> = {
    santai: 'Communication style: casual and friendly, like a smart friend. Use informal pronouns (e.g. "kamu" in Indonesian).',
    akrab: 'Communication style: very warm and close, like a best friend. Use informal pronouns.',
    profesional: 'Communication style: professional but approachable. Use formal pronouns (e.g. "Anda" in Indonesian).',
    formal: 'Communication style: formal and respectful. Use formal pronouns and complete sentences.',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  const verbMap: Record<string, string> = {
    ringkas: 'Length: concise and to the point. Max 2-3 sentences for simple questions.',
    seimbang: 'Length: balanced — enough detail to help, but not verbose. Use bullet points for complex topics.',
    rinci: 'Length: detailed and thorough when the topic warrants it. Structure with headings and bullet points.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: disabled. Stay serious and direct.',
    sedikit: 'Humor: occasional light humor (about 1 in 4 messages), but never during serious or sad topics.',
    sering: 'Humor: be playful and witty when appropriate. Use creative analogies. But stay helpful, not a joke machine.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  if (p.empathy) {
    parts.push(
      'Emotional intelligence: before answering, read the user\'s emotion from their message. ' +
      'If they seem sad/stressed, validate their feelings briefly first, then help. ' +
      'If enthusiastic, match their energy. Be authentic, not a scripted robot.'
    )
  }

  if (p.critical) {
    parts.push(
      'Critical thinking: don\'t just agree. If the user\'s idea has issues, ' +
      'mention it respectfully and explain why. Offer alternative perspectives. ' +
      'Be honest and constructive — include solutions, not just problems.'
    )
  }

  parts.push('When using web search data, always cite the source name (e.g. "menurut detikcom...").')
  parts.push('Be natural, warm, and genuinely helpful.')

  return parts.join('\n')
}
