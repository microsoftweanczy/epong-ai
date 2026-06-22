import type { ApiMessage } from './types'

/**
 * Smart Routing System v2 — optimized for Indonesian users.
 *
 * Routing:
 *   simple chat    → GPT-4o-mini      (natural Indonesian, humor, 2s)
 *   complex reason → DeepSeek-R1      (deep reasoning, 5-15s)
 *   code/technical → DeepSeek-V3      (code specialist, 2s)
 *   fallback 1     → Llama-3.3-70B    (strong alternative)
 *   fallback 2     → GLM (DashScope)
 *   fallback 3     → OpenRouter
 *
 * Intent classifier: regex-based, 0ms, detects Indonesian slang & nuances.
 */

const MAX_HISTORY = 20
const ERROR_PREVIEW = 200

// ── GitHub Models ──
const GITHUB_ENDPOINT = 'https://models.github.ai/inference'
const GITHUB_TOKEN = 'REDACTED'

// Model IDs
const M_GPT4O_MINI = 'openai/gpt-4o-mini'
const M_R1 = 'deepseek/DeepSeek-R1'
const M_V3 = 'deepseek/DeepSeek-V3-0324'
const M_LLAMA = 'meta/llama-3.3-70b-instruct'

// ── GLM via DashScope — fallback ──
const GLM_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const GLM_MODEL = 'glm-5.1'
const GLM_KEY = 'REDACTED'

// ── OpenRouter — fallback (optional) ──
const OR_BASE = 'https://openrouter.ai/api/v1'
const OR_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const STREAM_TIMEOUT = 60_000
const REQ_TIMEOUT = 12_000

// ── Key getters ──
function ghToken(): string {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN || GITHUB_TOKEN
}
function ghLlmKey(): string {
  return process.env.GLM_API_KEY || GLM_KEY
}
function ghLlmModel(): string {
  return process.env.GLM_MODEL || GLM_MODEL
}

// ── Intent Classification (0ms, regex-based, Indonesian-optimized) ──

type Intent = 'simple' | 'complex' | 'code'

// Indonesian + English complex reasoning patterns
const COMPLEX_RX = [
  /jelaskan (mengapa|kenapa|alasan)|why (does|is|should)/i,
  /analisis|analisa|analyze|evaluate|evaluasi/i,
  /bandingkan|compare|perbedaan|persamaan/i,
  /hitung|berapa (hasil|jumlah)|solve|calculate|matematika/i,
  /\d+\s*[+\-*/x×÷]\s*\d+/,
  /buktikan|prove|proof|diagnosa|diagnose/i,
  /sebab akibat|cause.?effect|logika|penalaran/i,
  /kelebihan.{0,5}kekurangan|pros.?cons|strategi|rencana/i,
  /argumen|debate|diskusi (mendalam|serius)/i,
  /filosofi|moral|etika|ethical/i,
  /prediksi|forecast|proyeksi/i,
]

// Code/technical patterns (Indonesian + English)
const CODE_RX = [
  /kode|code|programming|program|script/i,
  /function|class|method|variable|array|object|loop/i,
  /bug|error|debug|fix|perbaiki (kode|program|script)/i,
  /\b(html|css|javascript|js|python|java|typescript|ts|react|next|vue|svelte|node)\b/i,
  /\b(sql|database|query|api|endpoint|rest|graphql)\b/i,
  /\b(regex|algorithm|algoritma|data structure|struktur data)\b/i,
  /\b(deploy|docker|git|npm|pnpm|bun|pip|webpack)\b/i,
  /\b(json|yaml|xml|markdown|bash|shell|terminal|cmd)\b/i,
  /cara (membuat|menginstall|setup|konfigurasi).*(kode|program|app|aplikasi)/i,
]

function classify(text: string): Intent {
  const t = text.toLowerCase()
  if (CODE_RX.some((r) => r.test(t))) return 'code'
  if (COMPLEX_RX.some((r) => r.test(t))) return 'complex'
  return 'simple'
}

function pickModel(intent: Intent): string {
  if (intent === 'complex') return M_R1
  if (intent === 'code') return M_V3
  return M_GPT4O_MINI // simple → GPT-4o-mini (best for Indonesian)
}

function label(model: string): string {
  if (model === M_GPT4O_MINI) return 'GPT-4o-mini'
  if (model === M_R1) return 'DeepSeek-R1'
  if (model === M_V3) return 'DeepSeek-V3'
  if (model === M_LLAMA) return 'Llama-3.3-70B'
  return model
}

/** Short obfuscated code for developer reference (shows which API answered) */
function modelCode(model: string): string {
  if (model === M_GPT4O_MINI) return 'g4o'
  if (model === M_R1) return 'd-r1'
  if (model === M_V3) return 'd-v3'
  if (model === M_LLAMA) return 'l70'
  return '?'
}

// ── Quality check ──
function valid(text: string): boolean {
  if (!text || text.trim().length < 3) return false
  const l = text.toLowerCase()
  if (l.startsWith('error:') && text.length < 100) return false
  if (l === 'null' || l === 'undefined') return false
  return true
}

// ── Public types ──
export interface ChatResult {
  success: boolean
  provider: string
  modelCode: string
  error?: string
}

// ── Public API: streamChat ──
export async function streamChat(
  messages: ApiMessage[],
  onDelta: (text: string) => void
): Promise<ChatResult> {
  const trimmed = messages.slice(-MAX_HISTORY)
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user')
  const intent = lastUser ? classify(lastUser.content) : 'simple'
  const model = pickModel(intent)

  // Tier 1: GitHub Models (intent-based primary)
  try {
    await streamGH(trimmed, onDelta, model)
    return { success: true, provider: label(model), modelCode: modelCode(model) }
  } catch (e: any) {
    console.error(`[ai] ${label(model)} failed:`, e?.message)
  }

  // Tier 2: Llama-3.3-70B (GitHub alt)
  try {
    await streamGH(trimmed, onDelta, M_LLAMA)
    return { success: true, provider: label(M_LLAMA), modelCode: modelCode(M_LLAMA) }
  } catch (e: any) {
    console.error('[ai] Llama failed:', e?.message)
  }

  // Tier 3: GLM via DashScope
  try {
    await streamGLM(trimmed, onDelta)
    return { success: true, provider: 'GLM', modelCode: 'glm' }
  } catch (e: any) {
    console.error('[ai] GLM failed:', e?.message)
  }

  // Tier 4: OpenRouter (optional)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamOR(trimmed, onDelta)
      return { success: true, provider: 'OpenRouter', modelCode: 'or' }
    } catch (e: any) {
      console.error('[ai] OpenRouter failed:', e?.message)
    }
  }

  return { success: false, provider: '', modelCode: '', error: 'Semua API sedang bermasalah. Coba lagi nanti.' }
}

// ── Public API: completeChat ──
export async function completeChat(
  messages: ApiMessage[]
): Promise<{ text: string; provider: string; modelCode: string }> {
  const trimmed = messages.slice(-MAX_HISTORY)
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user')
  const intent = lastUser ? classify(lastUser.content) : 'simple'
  const model = pickModel(intent)

  try {
    const text = await completeGH(trimmed, model)
    if (valid(text)) return { text, provider: label(model), modelCode: modelCode(model) }
  } catch (e: any) { console.error(`[ai] ${label(model)} complete failed:`, e?.message) }

  try {
    const text = await completeGH(trimmed, M_LLAMA)
    if (valid(text)) return { text, provider: label(M_LLAMA), modelCode: modelCode(M_LLAMA) }
  } catch (e: any) { console.error('[ai] Llama complete failed:', e?.message) }

  try {
    const text = await completeGLM(trimmed)
    return { text, provider: 'GLM', modelCode: 'glm' }
  } catch (e: any) { console.error('[ai] GLM complete failed:', e?.message) }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const text = await completeOR(trimmed)
      return { text, provider: 'OpenRouter', modelCode: 'or' }
    } catch (e: any) { console.error('[ai] OR complete failed:', e?.message) }
  }

  return { text: '', provider: '', modelCode: '' }
}

// ── SSE parser ──
async function parseSSE(body: ReadableStream<Uint8Array>, onDelta: (t: string) => void): Promise<void> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch { /* ignore */ }
    }
  }
}

// ── GitHub Models ──
async function streamGH(messages: ApiMessage[], onDelta: (t: string) => void, model: string): Promise<void> {
  const res = await fetch(`${GITHUB_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghToken()}` },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4096, temperature: 0.8, top_p: 0.95 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT),
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    throw new Error(`GH ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSE(res.body, onDelta)
}

async function completeGH(messages: ApiMessage[], model: string): Promise<string> {
  const res = await fetch(`${GITHUB_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghToken()}` },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800, temperature: 0.8, top_p: 0.95 }),
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GH ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── GLM ──
async function streamGLM(messages: ApiMessage[], onDelta: (t: string) => void): Promise<void> {
  const res = await fetch(`${GLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghLlmKey()}` },
    body: JSON.stringify({ model: ghLlmModel(), messages, stream: true, max_tokens: 4096 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT),
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSE(res.body, onDelta)
}

async function completeGLM(messages: ApiMessage[]): Promise<string> {
  const res = await fetch(`${GLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ghLlmKey()}` },
    body: JSON.stringify({ model: ghLlmModel(), messages, stream: false, max_tokens: 800 }),
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── OpenRouter ──
async function streamOR(messages: ApiMessage[], onDelta: (t: string) => void): Promise<void> {
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'ManggarAI',
    },
    body: JSON.stringify({ model: OR_MODEL, messages, stream: true, max_tokens: 4096 }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT),
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    throw new Error(`OR ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  await parseSSE(res.body, onDelta)
}

async function completeOR(messages: ApiMessage[]): Promise<string> {
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'ManggarAI',
    },
    body: JSON.stringify({ model: OR_MODEL, messages, stream: false, max_tokens: 800 }),
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`OR ${res.status}: ${t.slice(0, ERROR_PREVIEW)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}
