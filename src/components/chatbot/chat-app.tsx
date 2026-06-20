'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, SquarePen, EyeOff } from 'lucide-react'
import { Sidebar } from './sidebar'
import { MessageList } from './message-list'
import { Composer } from './composer'
import { Welcome } from './welcome'
import { SettingsPanel } from './settings-panel'
import { LoginScreen } from './login-screen'
import { IncognitoToggle } from './incognito-toggle'
import { getStore } from '@/lib/storage'
import { useThemeSync } from '@/lib/theme'
import { useSettings } from '@/lib/settings'
import { useAuth } from '@/lib/auth'
import { useIncognito } from '@/lib/incognito'
import { toast } from 'sonner'
import type { Conversation, ChatMessage, ApiMessage } from '@/lib/types'
import { NEW_CHAT_TITLE, TITLE_MAX_LENGTH } from '@/lib/types'
import type { MemoryNote } from '@/lib/settings'

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ---- auth ----
  const {
    user,
    loading: authLoading,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    signOut,
  } = useAuth()
  const userId = user?.id || null

  // keep theme in sync
  useThemeSync()
  const { prefs, memory, behaviorProfile, loadMemory, setUserId, addMemory } =
    useSettings()

  // sync settings userId + load memory when user changes
  useEffect(() => {
    setUserId(userId)
    if (userId) loadMemory()
  }, [userId, setUserId, loadMemory])

  const abortRef = useRef<AbortController | null>(null)
  const skipNextLoad = useRef(false)

  // store is user-scoped — recreate when userId changes
  const store = userId ? getStore(userId) : null

  // ---- load conversation list ----
  const refreshConvos = useCallback(async () => {
    if (!store) {
      setLoadingConvos(false)
      return
    }
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
    if (userId) refreshConvos()
    else setLoadingConvos(false)
  }, [refreshConvos, userId])

  // ---- load messages when active changes ----
  useEffect(() => {
    if (!activeId || !store) {
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
    // In incognito mode, just clear in-memory messages (no storage)
    if (useIncognito.getState().enabled) {
      setActiveId(null)
      setMessages([])
      setSidebarOpen(false)
      return
    }
    if (!store) return
    try {
      const conv = await store.createConversation(NEW_CHAT_TITLE)
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
      if (!store) return
      try {
        await store.deleteConversation(id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
        }
        toast.success('Obrolan dihapus')
      } catch (e) {
        console.error(e)
        toast.error('Gagal menghapus obrolan')
      }
    },
    [store, activeId]
  )

  // ---- rename ----
  const handleRename = useCallback(
    async (id: string, title: string) => {
      if (!store) return
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
      // Incognito mode: no storage at all — pure in-memory chat
      const incognito = useIncognito.getState().enabled

      if (!incognito && !store) return

      // ensure a conversation — title it from the first user message
      let convId = activeId
      if (!incognito && !convId) {
        const title = text.slice(0, TITLE_MAX_LENGTH).trim() || NEW_CHAT_TITLE
        try {
          const conv = await store!.createConversation(title)
          convId = conv.id
          setConversations((prev) => [conv, ...prev])
          skipNextLoad.current = true
          setActiveId(conv.id)
        } catch (e) {
          console.error(e)
          return
        }
      }
      if (!convId) convId = 'incognito-session'

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

      // persist user message (skip in incognito)
      if (!incognito) {
        store!.addMessage(convId, 'user', text).catch((e) => console.error(e))
        store!.touchConversation(convId).catch(() => {})
      }

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
          body: JSON.stringify({
            messages: apiMessages,
            conversationId: convId,
            prefs,
            memory,
            behaviorProfile,
            provider: prefs.provider,
          }),
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

        // persist the assistant reply (skip in incognito)
        if (!incognito) {
          await store!.addMessage(convId, 'assistant', accumulated || '_(no response)_')
          store!.touchConversation(convId).catch(() => {})
          refreshConvos()

          // ── Auto-extract memories from this conversation (background, no block) ──
          const allMsgs: ApiMessage[] = [...messages, userMsg, { role: 'assistant', content: accumulated }].map((m) => ({
            role: m.role,
            content: m.content,
          }))
          extractMemories(allMsgs, memory, addMemory).catch(() => {})
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          // user stopped; persist partial (skip in incognito)
          if (!incognito) {
            if (accumulated) {
              store!.addMessage(convId, 'assistant', accumulated).catch(() => {})
            } else {
              setMessages((prev) =>
                prev.filter((m) => m.id !== assistantMsg.id)
              )
            }
          } else if (!accumulated) {
            setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
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
    [activeId, messages, store, refreshConvos, prefs, memory, behaviorProfile, addMemory]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const activeConv = conversations.find((c) => c.id === activeId) || null
  const showWelcome = !activeId && !loadingConvos && messages.length === 0
  const incognito = useIncognito((s) => s.enabled)

  // ---- auth gate: show login screen if not authenticated (and not loading) ----
  if (!authLoading && !user) {
    return (
      <LoginScreen
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onGuest={signInAsGuest}
      />
    )
  }

  if (authLoading || !user) {
    return (
      <div className="mesh-bg flex h-[100dvh] items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#0A84FF]" />
          <span className="text-sm">Memuat…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mesh-bg relative flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        userName={user.name}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        onRename={handleRename}
        onSettings={() => {
          setSidebarOpen(false)
          setSettingsOpen(true)
        }}
        onSignOut={signOut}
      />

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Floating glass top bar */}
        <header className="safe-top glass-bar sticky top-0 z-20 mx-2 mt-2 flex items-center gap-1.5 rounded-2xl px-2.5 py-2.5 shadow-md sm:mx-3 sm:mt-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10 sm:hidden"
            aria-label="Buka obrolan"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 dark:text-white">
              {activeConv?.title || 'Epong AI'}
            </h1>
          </div>
          <IncognitoToggle />
          <button
            onClick={handleNew}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Obrolan baru"
          >
            <SquarePen className="h-[18px] w-[18px]" />
          </button>
        </header>

        {/* Incognito mode banner */}
        {incognito && (
          <div className="mx-2 mb-1 flex items-center justify-center gap-2 rounded-full bg-violet-500/10 px-4 py-1.5 sm:mx-3">
            <EyeOff className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-[12px] font-medium text-violet-700 dark:text-violet-300">
              Mode penyamaran — obrolan tidak disimpan
            </span>
          </div>
        )}

        {/* Body */}
        {showWelcome ? (
          <div className="flex flex-1 flex-col">
            <Welcome userName={user.name} />
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

      {/* Settings */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

// ── Auto-memory extraction helper ──
// Runs in background after each AI reply. Calls /api/extract-memory,
// then adds any new memories to the store (with deduplication).
async function extractMemories(
  messages: ApiMessage[],
  existingMemory: MemoryNote[],
  addMemory: (content: string, category?: MemoryNote['category']) => Promise<void>
) {
  try {
    const res = await fetch('/api/extract-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, existingMemory }),
    })
    if (!res.ok) return
    const data = await res.json()
    const memories: Array<{ content: string; category: string }> =
      data.memories || []
    if (memories.length === 0) return

    // Dedupe against existing memory (case-insensitive substring check)
    const existingLower = existingMemory.map((m) => m.content.toLowerCase())
    let added = 0
    for (const m of memories) {
      const contentLower = m.content.toLowerCase()
      const isDuplicate = existingLower.some(
        (e) => e.includes(contentLower) || contentLower.includes(e)
      )
      if (!isDuplicate) {
        await addMemory(m.content, m.category as MemoryNote['category'])
        existingLower.push(contentLower)
        added++
      }
    }
    if (added > 0) {
      toast.success(`${added} memori baru tersimpan otomatis`, {
        duration: 2500,
      })
    }
  } catch {
    // silent — extraction is best-effort, never block the chat
  }
}
