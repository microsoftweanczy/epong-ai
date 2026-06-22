import type { ApiMessage } from './types'

/**
 * Smart Routing System for AI text generation.
 *
 * Routes queries to the best model based on intent:
 *  - Simple chat     → DeepSeek-V3 (fast, 1.9s)
 *  - Complex reasoning → DeepSeek-R1 (deep thinking, 5s)
 *  - Code/technical  → DeepSeek-V3 (excellent at code)
 *
 * Fallback chain:
 *  1. GitHub Models (primary, by intent)
 *  2. GitHub Models alt model (Llama-3.3-70B)
 *  3. GLM via DashScope
 *  4. OpenRouter (optional)
 *
 * If ALL fail → clear error message (no z-ai SDK).
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200

// ── GitHub Models ──
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference'
const GITHUB_TOKEN_FALLBACK = 'REDACTED'

// Model IDs on GitHub Models
const MODEL_V3 = 'deepseek/DeepSeek-V3-0324'      // fast, general purpose
const MODEL_R1 = 'deepseek/DeepSeek-R1'            // deep reasoning
const MODEL_LLAMA = 'meta/llama-3.3-70b-instruct'  // strong alternative

// ── Deepseek direct API — fallback ──
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat'
const DEEPSEEK_FALLBACK_KEY = 'REDACTED'

// ── GLM via DashScope — fallback ──
const GLM_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const GLM_DEFAULT_MODEL = 'qwen3.6-flash'
const GLM_FALLBACK_KEY = 'sk-ws-H.IYYPHR.dM6s.MEUCID8hSB15TQhZO_RutoErcWE0dXcb5lmQKeeyc319DpGbAiEA4sHr-BtPdLPDyi6TBfqCUNREaPSpusiiUoRxFBDycWM'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const REQUEST_TIMEOUT_MS = 6000
const STREAM_TIMEOUT_MS = 60_000

// ── Key getters ──

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

// ── Intent Classification (regex-based, 0ms) ──

type Intent = 'simple' | 'complex' | 'code'

// Patterns that signal complex reasoning needed
const COMPLEX_PATTERNS = [
  /jelaskan mengapa|jelaskan kenapa|why does|why is/i,
  /analisis|analisa|analyze|analysis/i,
  /bandingkan|compare|comparison/i,
  /hitung|berapa.*hasil|solve|calculate|matematika|math/i,
  /\d+\s*[+\-*/x×÷]\s*\d+/, // arithmetic expressions
  /buktikan|prove|proof/i,
  /sebab akibat|cause and effect/i,
  /logika|logic|reasoning|penalaran/i,
  /kelebihan dan kekurangan|pros and cons/i,
  /strategi|strategy|rencana/i,
  /diagnosa|diagnose|troubleshoot/i,
  /evaluasi|evaluate|assessment/i,
]

// Patterns that signal code/technical
const CODE_PATTERNS = [
  /kode|code|programming|program/i,
  /function|class|method|variable|array|object/i,
  /bug|error|debug|fix|perbaiki/i,
  /html|css|javascript|python|java|typescript|react|next/i,
  /sql|database|query|api|endpoint/i,
  /regex|algorithm|algoritma/i,
  /deploy|docker|git|npm|pip/i,
]

function classifyIntent(text: string): Intent {
  const lower = text.toLowerCase()

  // Check code first (code questions are best handled by V3)
  if (CODE_PATTERNS.some((p) => p.test(lower))) return 'code'

  // Check complex reasoning
  if (COMPLEX_PATTERNS.some((p) => p.test(lower))) return 'complex'

  // Default: simple chat
  return 'simple'
}

function getModelForIntent(intent: Intent): string {
  switch (intent) {
    case 'complex':
      return MODEL_R1  // DeepSeek-R1 for deep reasoning
    case 'code':
      return MODEL_V3  // DeepSeek-V3 excellent at code
    case 'simple':
    default:
      return MODEL_V3  // DeepSeek-V3 fast general purpose
  }
}

function getProviderLabel(intent: Intent, model: string): string {
  if (model === MODEL_R1) return 'DeepSeek-R1 (GitHub)'
  if (model === MODEL_V3) return 'DeepSeek-V3 (GitHub)'
  if (model === MODEL_LLAMA) return 'Llama-3.3-70B (GitHub)'
  return model
}

// ── Quality Check ──

function isValidResponse(text: string): boolean {
  if (!text || text.trim().length < 3) return false
  // Check for common error patterns
  const lower = text.toLowerCase()
  if (lower.startsWith('error:') && text.length < 100) return false
  if (lower === 'null' || lower === 'undefined') return false
  return true
}

// ── Public types ──

export interface ChatResult {
  success: boolean
  provider: string
  error?: string
  intent?: Intent
}

// ── Public API ──

/**
 * Stream a chat completion with smart routing.
 * Picks the best model based on query intent, with fallback chain.
 */
export async function streamChat(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<ChatResult> {
  const trimmed = trimHistory(messages)

  // Classify intent from the last user message
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user')
  const intent = lastUser ? classifyIntent(lastUser.content) : 'simple'
  const primaryModel = getModelForIntent(intent)

  console.log(`[ai] Intent: ${intent} → Model: ${primaryModel}`)

  // ── Tier 1: GitHub Models (primary model based on intent) ──
  try {
    let accumulated = ''
    await streamFromGithubModels(trimmed, onDelta, primaryModel)
    return {
      success: true,
      provider: getProviderLabel(intent, primaryModel),
      intent,
    }
  } catch (e: any) {
    console.error(`[ai] GitHub Models (${primaryModel}) failed:`, e?.message)
  }

  // ── Tier 2: GitHub Models (alternative model — Llama-3.3-70B) ──
  try {
    await streamFromGithubModels(trimmed, onDelta, MODEL_LLAMA)
    return {
      success: true,
      provider: getProviderLabel(intent, MODEL_LLAMA),
      intent,
    }
  } catch (e: any) {
    console.error('[ai] GitHub Models (Llama) failed:', e?.message)
  }

  // ── Tier 3: GLM via DashScope ──
  try {
    await streamFromGLM(trimmed, onDelta)
    return { success: true, provider: 'GLM', intent }
  } catch (e: any) {
    console.error('[ai] GLM stream failed:', e?.message)
  }

  // ── Tier 4: OpenRouter (optional) ──
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamFromOpenRouter(trimmed, onDelta)
      return { success: true, provider: 'OpenRouter', intent }
    } catch (e: any) {
      console.error('[ai] OpenRouter stream failed:', e?.message)
    }
  }

  // All failed
  return {
    success: false,
    provider: '',
    error: 'Semua API sedang bermasalah. Coba lagi nanti.',
    intent,
  }
}

/**
 * Non-streaming chat completion with smart routing.
 */
export async function completeChat(
  messages: ApiMessage[]
): Promise<{ text: string; provider: string }> {
  const trimmed = trimHistory(messages)

  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user')
  const intent = lastUser ? classifyIntent(lastUser.content) : 'simple'
  const primaryModel = getModelForIntent(intent)

  // Tier 1: GitHub Models (primary)
  try {
    const text = await completeFromGithubModels(trimmed, primaryModel)
    if (isValidResponse(text)) {
      return { text, provider: getProviderLabel(intent, primaryModel) }
    }
  } catch (e: any) {
    console.error('[ai] GitHub Models complete failed:', e?.message)
  }

  // Tier 2: GitHub Models (Llama alt)
  try {
    const text = await completeFromGithubModels(trimmed, MODEL_LLAMA)
    if (isValidResponse(text)) {
      return { text, provider: getProviderLabel(intent, MODEL_LLAMA) }
    }
  } catch (e: any) {
    console.error('[ai] GitHub Models (Llama) complete failed:', e?.message)
  }

  // Tier 3: GLM
  try {
    const text = await completeFromGLM(trimmed)
    return { text, provider: 'GLM' }
  } catch (e: any) {
    console.error('[ai] GLM complete failed:', e?.message)
  }

  // Tier 4: OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const text = await completeFromOpenRouter(trimmed)
      return { text, provider: 'OpenRouter' }
    } catch (e: any) {
      console.error('[ai] OpenRouter complete failed:', e?.message)
    }
  }

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
        let delta = json?.choices?.[0]?.delta?.content
        // DeepSeek-R1 may put reasoning in a separate field — only emit content
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

// ── GitHub Models — PRIMARY ──

async function streamFromGithubModels(
  messages: ApiMessage[],
  onDelta: (text: string) => void,
  model: string
): Promise<void> {
  const res = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGithubToken()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub Models ${res.status}: ${text.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSEStream(res.body, onDelta)
}

async function completeFromGithubModels(
  messages: ApiMessage[],
  model: string
): Promise<string> {
  const res = await fetch(`${GITHUB_MODELS_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getGithubToken()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 800,
      temperature: 0.7,
      top_p: 0.9,
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

// ── GLM via DashScope — fallback ──

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

// ── OpenRouter — fallback (optional) ──

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
