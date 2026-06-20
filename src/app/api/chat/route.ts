import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { buildSystemPrompt } from '@/lib/prompt'
import type { Preferences, MemoryNote } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint with smart multi-provider switching.
 *
 * Providers (tried in order based on availability + user preference):
 *  1. GLM (Zhipu AI)  — when GLM_API_KEY is set
 *  2. OpenRouter      — when OPENROUTER_API_KEY is set (access many models)
 *  3. z-ai-web-dev-sdk — built-in preview fallback (always available here)
 *
 * If a provider fails, it automatically falls back to the next — so the bot
 * always responds. The client can hint a preferred provider via `provider`.
 *
 * Response: Server-Sent Events stream of text deltas:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

type Provider = 'auto' | 'glm' | 'openrouter'

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
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  // Build the dynamic system prompt from user prefs + memory + behavior
  const systemPrompt = buildSystemPrompt(
    body.prefs ?? null,
    body.memory ?? null,
    body.behaviorProfile ?? null
  )
  // Trim history (last 20) for token safety
  const history = incoming.slice(-20)
  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ]

  // Determine provider order based on user preference + what's configured
  const preferred = body.provider || 'auto'
  const hasGLM = !!process.env.GLM_API_KEY
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY

  // Build the ordered list of providers to try
  const providers: Provider[] = []
  if (preferred === 'glm') {
    if (hasGLM) providers.push('glm')
    if (hasOpenRouter) providers.push('openrouter')
  } else if (preferred === 'openrouter') {
    if (hasOpenRouter) providers.push('openrouter')
    if (hasGLM) providers.push('glm')
  } else {
    // auto: try GLM first (familiar), then OpenRouter
    if (hasGLM) providers.push('glm')
    if (hasOpenRouter) providers.push('openrouter')
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        )

      let success = false

      // ---- Try each configured provider in order ----
      for (const provider of providers) {
        if (success) break
        try {
          if (provider === 'glm') {
            await streamFromGLM(messages, send)
          } else if (provider === 'openrouter') {
            await streamFromOpenRouter(messages, send)
          }
          success = true
        } catch (e: any) {
          console.error(`[chat] ${provider} failed:`, e?.message)
          // continue to next provider
        }
      }

      // ---- Final fallback: z-ai-web-dev-sdk (always available in preview) ----
      if (!success) {
        try {
          await streamFromZAI(messages, send)
          success = true
        } catch (e: any) {
          console.error('[chat] z-ai SDK failed:', e?.message)
        }
      }

      if (!success) {
        send({
          content: `*(Maaf, semua AI provider sedang bermasalah. Coba lagi sebentar ya.)*`,
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

// ----------------------------------------------------------- direct GLM call

async function streamFromGLM(
  messages: ApiMessage[],
  send: (obj: unknown) => void
) {
  const base = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
  const model = process.env.GLM_MODEL || 'glm-4.5-flash'
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
    throw new Error(`GLM ${res.status}: ${text.slice(0, 200)}`)
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

// ----------------------------------------------------------- OpenRouter call

async function streamFromOpenRouter(
  messages: ApiMessage[],
  send: (obj: unknown) => void
) {
  const base = 'https://openrouter.ai/api/v1'
  // Default to a strong free model; override with OPENROUTER_MODEL env var
  const model =
    process.env.OPENROUTER_MODEL ||
    'meta-llama/llama-3.3-70b-instruct:free'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      // OpenRouter recommends these for ranking/identification
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'Epong AI',
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
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
      const content = completion?.choices?.[0]?.message?.content
      if (content) {
        emitted = true
        send({ content })
      }
    }
  } catch {
    /* fall through to non-streaming fallback */
  }

  if (!emitted) {
    const completion: any = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    } as any)
    const content = completion?.choices?.[0]?.message?.content || ''
    if (content) send({ content })
  }
}
