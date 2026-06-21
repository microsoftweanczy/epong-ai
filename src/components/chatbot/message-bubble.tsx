'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '@/lib/types'
import { formatTime } from '@/lib/format'

interface Props {
  message: ChatMessage
  streaming?: boolean
}

function MessageBubbleBase({ message, streaming }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    // User message: right-aligned, subtle professional bubble
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end">
          <div className="rounded-2xl rounded-br-sm bg-slate-100 px-4 py-2.5 text-[15px] leading-relaxed text-slate-900 dark:bg-slate-800 dark:text-slate-100">
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
          <span className="mr-1 mt-0.5 text-[10px] text-slate-400">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    )
  }

  // Assistant — pure plain text, NO bubble, NO avatar, NO background
  return (
    <div className="flex flex-col">
      {message.content ? (
        <div className="md-body text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-indigo-500/70" />
          )}
        </div>
      ) : (
        <ThinkingDots />
      )}
      <span className="mt-0.5 text-[10px] text-slate-400">
        {formatTime(message.createdAt)}
      </span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1.5">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  )
}

export const MessageBubble = memo(MessageBubbleBase)
