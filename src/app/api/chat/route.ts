import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

// Keywords that suggest the user needs real-time data
const REALTIME_PATTERNS = [
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|kemarin/i,
  /latest|today|current|recent|right now|yesterday/i,
  /berita|news|update|pengumuman/i,
  /harga|price|cuaca|weather|saham|stock|bitcoin|crypto|kurs/i,
  /jadwal|schedule|result|hasil|skor|score|pertandingan/i,
  /trending|viral|populer/i,
  /\b202[4-9]\b/i,
  /apa yang sedang|what.*happening/i,
  /status terbaru|kondisi sekarang|perkembangan/i,
]

function needsWebSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((p) => p.test(text))
}

async function quickWebSearch(query: string): Promise<string> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num: 3 })
    if (!Array.isArray(results) || results.length === 0) return ''
    return results
      .map((r: any, i: number) => `${i + 1}. ${r.name}\n   ${r.snippet || ''}\n   Sumber: ${r.url}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[]; prefs?: Preferences | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemInstruction = buildInstruction(body.prefs)

  // Check if web search needed — but run it FAST (single query, 3 results, no page reading)
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  let searchContext = ''
  let searchFailed = false

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    searchContext = await Promise.race([
      quickWebSearch(lastUserMsg.content),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000)),
    ])
    if (!searchContext) searchFailed = true
  }

  let fullSystem: string
  if (searchContext) {
    fullSystem = `${systemInstruction}\n\nREAL-TIME WEB SEARCH RESULTS:\n${searchContext}\n\nUse this data. Cite sources. Current date: ${new Date().toISOString().split('T')[0]}`
  } else if (searchFailed) {
    fullSystem = `${systemInstruction}\n\nNOTE: Web search was needed but failed. Do NOT use training data for current events. Tell user: "Maaf, pencarian internet sedang bermasalah, coba lagi sebentar."`
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
        send({ searchPerformed: true })
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
