'use client'

import { useRef, useState, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'

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

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="safe-bottom px-3 pb-3 pt-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <div className="glass flex flex-1 items-end rounded-[26px] px-4 py-2 shadow-lg">
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
            placeholder="Message Aria…"
            enterKeyHint="send"
            disabled={disabled}
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
          />
        </div>
        {busy ? (
          <button
            onClick={onStop}
            aria-label="Stop generating"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition hover:bg-slate-700 active:scale-95"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0064D6] text-white shadow-lg shadow-[#0A84FF]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
