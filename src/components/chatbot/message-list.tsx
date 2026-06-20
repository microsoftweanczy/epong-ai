'use client'

import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'
import type { ChatMessage } from '@/lib/types'

interface Props {
  messages: ChatMessage[]
  streamingId: string | null
}

export function MessageList({ messages, streamingId }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives.
  useEffect(() => {
    const el = endRef.current
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, streamingId])

  return (
    <div
      ref={containerRef}
      className="thin-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={m.id === streamingId}
          />
        ))}
        <div ref={endRef} className="h-1" />
      </div>
    </div>
  )
}
