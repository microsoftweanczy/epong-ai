'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatUser } from '@/lib/chat-types'

interface SessionState {
  user: ChatUser | null
  setUser: (user: ChatUser | null) => void
  clear: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clear: () => set({ user: null }),
    }),
    { name: 'familychat-session' }
  )
)
