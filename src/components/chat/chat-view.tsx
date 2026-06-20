'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Send, Check, CheckCheck, Smile, Paperclip, Phone, Video } from 'lucide-react'
import { Avatar } from './avatar'
import type { ChatMessage, ConversationSummary } from '@/lib/chat-types'
import { formatChatTime } from '@/lib/format'
import { isSameDay, format } from 'date-fns'
import type { Socket } from 'socket.io-client'

interface ChatViewProps {
  conversation: ConversationSummary
  currentUser: { id: string; name: string; avatarColor: string }
  onlineUserIds: string[]
  socket: Socket | null
  onBack: () => void
  onMessagesChanged: () => void // refetch conversation list
}

const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '❤️', '😎', '🥳', '😢', '🔥', '✨', '🎉', '👋', '💯', '🤔', '😴', '🥰', '😘', '🤗', '😆']

export function ChatView({
  conversation,
  currentUser,
  onlineUserIds,
  socket,
  onBack,
  onMessagesChanged,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUser, setTypingUser] = useState<{ name: string } | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingActive = useRef(false)

  const convId = conversation.id
  const otherOnline =
    !conversation.isGroup &&
    conversation.otherUserId != null &&
    onlineUserIds.includes(conversation.otherUserId)

  // ---- fetch messages ----
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversations/${convId}/messages?userId=${currentUser.id}`
      )
      const data = await res.json()
      if (res.ok) {
        setMessages(data.messages || [])
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [convId, currentUser.id])

  useEffect(() => {
    setLoading(true)
    setMessages([])
    fetchMessages()
  }, [convId, fetchMessages])

  // ---- join socket room ----
  useEffect(() => {
    if (!socket) return
    socket.emit('join-conversation', { conversationId: convId })
    return () => {
      socket.emit('leave-conversation', { conversationId: convId })
    }
  }, [socket, convId])

  // ---- socket listeners ----
  useEffect(() => {
    if (!socket) return

    const onNewMessage = (msg: ChatMessage) => {
      if (msg.conversationId !== convId) return
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // acknowledge delivered
      if (msg.senderId !== currentUser.id) {
        socket.emit('message-delivered', {
          conversationId: convId,
          messageIds: [msg.id],
          userId: currentUser.id,
        })
      }
    }

    const onTyping = (data: {
      conversationId: string
      userId: string
      userName: string
      isTyping: boolean
    }) => {
      if (data.conversationId !== convId) return
      if (data.userId === currentUser.id) return
      setTypingUser(data.isTyping ? { name: data.userName } : null)
    }

    const onRead = (data: {
      conversationId: string
      messageIds: string[]
      userId: string
    }) => {
      if (data.conversationId !== convId) return
      const ids = new Set(data.messageIds)
      setMessages((prev) =>
        prev.map((m) => (ids.has(m.id) ? { ...m, status: 'read' } : m))
      )
    }

    const onDelivered = (data: {
      conversationId: string
      messageIds: string[]
      userId: string
    }) => {
      if (data.conversationId !== convId) return
      const ids = new Set(data.messageIds)
      setMessages((prev) =>
        prev.map((m) =>
          ids.has(m.id) && m.status !== 'read'
            ? { ...m, status: 'delivered' }
            : m
        )
      )
    }

    socket.on('new-message', onNewMessage)
    socket.on('typing', onTyping)
    socket.on('message-read', onRead)
    socket.on('message-delivered', onDelivered)
    return () => {
      socket.off('new-message', onNewMessage)
      socket.off('typing', onTyping)
      socket.off('message-read', onRead)
      socket.off('message-delivered', onDelivered)
    }
  }, [socket, convId, currentUser.id])

  // ---- auto scroll to bottom on new messages ----
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, typingUser])

  // ---- mark as read when messages load / change & conversation is open ----
  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/conversations/${convId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })
      onMessagesChanged()
    } catch {
      /* ignore */
    }
  }, [convId, currentUser.id, onMessagesChanged])

  useEffect(() => {
    if (loading) return
    const hasUnreadFromOthers = messages.some(
      (m) => m.senderId !== currentUser.id && m.status !== 'read'
    )
    if (hasUnreadFromOthers) {
      markRead()
      // also notify senders via socket that their messages were read
      const ids = messages
        .filter((m) => m.senderId !== currentUser.id)
        .map((m) => m.id)
      if (socket && ids.length) {
        socket.emit('message-read', {
          conversationId: convId,
          messageIds: ids,
          userId: currentUser.id,
        })
      }
    }
  }, [loading, messages.length])

  // ---- typing indicator emit ----
  const emitTyping = (isTyping: boolean) => {
    if (!socket) return
    socket.emit('typing', {
      conversationId: convId,
      userId: currentUser.id,
      userName: currentUser.name,
      isTyping,
    })
    typingActive.current = isTyping
  }

  const handleInputChange = (val: string) => {
    setInput(val)
    if (!typingActive.current && val.trim()) {
      emitTyping(true)
    }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      if (typingActive.current) emitTyping(false)
    }, 1800)
  }

  // ---- send message ----
  const sendMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    setShowEmoji(false)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    if (typingActive.current) emitTyping(false)

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: currentUser.id, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to send')
      const saved: ChatMessage = data.message
      setMessages((prev) => {
        if (prev.find((m) => m.id === saved.id)) return prev
        return [...prev, saved]
      })
      // relay to other participants (room + personal rooms for list refresh)
      socket?.emit('send-message', {
        message: saved,
        participantIds: conversation.participants.map((p) => p.id),
      })
      onMessagesChanged()
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  // ---- group messages by day for separators ----
  const renderMessages = () => {
    const nodes: React.ReactNode[] = []
    let lastDate: Date | null = null
    messages.forEach((m, i) => {
      const d = new Date(m.createdAt)
      if (!lastDate || !isSameDay(lastDate, d)) {
        nodes.push(
          <div key={`sep-${m.id}`} className="my-3 flex justify-center">
            <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">
              {dateLabel(d)}
            </span>
          </div>
        )
      }
      const prev = messages[i - 1]
      const grouped = prev && prev.senderId === m.senderId && isSameDay(new Date(prev.createdAt), d)
      nodes.push(
        <MessageBubble
          key={m.id}
          message={m}
          mine={m.senderId === currentUser.id}
          showName={conversation.isGroup && m.senderId !== currentUser.id && !grouped}
        />
      )
      lastDate = d
    })
    return nodes
  }

  const headerSubtitle = conversation.isGroup
    ? `${conversation.participants.length} members`
    : typingUser
      ? 'typing…'
      : otherOnline
        ? 'online'
        : 'offline'

  return (
    <div className="flex h-[100dvh] flex-col bg-[#EAF1FB]">
      {/* Header */}
      <header className="safe-top safe-x flex items-center gap-2 bg-[#1E3A8A] px-2 pb-2 pt-2 text-white shadow-md shadow-black/10 sm:gap-3 sm:px-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar
          name={conversation.name || '?'}
          color={conversation.avatarColor}
          isGroup={conversation.isGroup}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">
            {conversation.name || 'Unknown'}
          </div>
          <div
            className={`truncate text-xs leading-tight ${
              typingUser ? 'text-[#93C5FD]' : 'text-white/70'
            }`}
          >
            {headerSubtitle}
          </div>
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15" aria-label="Call">
          <Video className="h-5 w-5" />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15" aria-label="Phone">
          <Phone className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="thin-scrollbar flex-1 overflow-y-auto px-3 py-2"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23a8c4ec' fill-opacity='0.28'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        {loading && (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500">
            Loading messages…
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex justify-center py-10">
            <span className="rounded-lg bg-white/85 px-3 py-2 text-center text-sm text-gray-600 shadow-sm">
              No messages yet. Say hello! 👋
            </span>
          </div>
        )}
        {!loading && renderMessages()}

        {typingUser && (
          <div className="mt-1 flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* Emoji bar */}
      {showEmoji && (
        <div className="flex flex-wrap gap-1 border-t border-gray-200 bg-white px-3 py-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setInput((prev) => prev + e)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-2xl hover:bg-gray-100 active:bg-gray-200"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="safe-bottom safe-x flex items-end gap-1.5 bg-[#F1F5FB] px-2 py-2 sm:gap-2 sm:px-3">
        <button
          onClick={() => setShowEmoji((s) => !s)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-gray-200 active:bg-gray-300 ${
            showEmoji ? 'text-[#2563EB]' : 'text-gray-500'
          }`}
          aria-label="Emoji"
        >
          <Smile className="h-6 w-6" />
        </button>
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 active:bg-gray-300"
          aria-label="Attach"
        >
          <Paperclip className="h-6 w-6" />
        </button>
        <input
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Type a message"
          enterKeyHint="send"
          inputMode="text"
          className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-[15px] shadow-sm outline-none transition placeholder:text-gray-400"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-md shadow-[#2563EB]/30 transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  mine,
  showName,
}: {
  message: ChatMessage
  mine: boolean
  showName?: boolean
}) {
  return (
    <div className={`mt-0.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-3 py-1.5 shadow-sm sm:max-w-[65%] ${
          mine
            ? 'rounded-br-sm bg-[#2563EB] text-white'
            : 'rounded-bl-sm bg-white text-gray-900'
        }`}
      >
        {showName && (
          <div
            className="mb-0.5 text-xs font-semibold"
            style={{ color: message.senderAvatarColor }}
          >
            {message.senderName}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {message.content}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1">
          <span
            className={`text-[10px] ${
              mine ? 'text-white/70' : 'text-gray-400'
            }`
          }>
            {formatChatTime(message.createdAt)}
          </span>
          {mine &&
            (message.status === 'read' ? (
              <CheckCheck className="h-3.5 w-3.5 text-white" />
            ) : message.status === 'delivered' ? (
              <CheckCheck className="h-3.5 w-3.5 text-white/60" />
            ) : (
              <Check className="h-3.5 w-3.5 text-white/60" />
            ))}
        </div>
      </div>
    </div>
  )
}

function dateLabel(d: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return format(d, 'dd/MM/yyyy')
}
