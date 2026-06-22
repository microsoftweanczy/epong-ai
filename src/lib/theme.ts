'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEffect } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  /** resolved theme actually applied (after system pref) */
  resolved: 'light' | 'dark'
  setResolved: (r: 'light' | 'dark') => void
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeClass(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      setMode: (m) => {
        const resolved =
          m === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : m
        applyThemeClass(resolved)
        set({ mode: m, resolved })
      },
      resolved: 'light',
      setResolved: (r) => {
        applyThemeClass(r)
        set({ resolved: r })
      },
    }),
    {
      name: 'epong-theme',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const r =
          state.mode === 'system'
            ? systemPrefersDark()
              ? 'dark'
              : 'light'
            : state.mode
        applyThemeClass(r)
        state.resolved = r
      },
    }
  )
)

/** Hook used once at app root to keep the <html> class in sync + listen to OS changes. */
export function useThemeSync() {
  const mode = useTheme((s) => s.mode)
  const setResolved = useTheme((s) => s.setResolved)

  useEffect(() => {
    const r =
      mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
    applyThemeClass(r)
    setResolved(r)

    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const nr = e.matches ? 'dark' : 'light'
      applyThemeClass(nr)
      setResolved(nr)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, setResolved])
}
