'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/session-store'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { Onboarding } from './onboarding'
import { ChatList } from './chat-list'
import { ChatView } from './chat-view'
import { NewChatDialog } from './new-chat-dialog'
import type { ConversationSummary } from '@/lib/chat-types'
import type { Socket } from 'socket.io-client'

export function ChatApp() {
  const user = useSession((s) => s.user)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)

  // refresh signal so children can ask the parent to refetch the list
  const [refreshTick, setRefreshTick] = useState(0)
  const requestRefresh = useCallback(() => setRefreshTick((t) => t + 1), [])

  // ---- establish socket connection once we have a user ----
  useEffect(() => {
    if (!user) return
    const s = getSocket()
    setSocket(s)

    const onConnect = () => {
      s.emit('user-online', { userId: user.id })
    }
    const onOnline = (data: { userIds: string[] }) => {
      setOnlineUserIds(data.userIds)
    }
    const onPresence = (data: { userId: string; isOnline: boolean }) => {
      setOnlineUserIds((prev) => {
        if (data.isOnline) {
          return prev.includes(data.userId) ? prev : [...prev, data.userId]
        }
        return prev.filter((id) => id !== data.userId)
      })
    }
    const onNewMessage = () => {
      // any incoming message -> refetch the list to update last message/unread
      setRefreshTick((t) => t + 1)
    }

    if (s.connected) onConnect()
    s.on('connect', onConnect)
    s.on('online-users', onOnline)
    s.on('presence', onPresence)
    s.on('new-message', onNewMessage)

    return () => {
      s.off('connect', onConnect)
      s.off('online-users', onOnline)
      s.off('presence', onPresence)
      s.off('new-message', onNewMessage)
      // keep the socket alive across user changes; only disconnect on unmount
    }
  }, [user])

  // disconnect socket when user logs out (user becomes null)
  useEffect(() => {
    if (!user) {
      disconnectSocket()
      setSocket(null)
      setOnlineUserIds([])
      setConversations([])
      setActiveId(null)
    }
  }, [user])

  // ---- fetch conversations ----
  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/conversations?userId=${user.id}`)
        const data = await res.json()
        if (active && res.ok) {
          setConversations(data.conversations || [])
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoadingConvos(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user, refreshTick])

  // light polling fallback (every 15s) to catch messages when a tab is idle
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!user) return
    pollRef.current = setInterval(() => {
      setRefreshTick((t) => t + 1)
    }, 15000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user])

  if (!user) {
    return <Onboarding />
  }

  const activeConversation = conversations.find((c) => c.id === activeId) || null

  return (
    <div className="mx-auto h-[100dvh] w-full max-w-md overflow-hidden bg-white shadow-xl sm:my-0">
      {activeConversation ? (
        <ChatView
          conversation={activeConversation}
          currentUser={user}
          onlineUserIds={onlineUserIds}
          socket={socket}
          onBack={() => setActiveId(null)}
          onMessagesChanged={requestRefresh}
        />
      ) : (
        <ChatList
          conversations={conversations}
          onlineUserIds={onlineUserIds}
          loading={loadingConvos}
          onSelect={(id) => setActiveId(id)}
          onNewChat={() => setNewChatOpen(true)}
        />
      )}

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        currentUserId={user.id}
        onCreated={(id) => {
          setNewChatOpen(false)
          setRefreshTick((t) => t + 1)
          setActiveId(id)
        }}
      />
    </div>
  )
}
