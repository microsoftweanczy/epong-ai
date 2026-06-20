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
  language: 'id' | 'en' // response language
}

const DEFAULT_PREFS: Preferences = {
  tone: 'santai',
  verbosity: 'seimbang',
  humor: 'sedikit',
  empathy: true,
  critical: true,
  language: 'id',
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

const LS_MEMORY_KEY = 'epong-memory-v1'

function loadLocalMemory(): MemoryNote[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LS_MEMORY_KEY) || '[]')
  } catch {
    return []
  }
}
function saveLocalMemory(notes: MemoryNote[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_MEMORY_KEY, JSON.stringify(notes))
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      prefs: DEFAULT_PREFS,
      setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      resetPrefs: () => set({ prefs: DEFAULT_PREFS }),

      memory: [],
      memoryLoaded: false,
      loadMemory: async () => {
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('user_memory')
              .select('id, content, category, created_at')
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
        set({ memory: loadLocalMemory(), memoryLoaded: true })
      },
      addMemory: async (content, category = 'fakta') => {
        const note: MemoryNote = {
          id: uuid(),
          content: content.trim(),
          category,
          createdAt: new Date().toISOString(),
        }
        if (!note.content) return
        if (supabase) {
          try {
            const { error } = await supabase.from('user_memory').insert({
              id: note.id,
              content: note.content,
              category: note.category,
              created_at: note.createdAt,
            })
            if (error) throw error
          } catch {
            // fall back to local
          }
        }
        const local = supabase ? get().memory : loadLocalMemory()
        const updated = [note, ...local]
        if (!supabase) saveLocalMemory(updated)
        set({ memory: updated })
      },
      updateMemory: async (id, content) => {
        const trimmed = content.trim()
        if (supabase) {
          try {
            const { error } = await supabase
              .from('user_memory')
              .update({ content: trimmed })
              .eq('id', id)
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
        if (!supabase) saveLocalMemory(get().memory)
      },
      deleteMemory: async (id) => {
        if (supabase) {
          try {
            await supabase.from('user_memory').delete().eq('id', id)
          } catch {
            /* ignore */
          }
        }
        set({ memory: get().memory.filter((m) => m.id !== id) })
        if (!supabase) saveLocalMemory(get().memory)
      },

      behaviorProfile: '',
      setBehaviorProfile: (s) => set({ behaviorProfile: s }),
    }),
    {
      name: 'epong-settings',
      partialize: (s) => ({
        prefs: s.prefs,
        behaviorProfile: s.behaviorProfile,
      }), // memory is loaded from Supabase/local separately
    }
  )
)
