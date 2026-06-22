'use client'

import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Copy, Check, RefreshCw, FileText, Video, File,
  Volume2, Loader2, Pin, PinOff,
} from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { formatTime } from '@/lib/format'
import { togglePinMessage, isPinned } from '@/lib/chat-utils'
import { CodeBlock } from './code-block'
import { toast } from 'sonner'

interface Props {
  message: ChatMessage
  streaming?: boolean
  canRetry?: boolean
  onRetry?: (messageId: string) => void
  conversationId?: string
  conversationTitle?: string
}

function MessageBubbleBase({ message, streaming, canRetry, onRetry, conversationId, conversationTitle }: Props) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pinned, setPinned] = useState(false)

  const handleCopy = async () => {
    const textToCopy = message.content
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (isUser) {
    const hasAttachments = message.attachments && message.attachments.length > 0
    return (
      <div className="group flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[75%] lg:max-w-[70%]">
          {/* Attachment previews */}
          {hasAttachments && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.attachments!.map((att) => (
                <div
                  key={att.id}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {att.type === 'image' ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-24 w-24 object-cover sm:h-28 sm:w-28"
                    />
                  ) : att.type === 'video' ? (
                    <div className="relative flex h-24 w-32 items-center justify-center bg-slate-900 sm:h-28 sm:w-36">
                      <video
                        src={att.dataUrl}
                        className="h-full w-full object-cover opacity-80"
                        muted
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow">
                          <Video className="h-4 w-4 text-slate-700" />
                        </div>
                      </div>
                      <span className="absolute bottom-0.5 left-0.5 right-0.5 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
                        {att.name}
                      </span>
                    </div>
                  ) : att.dataUrl ? (
                    <div className="flex h-16 w-32 items-center gap-1.5 px-2.5 py-2">
                      <File className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                        {att.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-16 w-32 items-center gap-1.5 px-2.5 py-2">
                      <FileText className="h-5 w-5 shrink-0 text-[#0A84FF]" />
                      <span className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                        {att.name}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {message.content && (
            <div className="font-chat rounded-2xl rounded-br-sm bg-[#f0f0f0] px-3.5 py-2 text-[14px] leading-relaxed text-slate-900 sm:px-4 sm:py-2.5 sm:text-[15px] dark:bg-[#2f2f2f] dark:text-slate-100">
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1">
            <span className="mr-1 text-[10px] text-slate-400">
              {formatTime(message.createdAt)}
            </span>
            {/* Copy button for user message — always visible */}
            <button
              onClick={handleCopy}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-900/8 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label={copied ? 'Tersalin' : 'Salin'}
              title={copied ? 'Tersalin' : 'Salin pesan'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Assistant — plain text with action buttons
  const showActions = !streaming && message.content.length > 0

  // Detect image content
  const imageMatch = message.content.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  const isImageOnly = !!imageMatch

  return (
    <div className="group flex flex-col">
      {message.content ? (
        isImageOnly ? (
          <div className="text-[14px] sm:text-[15px]">
            <img
              src={imageMatch[2]}
              alt={imageMatch[1] || 'Generated image'}
              className="max-w-full rounded-2xl border border-slate-200/60 shadow-md dark:border-slate-700/60"
              style={{ maxHeight: '512px' }}
            />
          </div>
        ) : (
          <div className="md-body text-[14px] leading-relaxed text-slate-800 sm:text-[15px] dark:text-slate-200">
            <ReactMarkdown
              components={{
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              }}
            >
              {message.content}
            </ReactMarkdown>
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-[#0A84FF]/70" />
            )}
          </div>
        )
      ) : (
        <ThinkingDots />
      )}
      <div className="mt-1 flex items-center gap-0.5">
        <span className="text-[10px] text-slate-400">
          {formatTime(message.createdAt)}
        </span>
        {showActions && (
          <div className="flex items-center gap-0.5">
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
