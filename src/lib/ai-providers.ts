import type { ApiMessage } from './types'

/**
 * AI provider abstraction.
 *
 * Uses OpenRouter as the primary provider (100+ models, flexible, reliable).
 * Falls back to the z-ai-web-dev-sdk (built-in) if OpenRouter is unavailable.
 *
 * Env vars:
 *   OPENROUTER_API_KEY  — required for OpenRouter
 *   OPENROUTER_MODEL    — optional, default: openai/gpt-oss-120b:free
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_DEFAULT_MODEL = 'qwen/qwen-2.5-72b-instruct:free'
const REQUEST_TIMEOUT_MS = 6000

// ── Public API ──

/**
 * Stream a chat completion. Calls `onDelta` for each text chunk.
 * Returns true if any provider succeeded, false if all failed.
 */
export async function streamChat(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<boolean> {
  const trimmed = trimHistory(messages)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamFromOpenRouter(trimmed, onDelta)
      return true
    } catch (e: any) {
      console.error('[ai] OpenRouter stream failed:', e?.message)
    }
  }
  // Fallback: z-ai SDK
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
  messages: ApiMessage[]
): Promise<string> {
  const trimmed = trimHistory(messages)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await completeFromOpenRouter(trimmed)
    } catch (e: any) {
      console.error('[ai] OpenRouter complete failed:', e?.message)
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

// ── z-ai SDK (built-in fallback) ──

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
