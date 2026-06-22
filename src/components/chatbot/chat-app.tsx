'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, SquarePen, EyeOff, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // desktop hide/show
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatMode, setChatMode] = useState<'chat' | 'image'>('chat')

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
  const { prefs, memory, loadMemory, setUserId, addMemory, behaviorProfile } =
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

  // ---- load messages when active changes (with timeout — never hang) ----
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
    // Safety net: if getMessages hangs (e.g. Supabase unreachable),
    // clear loading after 8s so the UI never gets stuck.
    const timeout = setTimeout(() => {
      if (alive) {
        setLoadingMsgs(false)
        if (messages.length === 0) setMessages([])
      }
    }, 8000)
    store
      .getMessages(activeId)
      .then((msgs) => {
        if (alive) setMessages(msgs)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (alive) {
          clearTimeout(timeout)
          setLoadingMsgs(false)
        }
      })
    return () => {
      alive = false
      clearTimeout(timeout)
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
    // Don't create a conversation row yet — just clear the active view so
    // the welcome screen shows. The conversation is created lazily when
    // the user actually sends their first message (see handleSend).
    setActiveId(null)
    setMessages([])
    setSidebarOpen(false)
  }, [])

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

  // ---- generate an image (image mode) ----
  const handleGenerateImage = useCallback(
    async (prompt: string) => {
      const incognito = useIncognito.getState().enabled
      if (!incognito && !store) return

      // ensure a conversation — title it from the prompt
      let convId = activeId
      if (!incognito && !convId) {
        const title = prompt.slice(0, TITLE_MAX_LENGTH).trim() || NEW_CHAT_TITLE
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
        content: prompt,
        createdAt: new Date().toISOString(),
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: 'assistant',
        content: '🎨 Membuat gambar... (mohon tunggu 30-40 detik)',
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreamingId(assistantMsg.id)

      // persist user message
      if (!incognito) {
        store!.addMessage(convId, 'user', prompt).catch((e) => console.error(e))
      }

      // Client-side retry (up to 2 attempts) — the gateway may 502 on slow gens
      const MAX_CLIENT_RETRIES = 2
      let lastError: any = null

      for (let attempt = 1; attempt <= MAX_CLIENT_RETRIES; attempt++) {
        const controller = new AbortController()
        abortRef.current = controller
        // 90s client timeout — generous, since the API retries internally too
        const timeout = setTimeout(() => controller.abort(), 90_000)

        try {
          const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, size: '1024x1024' }),
            signal: controller.signal,
          })

          clearTimeout(timeout)

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error || `Request failed (${res.status})`)
          }

          const data = await res.json()
          if (data.image) {
            // Store the image as a special markdown content with the data URL
            const imageContent = `![${prompt}](${data.image})`
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: imageContent }
                  : m
              )
            )
            if (!incognito) {
              await store!.addMessage(convId, 'assistant', imageContent)
              refreshConvos()
            }
            // Success — exit the retry loop
            lastError = null
            break
          } else {
            throw new Error(data.error || 'No image in response')
          }
        } catch (e: any) {
          clearTimeout(timeout)
          lastError = e

          if (e.name === 'AbortError') {
            // User clicked stop — don't retry
            setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
            break
          }

          // Update placeholder with retry status
          if (attempt < MAX_CLIENT_RETRIES) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: `🎨 Mencoba lagi... (percobaan ${attempt + 1}/${MAX_CLIENT_RETRIES})` }
                  : m
              )
            )
            // Brief pause before retry
            await new Promise((r) => setTimeout(r, 1000))
          }
        }
      }

      // If all retries failed, show error
      if (lastError) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `*(Gagal membuat gambar: ${lastError.message}. Coba lagi dengan prompt yang lebih singkat.)*` }
              : m
          )
        )
      }

      setStreamingId(null)
      abortRef.current = null
    },
    [activeId, store, refreshConvos]
  )

  // ---- send a message (with streaming) ----
  const handleSend = useCallback(
    async (text: string) => {
      // Branch: image generation mode
      if (chatMode === 'image') {
        handleGenerateImage(text)
        return
      }

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
            prefs,
            memory,
            behaviorProfile,
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
              if (json.searchPerformed) {
                // Show "searching web..." with source count + query
                const sources = json.sources || 0
                const pages = json.pagesRead || 0
                const query = json.query ? `: "${json.query}"` : ''
                const searchMsg =
                  pages > 0
                    ? `🔍 Mencari di ${sources} sumber, membaca ${pages} halaman${query}...`
                    : sources > 0
                    ? `🔍 Mencari di ${sources} sumber${query}...`
                    : `🔍 Mencari informasi terbaru di internet${query}...`
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: searchMsg }
                      : m
                  )
                )
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
          const replyText = accumulated || '_(no response)_'
          await store!.addMessage(convId, 'assistant', replyText)
          refreshConvos()

          // ── Auto-extract memories from this conversation (background, no block) ──
          const allMsgs: ApiMessage[] = [...messages, userMsg, { role: 'assistant' as const, content: accumulated }].map((m) => ({
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
    [activeId, messages, store, refreshConvos, prefs, memory, addMemory, behaviorProfile, chatMode, handleGenerateImage]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // ---- retry: regenerate the last assistant response ----
  const handleRetry = useCallback(
    (assistantMsgId: string) => {
      // Find the target assistant message + the user message that preceded it
      const idx = messages.findIndex((m) => m.id === assistantMsgId)
      if (idx === -1) return
      // Walk back to find the last user message before this assistant message
      let userIdx = -1
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userIdx = i
          break
        }
      }
      if (userIdx === -1) return

      // Rebuild the message history UP TO (but not including) the assistant
      // message being retried. Then remove the old assistant message + re-send.
      const historyBefore = messages.slice(0, idx) // includes the user msg
      const userText = messages[userIdx].content

      // Remove the old assistant message from UI
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId))

      // Re-invoke handleSend with the same user text, but using the existing
      // history (so handleSend doesn't re-add the user message).
      // We accomplish this by temporarily swapping `messages` semantics:
      // handleSend appends userMsg to [...messages], so we pass history
      // EXCLUDING the last user message (handleSend will re-add it).
      // However, handleSend reads `messages` from closure — so we call a
      // minimal inline version here for the retry path.
      void retryStream(userText, historyBefore)
    },
    [messages]
  )

  // Internal: stream a retry. Reuses the same logic as handleSend but with
  // a pre-built message history (the retried user msg is already in history).
  const retryStream = useCallback(
    async (text: string, history: ChatMessage[]) => {
      const incognito = useIncognito.getState().enabled
      const convId = activeId || 'incognito-session'

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        conversationId: convId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingId(assistantMsg.id)

      const apiMessages: ApiMessage[] = history.map((m) => ({
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
            prefs,
            memory,
            behaviorProfile,
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
              if (json.searchPerformed) {
                const sources = json.sources || 0
                const pages = json.pagesRead || 0
                const query = json.query ? `: "${json.query}"` : ''
                const searchMsg =
                  pages > 0
                    ? `🔍 Mencari di ${sources} sumber, membaca ${pages} halaman${query}...`
                    : sources > 0
                    ? `🔍 Mencari di ${sources} sumber${query}...`
                    : `🔍 Mencari informasi terbaru di internet${query}...`
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: searchMsg }
                      : m
                  )
                )
              }
              if (json.content) {
                accumulated += json.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated }
                      : m
                  )
                )
              }
            } catch {
              /* ignore */
            }
          }
        }
        // persist the new assistant reply
        if (!incognito && store && convId !== 'incognito-session') {
          await store.addMessage(convId, 'assistant', accumulated || '_(no response)_')
          refreshConvos()
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          if (!accumulated) {
            setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id))
          } else if (!incognito && store && convId !== 'incognito-session') {
            store.addMessage(convId, 'assistant', accumulated).catch(() => {})
          }
        } else {
          console.error(e)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `*(Terjadi kesalahan: ${e.message})*` }
                : m
            )
          )
        }
      } finally {
        setStreamingId(null)
        abortRef.current = null
      }
    },
    [activeId, store, refreshConvos, prefs, memory, behaviorProfile]
  )

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
    <div className="mesh-bg relative flex h-[100dvh] w-full justify-center overflow-hidden p-0 lg:p-4 xl:p-5 2xl:p-6">
      <div className="app-shell relative flex h-full w-full overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          open={sidebarOpen}
          collapsed={sidebarCollapsed}
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
          {/* Top bar — flush to the card edge on desktop, floating on mobile */}
          <header className="safe-top glass-bar sticky top-0 z-20 flex items-center gap-1 px-2 py-2 shadow-sm sm:gap-1.5 sm:px-3 lg:rounded-t-3xl">
            {/* Mobile: open sidebar (slide-over) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10 sm:hidden"
              aria-label="Buka obrolan"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            {/* Desktop: collapse/expand sidebar toggle */}
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10 sm:flex"
              aria-label={sidebarCollapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
              title={sidebarCollapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px]" />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px]" />
              )}
            </button>
            <div className="min-w-0 flex-1 px-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[17px] dark:text-white">
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
            <div className="mx-3 mb-0.5 mt-1 flex items-center justify-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1">
              <EyeOff className="h-3 w-3 text-violet-600 dark:text-violet-400" />
              <span className="text-[11px] font-medium text-violet-700 sm:text-[12px] dark:text-violet-300">
                Mode penyamaran — obrolan tidak disimpan
              </span>
            </div>
          )}

          {/* Body */}
          {showWelcome ? (
            <div className="thin-scrollbar flex flex-1 flex-col overflow-y-auto">
              <Welcome userName={user.name} onPick={handleSend} />
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                streamingId={streamingId}
                onRetry={handleRetry}
              />
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
            mode={chatMode}
            onToggleMode={() => setChatMode((m) => (m === 'chat' ? 'image' : 'chat'))}
          />
        </main>
      </div>

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
