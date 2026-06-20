'use client'

import { useState } from 'react'
import { Quote as QuoteIcon } from 'lucide-react'
import { Logo } from './logo'
import { pickQuote, type Quote } from '@/lib/quotes'
import { useSettings } from '@/lib/settings'

interface Props {
  userName?: string | null
}

export function Welcome({ userName }: Props) {
  const name = userName?.trim()
  const greeting = name
    ? `Halo, ${name}! Apa kabar hari ini?`
    : 'Halo! Apa kabar?'

  const { prefs, memory, behaviorProfile } = useSettings()

  // Pick a fresh quote on each mount (each app open / new chat view).
  const [quote] = useState<Quote>(() =>
    pickQuote(memory, behaviorProfile, prefs)
  )

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
              {quote.category === 'motivasi' || quote.category === 'keberanian'
                ? 'Semangat untukmu'
                : quote.category === 'tenang'
                  ? 'Untukmu hari ini'
                  : 'Kata mutiara'}
            </span>
          </div>
          <p className="text-center text-[17px] font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            &ldquo;{quote.text}&rdquo;
          </p>
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
