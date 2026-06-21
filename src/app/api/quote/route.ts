import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fetch a random quote from free public quote APIs.
 * Tries multiple providers in order, returns the first that responds.
 * Falls back to a curated local quote if all network APIs fail.
 *
 * Provider order is by reliability:
 *   1. ZenQuotes (zenquotes.io) — most reliable
 *   2. DummyJSON (dummyjson.com) — backup
 *   3. Quotable (api.quotable.io) — often down, last resort
 *   4. Local curated quotes — always available
 *
 * Response: { text, author, source }
 */

interface QuoteResult {
  text: string
  author: string
  source: string
}

const LOCAL_FALLBACK: QuoteResult[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain', source: 'local' },
  { text: 'Be the change you wish to see in the world.', author: 'Gandhi', source: 'local' },
  { text: 'The only limit is the one you set in your mind.', author: 'Unknown', source: 'local' },
  { text: 'Small steps every day add up to big results.', author: 'Unknown', source: 'local' },
  { text: 'Life begins at the end of your comfort zone.', author: 'Neale Donald Walsch', source: 'local' },
]

const TIMEOUT_MS = 5000

export async function GET() {
  // Try providers in reliability order
  for (const provider of [fetchZenQuotes, fetchDummyJson, fetchQuotable]) {
    try {
      const quote = await provider()
      if (quote?.text) return NextResponse.json(quote)
    } catch (e: any) {
      // Expected when a provider is down — quiet debug, not an error
      console.debug(`[quote] ${provider.name} unavailable:`, e?.message)
    }
  }

  // All network APIs failed — return a random local fallback
  const fallback = LOCAL_FALLBACK[Math.floor(Math.random() * LOCAL_FALLBACK.length)]
  return NextResponse.json(fallback)
}

async function fetchZenQuotes(): Promise<QuoteResult | null> {
  const res = await fetch('https://zenquotes.io/api/random', {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = await res.json()
  const item = Array.isArray(data) ? data[0] : data
  if (!item?.q) return null
  return { text: item.q, author: item.a || 'Unknown', source: 'zenquotes' }
}

async function fetchDummyJson(): Promise<QuoteResult | null> {
  const res = await fetch('https://dummyjson.com/quotes/random', {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.quote) return null
  return { text: data.quote, author: data.author || 'Unknown', source: 'dummyjson' }
}

async function fetchQuotable(): Promise<QuoteResult | null> {
  const res = await fetch('https://api.quotable.io/random', {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.content) return null
  return { text: data.content, author: data.author || 'Unknown', source: 'quotable' }
}
