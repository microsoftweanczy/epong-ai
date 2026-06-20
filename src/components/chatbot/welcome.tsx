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
      <div className="mb-5 shadow-lg shadow-indigo-500/30">
        <Logo size={72} />
      </div>
      <h1 className="text-[26px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">
        {greeting}
      </h1>

      {/* Personalized quote */}
      <div className="mt-5 flex max-w-sm flex-col items-center">
        <QuoteIcon className="mb-2 h-5 w-5 text-indigo-400/70" />
        <p className="text-center text-[15px] italic leading-relaxed text-slate-600 dark:text-slate-300">
          &ldquo;{quote.text}&rdquo;
        </p>
      </div>

      <p className="mt-6 max-w-sm text-center text-[13px] text-slate-400 dark:text-slate-500">
        Ada yang bisa saya bantu hari ini? Ketik pesan di bawah untuk mulai
        mengobrol.
      </p>
    </div>
  )
}
