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
 * Features:
 * - Dynamic system instruction from user preferences
 * - Auto web search for real-time questions
 * - Builder identity: Wensy Corp (Epong)
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

// Keywords that suggest the user needs real-time / current information
const REALTIME_KEYWORDS = [
  'terbaru', 'hari ini', 'sekarang', 'tahun ini', 'baru saja', 'latest', 'today',
  'current', 'recent', 'news', 'berita', 'update', 'sekarang ini', 'saat ini',
  'kini', 'terkini', 'harga', 'cuaca', 'saham', 'bitcoin', 'crypto',
  'jadwal', 'result', 'skor', 'trending', 'viral', '2024', '2025', '2026',
]

function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase()
  return REALTIME_KEYWORDS.some((kw) => lower.includes(kw))
}

async function doWebSearch(query: string): Promise<string> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query,
      num: 5,
    })
    if (!Array.isArray(results) || results.length === 0) return ''
    const formatted = results
      .map((r: any, i: number) => `${i + 1}. ${r.name}\n   ${r.snippet || ''}\n   Sumber: ${r.url}`)
      .join('\n\n')
    return formatted
  } catch (e: any) {
    console.error('[chat] web search failed:', e?.message)
    return ''
  }
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
  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    searchContext = await doWebSearch(lastUserMsg.content)
  }

  const fullSystem = searchContext
    ? `${systemInstruction}\n\nREAL-TIME WEB SEARCH RESULTS (use this data to answer, cite sources when relevant):\n${searchContext}`
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

      // Notify client that web search was performed
      if (searchContext) {
        send({ searchPerformed: true })
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

  // Tone
  const toneMap: Record<string, string> = {
    santai: 'Communication style: casual and friendly, like a smart friend. Use informal pronouns (e.g. "kamu" in Indonesian).',
    akrab: 'Communication style: very warm and close, like a best friend. Use informal pronouns.',
    profesional: 'Communication style: professional but approachable. Use formal pronouns (e.g. "Anda" in Indonesian).',
    formal: 'Communication style: formal and respectful. Use formal pronouns and complete sentences.',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  // Verbosity
  const verbMap: Record<string, string> = {
    ringkas: 'Length: concise and to the point. Max 2-3 sentences for simple questions.',
    seimbang: 'Length: balanced — enough detail to help, but not verbose. Use bullet points for complex topics.',
    rinci: 'Length: detailed and thorough when the topic warrants it. Structure with headings and bullet points.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  // Humor
  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: disabled. Stay serious and direct.',
    sedikit: 'Humor: occasional light humor (about 1 in 4 messages), but never during serious or sad topics.',
    sering: 'Humor: be playful and witty when appropriate. Use creative analogies. But stay helpful, not a joke machine.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  // Empathy
  if (p.empathy) {
    parts.push(
      'Emotional intelligence: before answering, read the user\'s emotion from their message. ' +
      'If they seem sad/stressed, validate their feelings briefly first, then help. ' +
      'If enthusiastic, match their energy. Be authentic, not a scripted robot.'
    )
  }

  // Critical thinking
  if (p.critical) {
    parts.push(
      'Critical thinking: don\'t just agree. If the user\'s idea has issues, ' +
      'mention it respectfully and explain why. Offer alternative perspectives. ' +
      'Be honest and constructive — include solutions, not just problems.'
    )
  }

  parts.push('Be natural, warm, and genuinely helpful.')

  return parts.join('\n')
}
