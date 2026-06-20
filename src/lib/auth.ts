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
}

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

/**
 * Auth hook. Returns the current authenticated user (or null) + signIn/signOut.
 * Works with Supabase Auth OAuth (Google / Apple).
 * If Supabase isn't configured, auth is skipped (guest mode).
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  // If Supabase isn't configured, there's nothing to load — start ready.
  const [loading, setLoading] = useState(() => supabase !== null)

  useEffect(() => {
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

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
  }, [])

  const signInWithApple = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return { user, loading, signInWithGoogle, signInWithApple, signOut }
}
