'use client'

import { useState, useEffect } from 'react'
import { Quote as QuoteIcon, Sparkles, MessageCircle, Lightbulb, PenLine } from 'lucide-react'
import { Logo } from './logo'

interface DisplayQuote {
  text: string
  author?: string
}

interface Props {
  userName?: string | null
}

const SUGGESTIONS = [
  { icon: Lightbulb, text: 'Jelaskan fotosintesis dengan sederhana' },
  { icon: PenLine, text: 'Tulis caption Instagram untuk liburan ke Bali' },
  { icon: MessageCircle, text: 'Beri saya saran fokus belajar' },
  { icon: Sparkles, text: 'Berita teknologi AI terbaru' },
]

export function Welcome({ userName }: Props) {
  const name = userName?.trim()
  const greeting = name
    ? `Halo, ${name}!`
    : 'Halo!'

  const [quote, setQuote] = useState<DisplayQuote | null>(null)

  // Fetch a real quote from the API — with a 5s timeout so the spinner
  // never spins forever.
  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/quote', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.text) return
        setQuote({ text: data.text, author: data.author })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      clearTimeout(t)
      ctrl.abort()
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {/* Logo */}
      <div className="mb-5 shadow-xl shadow-[#0A84FF]/30 sm:mb-6">
        <Logo size={64} />
      </div>

      {/* Greeting */}
      <h1 className="max-w-md text-center text-[22px] font-bold leading-snug tracking-tight text-slate-900 sm:text-[27px] dark:text-white">
        {greeting}
      </h1>
      <p className="mt-1.5 max-w-md text-center text-[14px] text-slate-500 sm:text-[15px] dark:text-slate-400">
        Ada yang bisa saya bantu hari ini?
      </p>

      {/* Quote */}
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
          <p className="flex items-center justify-center text-[15px] text-slate-400 sm:text-[17px]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0A84FF]" />
          </p>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:mt-8 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white/60 px-3.5 py-2.5 text-[13px] text-slate-600 backdrop-blur-sm sm:text-[14px] dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#0A84FF] dark:text-indigo-400" />
              <span className="line-clamp-2">{s.text}</span>
            </div>
          )
        })}
      </div>

      {/* Hint */}
      <p className="mt-5 max-w-sm text-center text-[12px] text-slate-400 sm:mt-6 sm:text-[13px]">
        Ketik pesan di bawah untuk mulai mengobrol dengan Epong AI.
      </p>
    </div>
  )
}
