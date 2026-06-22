'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from './supabase'

// ────────────────────────────────────────────────────────────
// Preferences — user-tunable behavior of the AI (localStorage, instant)
// ────────────────────────────────────────────────────────────

export type ToneStyle = 'santai' | 'profesional' | 'akrab' | 'formal'
export type Verbosity = 'ringkas' | 'seimbang' | 'rinci'
export type HumorLevel = 'nonaktif' | 'sedikit' | 'sering'

export interface Preferences {
  tone: ToneStyle
  verbosity: Verbosity
  humor: HumorLevel
  empathy: boolean // adapt to user's emotion
  critical: boolean // challenge ideas critically when needed
  safeMode: boolean // filter NSFW content
}

const DEFAULT_PREFS: Preferences = {
  tone: 'santai',
  verbosity: 'seimbang',
  humor: 'sedikit',
  empathy: true,
  critical: true,
  safeMode: false,
}

// ────────────────────────────────────────────────────────────
// Memory — facts the AI remembers about the user
// (Supabase when available, localStorage fallback)
// ────────────────────────────────────────────────────────────

export interface MemoryNote {
  id: string
  content: string
  category: 'fakta' | 'preferensi' | 'tujuan' | 'konteks'
  createdAt: string
}

interface SettingsState {
  prefs: Preferences
  setPrefs: (p: Partial<Preferences>) => void
  resetPrefs: () => void

  userId: string | null
  setUserId: (id: string | null) => void

  memory: MemoryNote[]
  memoryLoaded: boolean
  loadMemory: () => Promise<void>
  addMemory: (content: string, category?: MemoryNote['category']) => Promise<void>
  updateMemory: (id: string, content: string) => Promise<void>
  deleteMemory: (id: string) => Promise<void>

  // auto-generated behavior profile (summary of how the user tends to interact)
  behaviorProfile: string
  setBehaviorProfile: (s: string) => void
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function isGuestUser(uid: string | null): boolean {
  return !!uid && uid.startsWith('guest-')
}

function localMemoryKey(userId: string) {
  return `epong-memory-${userId}`
}

function loadLocalMemory(userId: string): MemoryNote[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(localMemoryKey(userId)) || '[]')
  } catch {
    return []
  }
}
function saveLocalMemory(userId: string, notes: MemoryNote[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(localMemoryKey(userId), JSON.stringify(notes))
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      prefs: DEFAULT_PREFS,
      setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      resetPrefs: () => set({ prefs: DEFAULT_PREFS }),

      userId: null,
      setUserId: (id) => {
        set({ userId: id, memory: [], memoryLoaded: false })
      },

      memory: [],
      memoryLoaded: false,
      loadMemory: async () => {
        const uid = get().userId
        if (!uid) {
          set({ memory: [], memoryLoaded: true })
          return
        }
        // Guest users: always local (no Supabase auth session)
        if (!isGuestUser(uid) && supabase) {
          try {
            const { data, error } = await supabase
              .from('user_memory')
              .select('id, content, category, created_at')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
            if (error) throw error
            const notes: MemoryNote[] = (data || []).map((r: any) => ({
              id: r.id,
              content: r.content,
              category: r.category,
              createdAt: r.created_at,
            }))
            set({ memory: notes, memoryLoaded: true })
            return
          } catch {
            /* fall back to local */
          }
        }
        set({ memory: loadLocalMemory(uid), memoryLoaded: true })
      },
      addMemory: async (content, category = 'fakta') => {
        const uid = get().userId
        if (!uid) return
        const note: MemoryNote = {
          id: uuid(),
          content: content.trim(),
          category,
          createdAt: new Date().toISOString(),
        }
        if (!note.content) return
        if (!isGuestUser(uid) && supabase) {
          try {
            const { error } = await supabase.from('user_memory').insert({
              id: note.id,
              user_id: uid,
              content: note.content,
              category: note.category,
              created_at: note.createdAt,
            })
            if (error) throw error
          } catch {
            // fall back to local
          }
        }
        const local = (!isGuestUser(uid) && supabase) ? get().memory : loadLocalMemory(uid)
        const updated = [note, ...local]
        if (isGuestUser(uid) || !supabase) saveLocalMemory(uid, updated)
        set({ memory: updated })
      },
      updateMemory: async (id, content) => {
        const uid = get().userId
        if (!uid) return
        const trimmed = content.trim()
        if (!isGuestUser(uid) && supabase) {
          try {
            const { error } = await supabase
              .from('user_memory')
              .update({ content: trimmed })
              .eq('id', id)
              .eq('user_id', uid)
            if (error) throw error
          } catch {
            /* ignore */
          }
        }
        set({
          memory: get().memory.map((m) =>
            m.id === id ? { ...m, content: trimmed } : m
          ),
        })
        if (isGuestUser(uid) || !supabase) saveLocalMemory(uid, get().memory)
      },
      deleteMemory: async (id) => {
        const uid = get().userId
        if (!uid) return
        if (!isGuestUser(uid) && supabase) {
          try {
            await supabase
              .from('user_memory')
              .delete()
              .eq('id', id)
              .eq('user_id', uid)
          } catch {
            /* ignore */
          }
        }
        set({ memory: get().memory.filter((m) => m.id !== id) })
        if (isGuestUser(uid) || !supabase) saveLocalMemory(uid, get().memory)
      },

      behaviorProfile: '',
      setBehaviorProfile: (s) => set({ behaviorProfile: s }),
    }),
    {
      name: 'epong-settings',
      partialize: (s) => ({
        prefs: s.prefs,
        behaviorProfile: s.behaviorProfile,
      }),
    }
  )
)
