import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { buildSystemPrompt } from '@/lib/prompt'
import { streamChat, type Provider } from '@/lib/ai-providers'
import type { Preferences, MemoryNote } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Uses the smart provider chain (OpenRouter → GLM → z-ai SDK) via
 * `streamChat()` from `@/lib/ai-providers`. The client can hint a preferred
 * provider via the `provider` field.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    conversationId?: string
    prefs?: Preferences | null
    memory?: MemoryNote[] | null
    behaviorProfile?: string | null
    provider?: Provider
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const systemPrompt = buildSystemPrompt(
    body.prefs ?? null,
    body.memory ?? null,
    body.behaviorProfile ?? null
  )
  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt },
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
