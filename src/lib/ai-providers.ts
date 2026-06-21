import type { ApiMessage } from './types'

/**
 * AI provider abstraction with smart fallback.
 *
 * Provider order (when `preferred === 'auto'`):
 *   1. Groq (if GROQ_API_KEY set) — fastest (Llama 3.3 70B, ~500 tok/s)
 *   2. OpenRouter (if OPENROUTER_API_KEY set) — many models
 *   3. GLM / Zhipu (if GLM_API_KEY set)
 *   4. z-ai-web-dev-sdk — built-in last resort
 *
 * If a provider fails, the next is tried automatically. Both streaming and
 * non-streaming variants are exposed.
 */

export type Provider = 'auto' | 'glm' | 'openrouter' | 'groq'

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-oss-120b:free'
const GLM_DEFAULT_MODEL = 'glm-4.5-flash'
const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile'
const REQUEST_TIMEOUT_MS = 6000

// ── Public API ──

/**
 * Stream a chat completion. Calls `onDelta` for each text chunk.
 * Returns true if any provider succeeded, false if all failed.
 */
export async function streamChat(
  messages: ApiMessage[],
  preferred: Provider,
  onDelta: (text: string) => void
): Promise<boolean> {
  const trimmed = trimHistory(messages)
  for (const provider of resolveOrder(preferred)) {
    try {
      if (provider === 'groq') {
        await streamFromGroq(trimmed, onDelta)
      } else if (provider === 'openrouter') {
        await streamFromOpenRouter(trimmed, onDelta)
      } else if (provider === 'glm') {
        await streamFromGLM(trimmed, onDelta)
      }
      return true
    } catch (e: any) {
      console.error(`[ai] ${provider} stream failed:`, e?.message)
    }
  }
  // Last resort: z-ai SDK
  try {
    await streamFromZAI(trimmed, onDelta)
    return true
  } catch (e: any) {
    console.error('[ai] z-ai stream failed:', e?.message)
    return false
  }
}

/**
 * Non-streaming chat completion. Returns the full text, or '' if all fail.
 */
export async function completeChat(
  messages: ApiMessage[],
  preferred: Provider
): Promise<string> {
  const trimmed = trimHistory(messages)
  for (const provider of resolveOrder(preferred)) {
    try {
      if (provider === 'groq') {
        return await completeFromGroq(trimmed)
      } else if (provider === 'openrouter') {
        return await completeFromOpenRouter(trimmed)
      } else if (provider === 'glm') {
        return await completeFromGLM(trimmed)
      }
    } catch (e: any) {
      console.error(`[ai] ${provider} complete failed:`, e?.message)
    }
  }
  try {
    return await completeFromZAI(trimmed)
  } catch (e: any) {
    console.error('[ai] z-ai complete failed:', e?.message)
    return ''
  }
}

// ── Helpers ──

function trimHistory(messages: ApiMessage[]): ApiMessage[] {
  return messages.slice(-MAX_HISTORY)
}

function resolveOrder(preferred: Provider): Provider[] {
  const hasGroq = !!process.env.GROQ_API_KEY
  const hasOR = !!process.env.OPENROUTER_API_KEY
  const hasGLM = !!process.env.GLM_API_KEY
  if (preferred === 'groq') {
    return [hasGroq && 'groq', hasOR && 'openrouter', hasGLM && 'glm'].filter(Boolean) as Provider[]
  }
  if (preferred === 'glm') {
    return [hasGLM && 'glm', hasGroq && 'groq', hasOR && 'openrouter'].filter(Boolean) as Provider[]
  }
  if (preferred === 'openrouter') {
    return [hasOR && 'openrouter', hasGroq && 'groq', hasGLM && 'glm'].filter(Boolean) as Provider[]
  }
  // auto: Groq first (fastest), then OpenRouter, then GLM
  return [hasGroq && 'groq', hasOR && 'openrouter', hasGLM && 'glm'].filter(Boolean) as Provider[]
}

/** Parse a Server-Sent Events stream, calling onDelta for each content chunk. */
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<void> {
  const reader = body.getReader()
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
        if (delta) onDelta(delta)
      } catch {
        /* ignore partial json */
      }
    }
  }
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

// ── OpenRouter ──

async function streamFromOpenRouter(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'Epong AI',
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromOpenRouter(
  messages: ApiMessage[]
): Promise<string> {
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'Epong AI',
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── Groq (fastest — Llama 3.3 70B at ~500 tok/s) ──

async function streamFromGroq(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromGroq(messages: ApiMessage[]): Promise<string> {
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── GLM (Zhipu) ──

async function streamFromGLM(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const base = process.env.GLM_BASE_URL || GLM_BASE_URL
  const model = process.env.GLM_MODEL || GLM_DEFAULT_MODEL
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
    throw new Error(`GLM ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromGLM(messages: ApiMessage[]): Promise<string> {
  const base = process.env.GLM_BASE_URL || GLM_BASE_URL
  const model = process.env.GLM_MODEL || GLM_DEFAULT_MODEL
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GLM_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── z-ai SDK (built-in preview fallback) ──

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
  onDelta: (text: string) => void
): Promise<void> {
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  const zai = await ZAI.create()
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
          if (delta) onDelta(delta)
        } catch {
          /* ignore */
        }
      }
    }
  } else {
    const content = completion?.choices?.[0]?.message?.content
    if (content) onDelta(content)
  }
}

async function completeFromZAI(messages: ApiMessage[]): Promise<string> {
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  const zai = await ZAI.create()
  const completion: any = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  } as any)
  return completion?.choices?.[0]?.message?.content || ''
}
