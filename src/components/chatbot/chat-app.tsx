'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, SquarePen } from 'lucide-react'
import { Sidebar } from './sidebar'
import { MessageList } from './message-list'
import { Composer } from './composer'
import { Welcome } from './welcome'
import { getStore, onStorageResolved } from '@/lib/storage'
import { toast } from 'sonner'
import type { Conversation, ChatMessage, ApiMessage } from '@/lib/types'

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [backend, setBackend] = useState<'supabase' | 'local'>('local')

  const abortRef = useRef<AbortController | null>(null)
  const skipNextLoad = useRef(false)
  const store = getStore()

  // detect which storage backend is actually in use (Supabase vs local fallback)
  useEffect(() => {
    onStorageResolved((b, reason) => {
      setBackend(b)
      ;(window as any).__ariaBackend = b
      if (b === 'local' && reason === 'supabase-unavailable') {
        toast.warning(
          'Tabel Supabase belum ditemukan — menyimpan secara lokal untuk sekarang. Jalankan skema SQL di dashboard Supabase Anda untuk mengaktifkan sinkronisasi cloud.',
          { duration: 9000 }
        )
      } else if (b === 'supabase') {
        toast.success('Terhubung ke Supabase ✓', { duration: 3000 })
      }
    })
  }, [])

  // ---- load conversation list ----
  const refreshConvos = useCallback(async () => {
    try {
      const list = await store.listConversations()
      setConversations(list)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingConvos(false)
    }
  }, [store])

  useEffect(() => {
    refreshConvos()
  }, [refreshConvos])

  // ---- load messages when active changes ----
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    // If a send/new just created this conversation, keep the optimistic
    // messages instead of reloading (which would clobber the in-flight reply).
    if (skipNextLoad.current) {
      skipNextLoad.current = false
      return
    }
    let alive = true
    setLoadingMsgs(true)
    store
      .getMessages(activeId)
      .then((msgs) => {
        if (alive) setMessages(msgs)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (alive) setLoadingMsgs(false)
      })
    return () => {
      alive = false
    }
  }, [activeId, store])

  // ---- new conversation ----
  const handleNew = useCallback(async () => {
    try {
      const conv = await store.createConversation('New Chat')
      setConversations((prev) => [conv, ...prev])
      skipNextLoad.current = true
      setActiveId(conv.id)
      setMessages([])
      setSidebarOpen(false)
    } catch (e) {
      console.error(e)
    }
  }, [store])

  // ---- select conversation ----
  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id)
      setSidebarOpen(false)
    },
    []
  )

  // ---- delete ----
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await store.deleteConversation(id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
        }
      } catch (e) {
        console.error(e)
      }
    },
    [store, activeId]
  )

  // ---- rename ----
  const handleRename = useCallback(
    async (id: string, title: string) => {
      try {
        await store.renameConversation(id, title)
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c))
        )
      } catch (e) {
        console.error(e)
      }
    },
    [store]
  )

  // ---- send a message (with streaming) ----
  const handleSend = useCallback(
    async (text: string) => {
      // ensure a conversation — title it from the first user message
      let convId = activeId
      if (!convId) {
        const title = text.slice(0, 42).trim() || 'Obrolan Baru'
        try {
          const conv = await store.createConversation(title)
          convId = conv.id
          setConversations((prev) => [conv, ...prev])
          skipNextLoad.current = true
          setActiveId(conv.id)
        } catch (e) {
          console.error(e)
          return
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      }

      // optimistic UI
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreamingId(assistantMsg.id)

      // persist user message
      store
        .addMessage(convId, 'user', text)
        .catch((e) => console.error(e))
      store.touchConversation(convId).catch(() => {})

      // build API payload from current messages + the new user text
      const apiMessages: ApiMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const controller = new AbortController()
      abortRef.current = controller
      let accumulated = ''

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, conversationId: convId }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              if (json.error) {
                accumulated += `\n\n*(Error: ${json.error})*`
                break
              }
              if (json.content) {
                accumulated += json.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: accumulated } : m
                  )
                )
              }
            } catch {
              /* ignore */
            }
          }
        }

        // persist the assistant reply
        await store.addMessage(convId, 'assistant', accumulated || '_(no response)_')
        store.touchConversation(convId).catch(() => {})
        refreshConvos()
      } catch (e: any) {
        if (e.name === 'AbortError') {
          // user stopped; persist partial
          if (accumulated) {
            store.addMessage(convId, 'assistant', accumulated).catch(() => {})
          } else {
            setMessages((prev) =>
              prev.filter((m) => m.id !== assistantMsg.id)
            )
          }
        } else {
          console.error(e)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `*(Something went wrong: ${e.message})*` }
                : m
            )
          )
        }
      } finally {
        setStreamingId(null)
        abortRef.current = null
      }
    },
    [activeId, messages, store, refreshConvos]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const activeConv = conversations.find((c) => c.id === activeId) || null
  const showWelcome = !activeId && !loadingConvos && messages.length === 0

  return (
    <div className="mesh-bg relative flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        backend={backend}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Floating glass top bar */}
        <header className="safe-top glass-bar sticky top-0 z-20 m-2 flex items-center gap-2 rounded-full px-2 py-2 shadow-md sm:m-3 sm:rounded-2xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/5 sm:hidden"
            aria-label="Buka obrolan"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[16px] font-semibold tracking-tight text-slate-800">
              {activeConv?.title || 'Epong AI'}
            </h1>
          </div>
          <button
            onClick={handleNew}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/5"
            aria-label="Obrolan baru"
          >
            <SquarePen className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        {showWelcome ? (
          <div className="flex flex-1 flex-col">
            <Welcome onPick={(p) => handleSend(p)} />
          </div>
        ) : (
          <>
            <MessageList messages={messages} streamingId={streamingId} />
            {loadingMsgs && messages.length === 0 && (
              <div className="flex items-center justify-center py-10 text-sm text-slate-400">
                Memuat obrolan…
              </div>
            )}
          </>
        )}

        {/* Composer */}
        <Composer
          onSend={handleSend}
          onStop={handleStop}
          busy={streamingId !== null}
        />
      </main>
    </div>
  )
}
