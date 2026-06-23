/**
 * Realtime intent detection + web search module.
 *
 * Reads the user's intention to decide whether a question needs
 * current/realtime information from the web, then performs the search
 * and (optionally) reads the top result page for deeper context.
 *
 * Strategy (two-tier):
 *  1. PRIMARY — LLM-based intent detection: asks the AI whether the
 *     user's message needs realtime data + to generate an optimal
 *     search query. More accurate than regex, handles nuance.
 *  2. FALLBACK — expanded regex patterns: if the LLM call fails or
 *     times out, pattern matching decides + the user's message becomes
 *     the search query verbatim.
 */

import type { ApiMessage } from './types'
import { completeChat } from './ai-providers'

// ─────────────────────────────────────────────────────────────────────────────
// ZAI singleton — avoid recreating the SDK on every call
// ─────────────────────────────────────────────────────────────────────────────

let _zaiInstance: any = null
async function getZAI() {
  if (_zaiInstance) return _zaiInstance
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  _zaiInstance = await ZAI.create()
  return _zaiInstance
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findLastUser(messages: ApiMessage[]): ApiMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i]
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// Expanded regex fallback — catches common realtime-intention signals
// ─────────────────────────────────────────────────────────────────────────────

const REALTIME_PATTERNS = [
  // Time references (Indonesian + English)
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|kemarin|minggu ini|tahun ini/i,
  /latest|today|current|recent|right now|yesterday|this week|this year|up to date/i,
  // News / updates
  /berita|news|update|pengumuman/i,
  // Financial / market data
  /harga|price|cuaca|weather|suhu|temperature|saham|stock|bitcoin|crypto|kurs|dollar|rupiah|nilai tukar|bunga|inflasi/i,
  // Sports / events
  /jadwal|schedule|result|hasil|skor|score|pertandingan|match|klasemen|standings|turnamen/i,
  // Trending / viral
  /trending|viral|populer|popular|hot topic/i,
  // Year mentions (current/recent years)
  /\b202[4-9]\b/i,
  // "What is happening" / current state
  /apa yang sedang|what.*happening|status terbaru|kondisi sekarang|perkembangan|progress/i,
  // People — "who is" / "siapa" (current identity, role, status)
  /\bsiapa\b.*presiden|\bsiapa\b.*menteri|\bsiapa\b.*pemain|\bsiapa\b.*artis/i,
  /who is|who.*current|who.*now|who.*today/i,
  // Places — "where is" (current location/status)
  /dimana.*sekarang|where.*now|where.*current/i,
  // Comparisons / best-of (need current data)
  /terbaik|termurah|termahal|terlaris|best|cheapest|most popular|top rated/i,
  // Statistics / numbers that change
  /berapa jumlah|berapa penduduk|how many|statistics|statistik|data terbaru/i,
  // Release / version / launch
  /rilis|release|launch|keluar|versi terbaru|update terbaru/i,
  // Live / ongoing
  /live|langsung|sedang berlangsung|ongoing/i,
]

function regexNeedsSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((p) => p.test(text))
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-based intent detection — asks the AI to decide + generate a query
// ─────────────────────────────────────────────────────────────────────────────

interface IntentResult {
  needRealtime: boolean
  query: string
  reason?: string
}

const INTENT_TIMEOUT_MS = 4000

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a chat assistant. Your job: decide whether the user's latest message needs CURRENT/REALTIME information from the web to answer accurately.

Reply ONLY with a compact JSON object, no markdown, no explanation:
{"needRealtime": true/false, "query": "optimized search query or empty string", "reason": "one short reason"}

Rules for needRealtime = true:
- Asks about current events, news, weather, prices, exchange rates, stock/crypto, sports scores, schedules
- Asks "who is the current X" / "siapa X sekarang" (roles that change: president, minister, champion, CEO)
- Mentions today, yesterday, this week, latest, newest, now, current, recent
- Asks about releases, versions, launches, updates
- Asks about trending / viral topics
- Needs data that changes over time (population, statistics, rankings)
- Compares products/services/prices (need current data)

Rules for needRealtime = false:
- General knowledge that doesn't change (math, history before 2020, science, grammar, definitions)
- Personal opinions, creative writing, coding help, advice
- Questions about the assistant itself
- Casual conversation / greetings / thanks

If needRealtime=true, "query" MUST be a concise search query in the user's language (English or Indonesian), optimized for a web search engine. Extract the core information need. Example: user asks "Berapa harga iPhone 15 sekarang?" → query: "harga iPhone 15 terbaru 2024"

Current date: ${new Date().toISOString().split('T')[0]}`

async function detectIntentLLM(
  messages: ApiMessage[]
): Promise<IntentResult | null> {
  const lastUser = findLastUser(messages)
  if (!lastUser) return null

  try {
    const intentMessages: ApiMessage[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `User's latest message: "${lastUser.content.slice(0, 500)}"\n\nClassify the intent.`,
      },
    ]

    const raw = await withTimeout(completeChat(intentMessages), INTENT_TIMEOUT_MS)
    if (!raw) return null

    // Extract JSON from response (handle markdown-wrapped or plain)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      needRealtime: Boolean(parsed.needRealtime),
      query: (parsed.query || '').trim(),
      reason: parsed.reason,
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Web search + page reading
// Primary: Tavily AI (purpose-built for AI agents, high accuracy)
// Fallback: z-ai SDK (built-in, no key needed)
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 8000
const PAGE_READ_TIMEOUT_MS = 5000
const MAX_PAGES_TO_READ = 2
const SEARCH_RETRIES = 2

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

interface SearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
  date?: string
}

interface PageContent {
  url: string
  title: string
  text: string
  publishedTime?: string
}

/** Tavily search — primary (requires TAVILY_API_KEY env var) */
async function performTavilySearch(query: string): Promise<{ results: SearchResult[]; answer: string }> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('No Tavily API key')

  const res = await withTimeout(
    fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        max_results: 5,
      }),
    }),
    SEARCH_TIMEOUT_MS
  )

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Tavily ${res.status}: ${t.slice(0, 200)}`)
  }

  const data = await res.json()
  const answer: string = data?.answer || ''
  const results: SearchResult[] = (data?.results || []).map((r: any) => ({
    url: r.url || '',
    name: r.title || '',
    snippet: r.content || '',
    host_name: r.url ? new URL(r.url).hostname : '',
    date: r.published_date || r.score?.toString() || '',
  }))

  return { results, answer }
}

/** z-ai SDK search — fallback (no API key needed) */
async function performZAISearch(query: string): Promise<SearchResult[]> {
  for (let attempt = 1; attempt <= SEARCH_RETRIES; attempt++) {
    try {
      const zai = await getZAI()
      const results = await withTimeout(
        zai.functions.invoke('web_search', { query, num: 5 }),
        SEARCH_TIMEOUT_MS
      )
      if (Array.isArray(results) && results.length > 0) {
        return results as SearchResult[]
      }
      if (attempt < SEARCH_RETRIES) {
        const simplified = query.slice(0, 60).trim()
        if (simplified && simplified !== query) continue
      }
      return []
    } catch {
      if (attempt >= SEARCH_RETRIES) return []
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return []
}

/** Unified search: Tavily primary, z-ai SDK fallback */
async function performWebSearch(query: string): Promise<{ results: SearchResult[]; answer: string }> {
  // Try Tavily first
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyResult = await performTavilySearch(query)
      if (tavilyResult.results.length > 0) {
        return tavilyResult
      }
    } catch (e: any) {
      console.error('[realtime] Tavily search failed:', e?.message)
    }
  }

  // Fallback to z-ai SDK
  const results = await performZAISearch(query)
  return { results, answer: '' }
}

/** Read a page for deeper context — uses z-ai SDK page_reader */
async function readPage(url: string): Promise<PageContent | null> {
  try {
    const zai = await getZAI()
    const result: any = await withTimeout(
      zai.functions.invoke('page_reader', { url }),
      PAGE_READ_TIMEOUT_MS
    )
    const data = result?.data || result
    if (!data) return null
    const text = stripHtml(data.html || data.text || '').slice(0, 2000)
    if (text.length < 50) return null
    return {
      url,
      title: data.title || '',
      text,
      publishedTime: data.publishedTime || data.publish_time,
    }
  } catch {
    return null
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — the main entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface RealtimeContext {
  performed: boolean
  query: string
  searchResults: SearchResult[]
  pageContents: PageContent[]
  sourceCount: number
  pagesRead: number
  failed: boolean
  answer?: string // Tavily's built-in answer generation
}

const EMPTY_CTX: RealtimeContext = {
  performed: false,
  query: '',
  searchResults: [],
  pageContents: [],
  sourceCount: 0,
  pagesRead: 0,
  failed: false,
  answer: '',
}

function buildSearchQuery(userMessage: string, intentQuery: string): string {
  // Prefer the LLM-generated query; fall back to the user's message (truncated)
  const q = (intentQuery || userMessage).trim()
  // Add current year if not present (helps get recent results)
  const year = new Date().getFullYear()
  if (!q.includes(String(year)) && !q.includes(String(year - 1))) {
    return `${q} ${year}`
  }
  return q
}

export async function gatherRealtimeContext(
  messages: ApiMessage[]
): Promise<RealtimeContext> {
  const lastUser = findLastUser(messages)
  if (!lastUser) return { ...EMPTY_CTX }

  // Step 1: Detect intent (LLM primary, regex fallback)
  let intent: IntentResult | null = null
  try {
    intent = await detectIntentLLM(messages)
  } catch {
    intent = null
  }

  let needRealtime: boolean
  let query: string

  if (intent) {
    needRealtime = intent.needRealtime
    query = intent.query
  } else {
    // LLM failed entirely — use regex
    needRealtime = regexNeedsSearch(lastUser.content)
    query = lastUser.content
  }

  if (!needRealtime) return { ...EMPTY_CTX }

  // Step 2: Build optimal search query
  const finalQuery = buildSearchQuery(lastUser.content, query)

  // Step 3: Perform web search (Tavily primary, z-ai SDK fallback)
  const { results: searchResults, answer: searchAnswer } = await performWebSearch(finalQuery)

  if (searchResults.length === 0) {
    return {
      performed: true,
      query: finalQuery,
      searchResults: [],
      pageContents: [],
      sourceCount: 0,
      pagesRead: 0,
      failed: true,
      answer: searchAnswer,
    }
  }

  // Step 4: Read top N result pages for deeper context (parallel, best-effort)
  const topUrls = searchResults
    .slice(0, MAX_PAGES_TO_READ)
    .map((r) => r.url)
    .filter(Boolean)

  const pageContents = (
    await Promise.all(topUrls.map((url) => readPage(url)))
  ).filter((p): p is PageContent => p !== null)

  return {
    performed: true,
    query: finalQuery,
    searchResults,
    pageContents,
    sourceCount: searchResults.length,
    pagesRead: pageContents.length,
    failed: false,
    answer: searchAnswer,
  }
}

/**
 * Build the system-prompt addition containing realtime data.
 */
export function buildRealtimePrompt(ctx: RealtimeContext): string {
  if (!ctx.performed) return ''

  const today = new Date().toISOString().split('T')[0]

  if (ctx.failed) {
    return `\n\nNOTE: Web search was needed but failed. Do NOT use training data for current events. Tell user: "Maaf, pencarian internet sedang bermasalah, coba lagi sebentar." Current date: ${today}`
  }

  const parts: string[] = [
    `\n\n=== REAL-TIME WEB SEARCH RESULTS (query: "${ctx.query}") ===`,
    `Current date: ${today}`,
    '',
  ]

  // Tavily's built-in answer (if available — high quality, AI-generated)
  if (ctx.answer) {
    parts.push('--- AI-Generated Answer ---')
    parts.push(ctx.answer)
    parts.push('')
  }

  // Search result snippets (always included)
  parts.push('--- Search Results ---')
  ctx.searchResults.forEach((r, i) => {
    parts.push(`[${i + 1}] ${r.name}`)
    if (r.snippet) parts.push(`    ${r.snippet}`)
    if (r.date) parts.push(`    Date: ${r.date}`)
    parts.push(`    Source: ${r.url}`)
    parts.push('')
  })

  // Deep page contents (if available)
  if (ctx.pageContents.length > 0) {
    parts.push('--- Full Page Content (top results) ---')
    ctx.pageContents.forEach((p, i) => {
      parts.push(`[Page ${i + 1}] ${p.title}`)
      if (p.publishedTime) parts.push(`Published: ${p.publishedTime}`)
      parts.push(`URL: ${p.url}`)
      parts.push(p.text)
      parts.push('')
    })
  }

  parts.push('=== END REAL-TIME DATA ===')
  parts.push(
    'INSTRUCTIONS: Use the above real-time data to answer. Cite sources by number (e.g., "menurut sumber [1]"). If the data contradicts your training, trust the real-time data. Always mention the date if the topic is time-sensitive.',
    '',
    'FORMATTING (CRITICAL — follow exactly):',
    '- Start with: "Berdasarkan pencarian terbaru, berikut informasinya:"',
    '- Use simple bullet points with dash prefix: "- Header: Complete sentence with full context."',
    '- NO BOLD TEXT. Do NOT use **bold** markdown. Regular text only.',
    '- Each bullet MUST be a complete, grammatically correct sentence. No fragments.',
    '- End with a summary sentence like: "Jadi, [subject] masih aktif di [fields] per [date]."',
    '- Spell every word completely. No abbreviations or dropped letters.',
    '- Cite the source number at the end of each point, e.g., "...menurut [1]."'
  )

  return parts.join('\n')
}
