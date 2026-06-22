'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  // Start with null on both server and client (avoids hydration mismatch).
  // Guest session is loaded in useEffect after hydration.
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Keep the latest user id in a ref so onAuthStateChange can dedupe
  // (Supabase fires INITIAL_SESSION + TOKEN_REFRESHED repeatedly with the
  // same session — without dedupe each event triggers a pointless re-render).
  const userIdRef = useRef<string | null>(null)

  const applyUser = useCallback((u: AuthUser | null) => {
    const newId = u?.id ?? null
    if (newId === userIdRef.current) {
      // Same user (or both null) — no state change needed.
      return
    }
    userIdRef.current = newId
    setUserState(u)
  }, [])

  useEffect(() => {
    let cancelled = false
    let settled = false

    const finish = (u: AuthUser | null) => {
      if (settled || cancelled) return
      settled = true
      applyUser(u)
      setLoading(false)
    }

    const init = async () => {
      // Check for existing guest session first (client-only, post-hydration)
      const guest = loadGuest()
      if (guest) {
        finish(guest)
        return
      }

      // No Supabase configured → instant finish (no timeout needed).
      if (!supabase) {
        finish(null)
        return
      }

      // Race getSession against a timeout — if Supabase is unreachable or
      // slow, we never want to be stuck on "Memuat…".
      let timedOut = false
      const timeout = setTimeout(() => {
        if (timedOut) return
        timedOut = true
        console.warn(
          '[auth] Supabase getSession timed out after 4s — proceeding unauthenticated.'
        )
        finish(null)
      }, 4000)

      try {
        const { data } = await supabase.auth.getSession()
        if (timedOut) return
        clearTimeout(timeout)
        finish(normalizeUser(data.session?.user ?? null))
      } catch (e) {
        if (timedOut) return
        clearTimeout(timeout)
        console.warn('[auth] getSession error:', e)
        finish(null)
      }
    }

    init()

    // Listen for auth changes (login/logout/OAuth callback).
    // Dedupe via applyUser so repeated IDENTICAL events don't re-render.
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: If a guest session exists, don't let Supabase auth events
      // (INITIAL_SESSION, TOKEN_REFRESHED) nullify the guest user. Supabase
      // fires INITIAL_SESSION with null when there's no Supabase session —
      // which would kick a guest user back to the login screen.
      const guest = loadGuest()
      if (guest) {
        // Only apply if the event brings a REAL Supabase user (e.g., after
        // email login the guest was already cleared by signInWithEmail).
        const supabaseUser = normalizeUser(session?.user ?? null)
        if (supabaseUser) {
          applyUser(supabaseUser)
        }
        // Otherwise: keep the guest. Don't nullify.
        setLoading(false)
        return
      }

      applyUser(normalizeUser(session?.user ?? null))
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [applyUser])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: { message: 'Auth not configured' } as any }
    clearGuest() // clear any guest session
    try {
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Login timeout — coba lagi')),
            10000
          )
        ),
      ])
      return { error }
    } catch (e: any) {
      return { error: { message: e?.message || 'Gagal masuk' } as any }
    }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    if (!supabase) return { error: { message: 'Auth not configured' } as any }
    clearGuest()
    try {
      const { data, error } = await Promise.race([
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Pendaftaran timeout — coba lagi')),
            10000
          )
        ),
      ])
      return { data, error }
    } catch (e: any) {
      return { error: { message: e?.message || 'Gagal daftar' } as any }
    }
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
    // Bypass dedupe: force-update ref + state together.
    userIdRef.current = guestUser.id
    setUserState(guestUser)
    setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    // Clear guest session
    clearGuest()
    // Sign out from Supabase if there's a session
    if (supabase) {
      await supabase.auth.signOut()
    }
    // Bypass dedupe: force-update ref + state together.
    userIdRef.current = null
    setUserState(null)
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
