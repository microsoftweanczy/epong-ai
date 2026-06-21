import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Uses OpenRouter (primary) with z-ai SDK fallback via `streamChat()`.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

const SYSTEM_INSTRUCTION =
  'You are a helpful AI assistant. Follow these rules:\n' +
  '1. Detect the language the user speaks and respond in that same language.\n' +
  '2. Match the user\'s communication style: if they are formal, be formal; if casual and friendly, be casual and friendly; if concise, be concise; if detailed, be detailed.\n' +
  '3. Always use correct spelling, grammar, and punctuation — never mirror typos, slang spelling, or broken grammar.\n' +
  '4. Match the user\'s energy: if enthusiastic, be enthusiastic; if serious, be serious; if playful, be playful.\n' +
  '5. Be natural, warm, and genuinely helpful — not robotic.'

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const messages: ApiMessage[] = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...incoming.slice(-20),
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

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
