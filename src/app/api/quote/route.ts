import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fetch a random quote from free public quote APIs.
 * Tries multiple providers in order (Quotable -> ZenQuotes -> dummyjson),
 * returns the first that responds. Falls back to a curated local quote
 * if all network APIs fail.
 *
 * Response: { text, author, source }
 */

interface QuoteResult {
  text: string
  author: string
  source: string
}

// Curated local fallback quotes (used if all network APIs fail)
const LOCAL_FALLBACK: QuoteResult[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain', source: 'local' },
  { text: 'Be the change you wish to see in the world.', author: 'Gandhi', source: 'local' },
  { text: 'The only limit is the one you set in your mind.', author: 'Unknown', source: 'local' },
  { text: 'Small steps every day add up to big results.', author: 'Unknown', source: 'local' },
  { text: 'Life begins at the end of your comfort zone.', author: 'Neale Donald Walsch', source: 'local' },
]

export async function GET() {
  // Try each provider in order
  const providers = [fetchQuotable, fetchZenQuotes, fetchDummyJson]

  for (const provider of providers) {
    try {
      const quote = await provider()
      if (quote && quote.text) {
        return NextResponse.json(quote)
      }
    } catch (e: any) {
      console.error(`[quote] ${provider.name} failed:`, e?.message)
    }
  }

  // All network APIs failed — return a random local fallback
  const fallback =
    LOCAL_FALLBACK[Math.floor(Math.random() * LOCAL_FALLBACK.length)]
  return NextResponse.json(fallback)
}

// ── Provider 1: Quotable (api.quotable.io) ──
async function fetchQuotable(): Promise<QuoteResult | null> {
  const res = await fetch('https://api.quotable.io/random', {
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.content) return null
  return {
    text: data.content,
    author: data.author || 'Unknown',
    source: 'quotable',
  }
}

// ── Provider 2: ZenQuotes (zenquotes.io) ──
async function fetchZenQuotes(): Promise<QuoteResult | null> {
  const res = await fetch('https://zenquotes.io/api/random', {
    signal: AbortSignal.timeout(6000),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = await res.json()
  const item = Array.isArray(data) ? data[0] : data
  if (!item?.q) return null
  return {
    text: item.q,
    author: item.a || 'Unknown',
    source: 'zenquotes',
  }
}

// ── Provider 3: dummyjson.com ──
async function fetchDummyJson(): Promise<QuoteResult | null> {
  const res = await fetch('https://dummyjson.com/quotes/random', {
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.quote) return null
  return {
    text: data.quote,
    author: data.author || 'Unknown',
    source: 'dummyjson',
  }
}
