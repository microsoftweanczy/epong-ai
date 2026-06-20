import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client. Reads env vars set in Vercel/`.env.local`.
 * If the vars are absent (e.g. local preview without a project), this is null
 * and the app transparently falls back to localStorage persistence.
 *
 * Required env vars (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Auth is enabled with session persistence so OAuth (Google/Apple) works
 * across page reloads and redirect callbacks.
 */
export const supabase: SupabaseClient | null = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // handles OAuth redirect callback
      },
    })
  } catch {
    return null
  }
})()

export const isSupabaseConfigured = () => supabase !== null
