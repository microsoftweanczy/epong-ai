import type { ApiMessage } from './types'

/**
 * AI provider abstraction.
 *
 * Primary: DeepSeek-V3 via GitHub Models (models.github.ai)
 * Fallback 1: Deepseek direct API (sk-5a7b...)
 * Fallback 2: GLM via DashScope (built-in key)
 * Fallback 3: OpenRouter (optional, env-driven)
 *
 * If ALL providers fail, returns an error message — no z-ai SDK fallback.
 * Each function returns the provider name so the UI can show which API was used.
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200

// GitHub Models — PRIMARY (DeepSeek-V3-0324)
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference'
const GITHUB_MODEL = 'deepseek/DeepSeek-V3-0324'
const GITHUB_TOKEN_FALLBACK = 'REDACTED'

// Deepseek direct API — fallback 1
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat'
const DEEPSEEK_FALLBACK_KEY = 'REDACTED'

// GLM via DashScope — fallback 2
const GLM_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const GLM_DEFAULT_MODEL = 'qwen3.6-flash'
const GLM_FALLBACK_KEY = 'sk-ws-H.IYYPHR.dM6s.MEUCID8hSB15TQhZO_RutoErcWE0dXcb5lmQKeeyc319DpGbAiEA4sHr-BtPdLPDyi6TBfqCUNREaPSpusiiUoRxFBDycWM'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const REQUEST_TIMEOUT_MS = 6000
const STREAM_TIMEOUT_MS = 60_000

function getGithubToken(): string {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN || GITHUB_TOKEN_FALLBACK
}

function getDeepseekKey(): string {
  return process.env.DEEPSEEK_API_KEY || DEEPSEEK_FALLBACK_KEY
}

function getGLMKey(): string {
  return process.env.GLM_API_KEY || GLM_FALLBACK_KEY
}

function getGLMBase(): string {
  return process.env.GLM_BASE_URL || GLM_BASE_URL
}

function getGLMModel(): string {
  return process.env.GLM_MODEL || GLM_DEFAULT_MODEL
}

// ── Public types ──

export interface ChatResult {
  success: boolean
  provider: string // 'Deepseek' | 'GLM' | 'OpenRouter' | ''
  error?: string
}

// ── Public API ──

/**
 * Stream a chat completion. Calls `onDelta` for each text chunk.
 * Returns ChatResult with the provider name (so UI can show which API was used).
 */
export async function streamChat(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<ChatResult> {
  const trimmed = trimHistory(messages)

  // Primary: DeepSeek-V3 via GitHub Models
  try {
    await streamFromGithubModels(trimmed, onDelta)
    return { success: true, provider: 'DeepSeek-V3 (GitHub)' }
  } catch (e: any) {
    console.error('[ai] GitHub Models stream failed:', e?.message)
  }

  // Fallback 1: Deepseek direct API
  try {
    await streamFromDeepseek(trimmed, onDelta)
    return { success: true, provider: 'Deepseek' }
  } catch (e: any) {
    console.error('[ai] Deepseek stream failed:', e?.message)
  }

  // Fallback 2: GLM via DashScope
  try {
    await streamFromGLM(trimmed, onDelta)
    return { success: true, provider: 'GLM' }
  } catch (e: any) {
    console.error('[ai] GLM stream failed:', e?.message)
  }

  // Fallback 3: OpenRouter (optional)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamFromOpenRouter(trimmed, onDelta)
      return { success: true, provider: 'OpenRouter' }
    } catch (e: any) {
      console.error('[ai] OpenRouter stream failed:', e?.message)
    }
  }

  // All providers failed
  return {
    success: false,
    provider: '',
    error: 'Semua API sedang bermasalah. Coba lagi nanti.',
  }
}

/**
 * Non-streaming chat completion. Returns the full text + provider name.
 */
export async function completeChat(
  messages: ApiMessage[]
): Promise<{ text: string; provider: string }> {
  const trimmed = trimHistory(messages)

  // Primary: DeepSeek-V3 via GitHub Models
  try {
    const text = await completeFromGithubModels(trimmed)
    return { text, provider: 'DeepSeek-V3 (GitHub)' }
  } catch (e: any) {
    console.error('[ai] GitHub Models complete failed:', e?.message)
  }

  // Fallback 1: Deepseek direct API
  try {
    const text = await completeFromDeepseek(trimmed)
    return { text, provider: 'Deepseek' }
  } catch (e: any) {
    console.error('[ai] Deepseek complete failed:', e?.message)
  }

  // Fallback 2: GLM via DashScope
  try {
    const text = await completeFromGLM(trimmed)
    return { text, provider: 'GLM' }
  } catch (e: any) {
    console.error('[ai] GLM complete failed:', e?.message)
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const text = await completeFromOpenRouter(trimmed)
      return { text, provider: 'OpenRouter' }
    } catch (e: any) {
      console.error('[ai] OpenRouter complete failed:', e?.message)
    }
  }

  // All failed
  return { text: '', provider: '' }
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

// ── GitHub Models — PRIMARY (DeepSeek-V3-0324) ──
// Uses the GitHub Models inference endpoint (OpenAI-compatible).

async function streamFromGithubModels(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const res = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGithubToken()}`,
    },
    body: JSON.stringify({
      model: GITHUB_MODEL,
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 1.0,
      top_p: 1.0,
    }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub Models ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromGithubModels(messages: ApiMessage[]): Promise<string> {
  const res = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGithubToken()}`,
    },
    body: JSON.stringify({
      model: GITHUB_MODEL,
      messages,
      stream: false,
      max_tokens: 800,
      temperature: 1.0,
      top_p: 1.0,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GitHub Models ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── Deepseek direct API — fallback 1 ──

async function streamFromDeepseek(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<void> {
  const model = process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getDeepseekKey()}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deepseek ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromDeepseek(messages: ApiMessage[]): Promise<string> {
  const model = process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getDeepseekKey()}`,
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Deepseek ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── GLM via DashScope — fallback 1 ──

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
  return data?.choices?.[0]?.message?.content || ''
}

// ── OpenRouter — fallback 2 (optional) ──

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
