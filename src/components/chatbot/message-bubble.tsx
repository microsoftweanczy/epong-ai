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
        <div className="flex max-w-[80%] flex-col items-end sm:max-w-[70%]">
          <div className="rounded-3xl rounded-br-md bg-gradient-to-br from-[#0A84FF] to-[#0064D6] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-md shadow-[#0A84FF]/25">
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

  // assistant
  return (
    <div className="flex items-end gap-2">
      <Logo size={32} className="shrink-0 shadow-sm" />
      <div className="flex max-w-[82%] flex-col items-start sm:max-w-[72%]">
        <div className="glass rounded-3xl rounded-bl-md px-4 py-2.5 text-slate-800 shadow-sm">
          {message.content ? (
            <div className="md-body">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <ThinkingDots />
          )}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-indigo-500/70" />
          )}
        </div>
        <span className="ml-1 mt-1 text-[10px] text-slate-400">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
    </div>
  )
}

export const MessageBubble = memo(MessageBubbleBase)
