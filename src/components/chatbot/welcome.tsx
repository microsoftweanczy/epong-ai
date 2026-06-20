'use client'

import { useState, useEffect } from 'react'
import { Quote as QuoteIcon } from 'lucide-react'
import { Logo } from './logo'
import { pickQuote, type Quote } from '@/lib/quotes'
import { useSettings } from '@/lib/settings'

interface DisplayQuote {
  text: string
  author?: string
  label: string
}

interface Props {
  userName?: string | null
}

export function Welcome({ userName }: Props) {
  const name = userName?.trim()
  const greeting = name
    ? `Halo, ${name}! Apa kabar hari ini?`
    : 'Halo! Apa kabar?'

  const { prefs, memory, behaviorProfile } = useSettings()

  // Start with a local context-aware quote instantly (no flash of empty).
  const [quote, setQuote] = useState<DisplayQuote>(() => {
    const local = pickQuote(memory, behaviorProfile, prefs)
    return {
      text: local.text,
      label: categoryLabel(local.category),
    }
  })

  // Then fetch a real quote from the free API (Quotable/ZenQuotes/dummyjson)
  // in the background. If it succeeds, replace the local one.
  useEffect(() => {
    let cancelled = false
    fetch('/api/quote')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.text) return
        setQuote({
          text: data.text,
          author: data.author,
          label: authorAwareLabel(data.text),
        })
      })
      .catch(() => {
        /* keep the local quote */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      {/* Logo */}
      <div className="mb-6 shadow-xl shadow-indigo-500/30">
        <Logo size={76} />
      </div>

      {/* Greeting — bold, high-contrast in both themes */}
      <h1 className="max-w-md text-center text-[27px] font-bold leading-snug tracking-tight text-slate-900 dark:text-white">
        {greeting}
      </h1>

      {/* Personalized quote card — glass panel for better readability */}
      <div className="mt-7 w-full max-w-md">
        <div className="glass rounded-3xl px-6 py-5 shadow-md">
          <div className="mb-2 flex items-center justify-center gap-2">
            <QuoteIcon className="h-4 w-4 text-[#0A84FF] dark:text-indigo-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0A84FF] dark:text-indigo-400">
              {quote.label}
            </span>
          </div>
          <p className="text-center text-[17px] font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            &ldquo;{quote.text}&rdquo;
          </p>
          {quote.author && (
            <p className="mt-2 text-center text-[12px] text-slate-400">
              — {quote.author}
            </p>
          )}
        </div>
      </div>

      {/* Hint to start chatting */}
      <p className="mt-7 max-w-sm text-center text-[14px] font-medium text-slate-600 dark:text-slate-300">
        Ada yang bisa saya bantu hari ini?
        <br />
        <span className="text-slate-500 dark:text-slate-400">
          Ketik pesan di bawah untuk mulai mengobrol.
        </span>
      </p>
    </div>
  )
}

function categoryLabel(category: string): string {
  if (category === 'motivasi' || category === 'keberanian') return 'Semangat untukmu'
  if (category === 'tenang') return 'Untukmu hari ini'
  return 'Kata mutiara'
}

// Detect motivation/calm keywords in an API quote (English) to pick a label
function authorAwareLabel(text: string): string {
  const t = text.toLowerCase()
  const motivate = ['courage', 'begin', 'start', 'dream', 'goal', 'success', 'strength', 'forward', 'rise', 'fight', 'believe', 'possible']
  const calm = ['peace', 'breathe', 'calm', 'rest', 'still', 'quiet', 'silence', 'patience']
  if (motivate.some((k) => t.includes(k))) return 'Semangat untukmu'
  if (calm.some((k) => t.includes(k))) return 'Untukmu hari ini'
  return 'Kata mutiara'
}
