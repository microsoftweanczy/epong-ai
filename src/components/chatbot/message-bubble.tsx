'use client'

import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Copy, Check, RefreshCw } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { formatTime } from '@/lib/format'

interface Props {
  message: ChatMessage
  streaming?: boolean
  canRetry?: boolean
  onRetry?: (messageId: string) => void
}

function MessageBubbleBase({ message, streaming, canRetry, onRetry }: Props) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers / non-secure context
      const ta = document.createElement('textarea')
      ta.value = message.content
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {}
      document.body.removeChild(ta)
    }
  }

  if (isUser) {
    // User message: right-aligned, subtle professional bubble
    return (
      <div className="flex justify-end">
        <div className="group flex max-w-[85%] flex-col items-end sm:max-w-[75%] lg:max-w-[70%]">
          <div className="font-chat rounded-2xl rounded-br-sm bg-slate-100 px-3.5 py-2 text-[14px] leading-relaxed text-slate-900 sm:px-4 sm:py-2.5 sm:text-[15px] dark:bg-slate-800 dark:text-slate-100">
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

  // Assistant — plain text with action buttons (copy + retry)
  const showActions = !streaming && message.content.length > 0

  return (
    <div className="group flex flex-col">
      {message.content ? (
        <div className="md-body text-[14px] leading-relaxed text-slate-800 sm:text-[15px] dark:text-slate-200">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-indigo-500/70" />
          )}
        </div>
      ) : (
        <ThinkingDots />
      )}
      <div className="mt-1 flex items-center gap-1">
        <span className="text-[10px] text-slate-400">
          {formatTime(message.createdAt)}
        </span>
        {showActions && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={handleCopy}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-900/8 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label={copied ? 'Tersalin' : 'Salin'}
              title={copied ? 'Tersalin' : 'Salin'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            {canRetry && onRetry && (
              <button
                onClick={() => onRetry(message.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-900/8 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                aria-label="Coba lagi"
                title="Coba lagi"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
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
