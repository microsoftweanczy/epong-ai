import type { ApiMessage } from './types'

/**
 * AI provider abstraction.
 *
 * Primary: GLM (via DashScope compatible endpoint) — best Indonesian quality.
 * Fallback 1: z-ai SDK (built-in).
 * Fallback 2: OpenRouter (optional, env-driven).
 *
 * Env vars:
 *   GLM_API_KEY     — GLM/DashScope API key (if unset, built-in fallback key used)
 *   GLM_MODEL       — optional, default: qwen3.6-flash
 *   GLM_BASE_URL    — optional, default: DashScope compatible-mode endpoint
 *   OPENROUTER_API_KEY  — optional fallback
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200

// GLM via DashScope (Qwen Cloud) — OpenAI-compatible endpoint
const GLM_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const GLM_DEFAULT_MODEL = 'qwen3.6-flash'
// Built-in fallback key (used if GLM_API_KEY env var is not set)
const GLM_FALLBACK_KEY = 'sk-ws-H.IYYPHR.dM6s.MEUCID8hSB15TQhZO_RutoErcWE0dXcb5lmQKeeyc319DpGbAiEA4sHr-BtPdLPDyi6TBfqCUNREaPSpusiiUoRxFBDycWM'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const REQUEST_TIMEOUT_MS = 6000
const STREAM_TIMEOUT_MS = 60_000

function getGLMKey(): string {
  return process.env.GLM_API_KEY || GLM_FALLBACK_KEY
}

function getGLMBase(): string {
  return process.env.GLM_BASE_URL || GLM_BASE_URL
}

function getGLMModel(): string {
  return process.env.GLM_MODEL || GLM_DEFAULT_MODEL
}

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

  // Primary: GLM via DashScope (always available — has built-in fallback key)
  try {
    await streamFromGLM(trimmed, onDelta)
    return true
  } catch (e: any) {
    console.error('[ai] GLM stream failed:', e?.message)
  }

  // Fallback 1: OpenRouter (optional)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamFromOpenRouter(trimmed, onDelta)
      return true
    } catch (e: any) {
      console.error('[ai] OpenRouter stream failed:', e?.message)
    }
  }

  // Fallback 2: z-ai SDK
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

  // Primary: GLM via DashScope (always available)
  try {
    return await completeFromGLM(trimmed)
  } catch (e: any) {
    console.error('[ai] GLM complete failed:', e?.message)
  }

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

// ── GLM via DashScope — primary, best Indonesian ──

async function streamFromGLM(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const base = getGLMBase()
  const model = getGLMModel()
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGLMKey()}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromGLM(messages: ApiMessage[]): Promise<string> {
  const base = getGLMBase()
  const model = getGLMModel()
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGLMKey()}`,
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  // Note: GLM/Qwen models may return reasoning_content separately — we only want content
  return data?.choices?.[0]?.message?.content || ''
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
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
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

async function streamFromZAI(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  const zai = await ZAI.create()

  // IMPORTANT: The z-ai SDK's streaming mode drops characters (produces garbled
  // text like "menjab" instead of "menjabat"). Using non-streaming mode gives
  // perfect quality. We fetch the full response, then emit it in small chunks
  // so the client still sees a "typing" effect.
  const completion: any = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  } as any)

  const fullText: string = completion?.choices?.[0]?.message?.content || ''
  if (!fullText) return

  // Emit in word-sized chunks for a natural streaming feel, without losing chars.
  const words = fullText.split(/(\s+)/) // keep whitespace tokens
  for (const word of words) {
    onDelta(word)
    // Tiny yield so the UI updates progressively (non-blocking)
    if (word.trim()) {
      await new Promise((r) => setTimeout(r, 12))
    }
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
