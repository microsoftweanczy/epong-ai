'use client'

import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'
import type { ChatMessage } from '@/lib/types'

interface Props {
  messages: ChatMessage[]
  streamingId: string | null
  onRetry?: (messageId: string) => void
}

export function MessageList({ messages, streamingId, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  // Track whether the user is scrolled near the bottom.
  // Only auto-scroll if they are — don't yank them down if they scrolled up to read.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distFromBottom < 120
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to bottom when new content arrives — but ONLY if the user
  // is already near the bottom (debounced via rAF to avoid per-chunk layout thrash).
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = endRef.current
    if (!el) return
    // Coalesce multiple streaming chunks into one scroll per animation frame.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, streamingId])

  // Find the last assistant message id — only that one can be retried.
  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id
    }
    return null
  })()

  return (
    <div
      ref={containerRef}
      className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4 lg:max-w-4xl lg:gap-5">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={m.id === streamingId}
            canRetry={m.id === lastAssistantId && m.role === 'assistant'}
            onRetry={onRetry}
          />
        ))}
        <div ref={endRef} className="h-1" />
      </div>
    </div>
  )
}
