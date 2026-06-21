import type { ApiMessage } from './types'

/**
 * AI provider abstraction.
 * GLM (primary) → z-ai SDK (fallback).
 *
 * GLM 4.5 Flash: best Indonesian quality, works from all regions
 * z-ai SDK: built-in preview fallback (always available)
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200
const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const GLM_DEFAULT_MODEL = 'glm-4.5-flash'

export async function streamChat(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<boolean> {
  const trimmed = messages.slice(-MAX_HISTORY)

  // Primary: GLM
  if (process.env.GLM_API_KEY) {
    try {
      await streamFromGLM(trimmed, onDelta)
      return true
    } catch (e: any) {
      console.error('[ai] GLM failed:', e?.message)
    }
  }

  // Fallback: z-ai SDK
  try {
    await streamFromZAI(trimmed, onDelta)
    return true
  } catch (e: any) {
    console.error('[ai] z-ai failed:', e?.message)
    return false
  }
}

export async function completeChat(
  messages: ApiMessage[]
): Promise<string> {
  const trimmed = messages.slice(-MAX_HISTORY)

  if (process.env.GLM_API_KEY) {
    try {
      return await completeFromGLM(trimmed)
    } catch (e: any) {
      console.error('[ai] GLM complete failed:', e?.message)
    }
  }

  try {
    return await completeFromZAI(trimmed)
  } catch (e: any) {
    console.error('[ai] z-ai complete failed:', e?.message)
    return ''
  }
}

// ── SSE parser ──

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
        /* ignore */
      }
    }
  }
}

// ── GLM ──

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
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
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
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── z-ai SDK ──

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
