'use client'

import { create } from 'zustand'

/**
 * Incognito mode store (session-only, NOT persisted).
 * When ON, messages are not saved to Supabase or localStorage.
 */

interface IncognitoState {
  enabled: boolean
  setEnabled: (v: boolean) => void
  toggle: () => void
}

export const useIncognito = create<IncognitoState>((set) => ({
  enabled: false,
  setEnabled: (v) => set({ enabled: v }),
  toggle: () => set((s) => ({ enabled: !s.enabled })),
}))
