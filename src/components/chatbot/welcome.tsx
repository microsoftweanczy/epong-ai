'use client'

import { useState, useEffect } from 'react'
import { Quote as QuoteIcon } from 'lucide-react'
import { Logo } from './logo'

interface DisplayQuote {
  text: string
  author?: string
}

interface Props {
  userName?: string | null
}

export function Welcome({ userName }: Props) {
  const name = userName?.trim()
  const greeting = name
    ? `Halo, ${name}! Apa kabar hari ini?`
    : 'Halo! Apa kabar?'

  const [quote, setQuote] = useState<DisplayQuote | null>(null)

  // Fetch a real quote from the API only
  useEffect(() => {
    let cancelled = false
    fetch('/api/quote')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.text) return
        setQuote({ text: data.text, author: data.author })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      {/* Logo */}
      <div className="mb-6">
        <Logo size={76} />
      </div>

      {/* Greeting — bold, high-contrast in both themes */}
      <h1 className="max-w-md text-center text-[27px] font-bold leading-snug tracking-tight text-slate-900 dark:text-white">
        {greeting}
      </h1>

      {/* Quote — plain text, no bubble */}
      <div className="mt-7 w-full max-w-md">
          <div className="mb-2 flex items-center justify-center gap-2">
            <QuoteIcon className="h-4 w-4 text-[#0A84FF] dark:text-[#0A84FF]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0A84FF] dark:text-[#0A84FF]">
              Kata mutiara
            </span>
          </div>
          {quote ? (
            <>
              <p className="text-center text-[17px] font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                &ldquo;{quote.text}&rdquo;
              </p>
              {quote.author && (
                <p className="mt-2 text-center text-[12px] text-slate-400">
                  — {quote.author}
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-[17px] leading-relaxed text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0A84FF] align-middle" />
            </p>
          )}
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
