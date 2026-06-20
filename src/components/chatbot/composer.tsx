'use client'

import { useRef, useState, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { ProviderSelector } from './provider-selector'

interface Props {
  onSend: (text: string) => void
  onStop: () => void
  busy: boolean
  disabled?: boolean
}

export function Composer({ onSend, onStop, busy, disabled }: Props) {
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [value])

  // Auto-focus on mount so the mobile keyboard stands by immediately.
  // Slight delay lets the page settle (iOS sometimes needs this).
  useEffect(() => {
    const t = setTimeout(() => {
      taRef.current?.focus({ preventScroll: true })
    }, 350)
    return () => clearTimeout(t)
  }, [])

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="safe-bottom mx-2 mb-2 mt-1 sm:mx-3 sm:mb-3">
      <ProviderSelector />
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        <div className="glass flex min-h-[48px] flex-1 items-center rounded-[24px] px-4 py-2 shadow-lg">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Tulis pesan untuk Epong AI…"
            enterKeyHint="send"
            disabled={disabled}
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[16px] leading-[1.5] tracking-[-0.01em] text-slate-900 outline-none placeholder:text-slate-500 disabled:opacity-50 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
        </div>
        {busy ? (
          <button
            onClick={onStop}
            aria-label="Hentikan"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition hover:bg-slate-700 active:scale-95 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Kirim pesan"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0064D6] text-white shadow-lg shadow-[#0A84FF]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
