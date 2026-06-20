import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Streaming chat completion endpoint powered by GLM.
 *
 * Two backends, picked automatically:
 *  1. If GLM_API_KEY (and optionally GLM_BASE_URL) is set -> direct call to the
 *     OpenAI-compatible GLM endpoint. This is what you use on Vercel with your
 *     own free GLM API key from https://open.bigmodel.cn
 *  2. Otherwise -> the z-ai-web-dev-sdk (works in this preview environment).
 *
 * Response: Server-Sent Events stream of text deltas:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

const SYSTEM_PROMPT =
  'Kamu adalah Epong AI, asisten AI pribadi yang hangat dan ringkas. ' +
  'Selalu jawab dalam Bahasa Indonesia yang natural dan ramah. ' +
  'Jawab dengan jelas dan membantu. Gunakan Markdown untuk struktur jika perlu. ' +
  'Jaga agar respons tetap fokus dan bersahabat.'

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[]; conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  // Build the message list: system + trimmed history (last 20) for token safety
  const history = incoming.slice(-20)
  const messages: ApiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        )

      try {
        // ---- Branch 1: direct GLM API (production / Vercel) ----
        if (process.env.GLM_API_KEY) {
          await streamFromGLM(messages, send)
        } else {
          // ---- Branch 2: z-ai-web-dev-sdk (preview) ----
          await streamFromZAI(messages, send)
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e: any) {
        send({ error: e?.message || 'Generation failed' })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        controller.close()
      }
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

// ----------------------------------------------------------- direct GLM call

async function streamFromGLM(
  messages: ApiMessage[],
  send: (obj: unknown) => void
) {
  const base = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
  const model = process.env.GLM_MODEL || 'glm-4-flash' // free tier model
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GLM_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`GLM API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) send({ content: delta })
      } catch {
        /* ignore partial json */
      }
    }
  }
}

// ----------------------------------------------------------- z-ai SDK (preview)

function decodeChunk(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8')
  if (chunk && typeof chunk === 'object') {
    const vals = Object.values(chunk as Record<string, unknown>)
    if (typeof vals[0] === 'number') {
      return Buffer.from(vals as number[]).toString('utf8')
    }
  }
  return ''
}

async function streamFromZAI(
  messages: ApiMessage[],
  send: (obj: unknown) => void
) {
  // Dynamic import so this only loads when needed (keeps Vercel bundle clean
  // when deploying with a real GLM key).
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  const zai = await ZAI.create()

  let emitted = false

  try {
    const completion: any = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: 'disabled' },
    } as any)

    if (completion && typeof completion[Symbol.asyncIterator] === 'function') {
      // The SDK yields raw SSE text (one or more buffered chunks).
      // Parse every `data:` line and emit the content deltas.
      for await (const chunk of completion as AsyncIterable<unknown>) {
        const text = decodeChunk(chunk)
        for (const line of text.split('\n')) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const payload = t.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload)
            const delta = json?.choices?.[0]?.delta?.content
            if (delta) {
              emitted = true
              send({ content: delta })
            }
          } catch {
            /* ignore partial json */
          }
        }
      }
    } else {
      // Not iterable -> treat as a normal completion object.
      const content = completion?.choices?.[0]?.message?.content
      if (content) {
        emitted = true
        send({ content })
      }
    }
  } catch {
    /* fall through to non-streaming fallback */
  }

  // Fallback: non-streaming completion if nothing was streamed.
  if (!emitted) {
    const completion: any = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    } as any)
    const content = completion?.choices?.[0]?.message?.content || ''
    if (content) send({ content })
  }
}
