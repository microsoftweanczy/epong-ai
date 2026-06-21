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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* Logo */}
      <div className="mb-5 shadow-xl shadow-[#0A84FF]/30 sm:mb-6">
        <Logo size={64} />
      </div>

      {/* Greeting — bold, high-contrast in both themes */}
      <h1 className="max-w-md text-center text-[22px] font-bold leading-snug tracking-tight text-slate-900 sm:text-[27px] dark:text-white">
        {greeting}
      </h1>

      {/* Quote — plain text, no bubble */}
      <div className="mt-5 w-full max-w-md sm:mt-7">
          <div className="mb-2 flex items-center justify-center gap-2">
            <QuoteIcon className="h-4 w-4 text-[#0A84FF] dark:text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#0A84FF] sm:text-[11px] dark:text-indigo-400">
              Kata mutiara
            </span>
          </div>
          {quote ? (
            <>
              <p className="text-center text-[15px] font-medium leading-relaxed text-slate-800 sm:text-[17px] dark:text-slate-100">
                &ldquo;{quote.text}&rdquo;
              </p>
              {quote.author && (
                <p className="mt-2 text-center text-[11px] text-slate-400 sm:text-[12px]">
                  — {quote.author}
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-[15px] leading-relaxed text-slate-400 sm:text-[17px]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0A84FF] align-middle" />
            </p>
          )}
      </div>

      {/* Hint to start chatting */}
      <p className="mt-5 max-w-sm text-center text-[13px] font-medium text-slate-600 sm:mt-7 sm:text-[14px] dark:text-slate-300">
        Ada yang bisa saya bantu hari ini?
        <br />
        <span className="text-slate-500 dark:text-slate-400">
          Ketik pesan di bawah untuk mulai mengobrol.
        </span>
      </p>
    </div>
  )
}
