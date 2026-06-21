'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from '@/lib/types'
import { formatTime } from '@/lib/format'
import { Logo } from './logo'

interface Props {
  message: ChatMessage
  streaming?: boolean
}

function MessageBubbleBase({ message, streaming }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end">
          <div className="rounded-2xl rounded-br-md bg-slate-200/70 px-4 py-2.5 text-[15px] leading-relaxed text-slate-900 dark:bg-slate-700/60 dark:text-slate-100">
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
          <span className="mr-1 mt-1 text-[10px] text-slate-400">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    )
  }

  // assistant — ChatGPT style: avatar + clean text, no bubble
  return (
    <div className="flex gap-3">
      <Logo size={32} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        {message.content ? (
          <div className="md-body pt-0.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-indigo-500/70" />
            )}
          </div>
        ) : (
          <ThinkingDots />
        )}
        <span className="mt-1 text-[10px] text-slate-400">
          {formatTime(message.createdAt)}
        </span>
      </div>
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
