'use client'

import { Cpu } from 'lucide-react'
import { useSettings, type AIProvider } from '@/lib/settings'

const PROVIDERS: { value: AIProvider; label: string; short: string }[] = [
  { value: 'auto', label: 'Auto', short: 'Auto' },
  { value: 'openrouter', label: 'OpenRouter (GPT-OSS)', short: 'GPT' },
  { value: 'glm', label: 'GLM 4.5 Flash', short: 'GLM' },
]

/** Compact provider selector — sits above the chat input. */
export function ProviderSelector() {
  const { prefs, setPrefs } = useSettings()

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-1 pb-1.5">
      <Cpu className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {PROVIDERS.map((p) => {
        const active = prefs.provider === p.value
        return (
          <button
            key={p.value}
            onClick={() => setPrefs({ provider: p.value })}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
              active
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'bg-slate-900/5 text-slate-500 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15'
            }`}
            aria-pressed={active}
            title={p.label}
          >
            {p.short}
          </button>
        )
      })}
    </div>
  )
}
