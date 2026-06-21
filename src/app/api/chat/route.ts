import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat, type Provider } from '@/lib/ai-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Sends a minimal system instruction (use proper language, don't mirror
 * the user's typos) + the conversation history to the AI provider.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

const SYSTEM_INSTRUCTION =
  'Always respond with correct spelling, grammar, and punctuation. ' +
  'Never mirror or imitate the user\'s typos, abbreviations, or informal shortcuts. ' +
  'Respond in the language the user is using (Indonesian or English). ' +
  'Be helpful, clear, and natural.'

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    provider?: Provider
  }
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
  const preferred: Provider = body.provider || 'auto'

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      const ok = await streamChat(messages, preferred, (delta) =>
        send({ content: delta })
      )

      if (!ok) {
        send({
          content:
            '*(Maaf, semua AI provider sedang bermasalah. Coba lagi sebentar ya.)*',
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
