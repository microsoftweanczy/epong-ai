'use client'

import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
  provider?: string
  isGuest?: boolean
}

const GUEST_KEY = 'epong-guest-session'

function normalizeUser(u: User | null): AuthUser | null {
  if (!u) return null
  const meta = u.user_metadata || {}
  const name =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    (u.email ? u.email.split('@')[0] : 'Teman')
  return {
    id: u.id,
    email: u.email || '',
    name,
    avatarUrl: meta.avatar_url || meta.picture,
    provider: u.app_metadata?.provider,
  }
}

function loadGuest(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveGuest(user: AuthUser) {
  if (typeof window === 'undefined') return
  localStorage.setItem(GUEST_KEY, JSON.stringify(user))
}

function clearGuest() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(GUEST_KEY)
}

/**
 * Auth hook. Returns the current authenticated user (or null) + signIn/signUp/signOut.
 * Uses Supabase Auth with email + password, OR guest mode (no email needed).
 */
export function useAuth() {
  // Initialize with guest session if exists (lazy init, no setState in effect)
  const [user, setUser] = useState<AuthUser | null>(() => loadGuest())
  // If Supabase isn't configured, there's nothing to load — start ready.
  const [loading, setLoading] = useState(() => supabase !== null)

  useEffect(() => {
    // If already have a guest session, nothing more to do
    if (loadGuest()) {
      return
    }

    if (!supabase) {
      return
    }

    let cancelled = false

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(normalizeUser(data.session?.user ?? null))
      setLoading(false)
    })

    // Listen for auth changes (login/logout/OAuth callback)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(normalizeUser(session?.user ?? null))
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: { message: 'Auth not configured' } as any }
    clearGuest() // clear any guest session
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    if (!supabase) return { error: { message: 'Auth not configured' } as any }
    clearGuest()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    return { data, error }
  }, [])

  const signInAsGuest = useCallback((name?: string) => {
    const guestName = name?.trim() || 'Tamu'
    const guestUser: AuthUser = {
      id: 'guest-' + (crypto.randomUUID?.() || Math.random().toString(36).slice(2)),
      email: '',
      name: guestName,
      provider: 'guest',
      isGuest: true,
    }
    saveGuest(guestUser)
    setUser(guestUser)
  }, [])

  const signOut = useCallback(async () => {
    // Clear guest session
    clearGuest()
    // Sign out from Supabase if there's a session
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
  }, [])

  return {
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    signOut,
  }
}
