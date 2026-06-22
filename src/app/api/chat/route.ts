import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import {
  gatherRealtimeContext,
  buildRealtimePrompt,
} from '@/lib/realtime'
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

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[]; prefs?: Preferences | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemInstruction = buildInstruction(body.prefs)

  // ── Read user intention: decide if realtime web data is needed ──
  // Uses LLM-based intent detection (primary) with regex fallback.
  // Runs search + optional page reading in parallel when needed.
  const realtimeCtx = await gatherRealtimeContext(incoming)
  const realtimePrompt = buildRealtimePrompt(realtimeCtx)

  const fullSystem = realtimePrompt
    ? `${systemInstruction}${realtimePrompt}`
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

      // Tell the frontend a search is happening (so it can show the 🔍 indicator)
      if (realtimeCtx.performed) {
        send({
          searchPerformed: true,
          sources: realtimeCtx.sourceCount,
          pagesRead: realtimeCtx.pagesRead,
          query: realtimeCtx.query,
        })
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
  const today = new Date().toISOString().split('T')[0]
  const parts: string[] = [
    'You are Epong AI, a helpful AI assistant built by Wensy Corp (Epong) — a handsome guy from Mbodong and Waemata, Labuan Bajo.',
    `Today's date is ${today}. Your training data has a cutoff, so for anything time-sensitive (news, prices, events, current people in roles), rely on the provided web search results.`,
    'Detect the language the user speaks and respond in that same language.',
    'Always use correct spelling, grammar, and punctuation — never mirror the user\'s typos.',
    'When you use web search results, cite sources naturally (e.g., "menurut [1]" or "berdasarkan sumber dari detik.com"). Be transparent that the info came from a web search.',
    'If the user asks about something current but you don\'t have search results, honestly say you don\'t have the latest info rather than guessing.',
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
