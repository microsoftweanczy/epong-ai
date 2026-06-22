'use client'

import { useState } from 'react'
import { Logo } from './logo'
import { toast } from 'sonner'
import { isSupabaseConfigured } from '@/lib/supabase'

interface Props {
  onSignIn: (email: string, password: string) => Promise<{ error: any }>
  onSignUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ data: any; error: any }>
  onGuest: (name?: string) => void
}

export function LoginScreen({ onSignIn, onSignUp, onGuest }: Props) {
  const emailAuthAvailable = isSupabaseConfigured()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [showGuestInput, setShowGuestInput] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [fadingOut, setFadingOut] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return

    if (!email.trim() || !password.trim()) {
      toast.error('Email dan password wajib diisi')
      return
    }
    if (mode === 'signup' && !name.trim()) {
      toast.error('Nama wajib diisi')
      return
    }
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter')
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await onSignIn(email.trim(), password)
        if (error) {
          toast.error(
            error.message === 'Invalid login credentials'
              ? 'Email atau password salah'
              : error.message || 'Gagal masuk'
          )
        } else {
          toast.success('Berhasil masuk!')
        }
      } else {
        const { data, error } = await onSignUp(
          email.trim(),
          password,
          name.trim()
        )
        if (error) {
          toast.error(
            error.message === 'User already registered'
              ? 'Email sudah terdaftar. Silakan masuk.'
              : error.message || 'Gagal daftar'
          )
          if (error.message === 'User already registered') {
            setMode('login')
          }
        } else if (data?.user && !data?.session) {
          // email confirmation required
          toast.success(
            'Akun dibuat! Cek email Anda untuk verifikasi, lalu masuk.',
            { duration: 8000 }
          )
          setMode('login')
        } else if (data?.session) {
          toast.success('Berhasil daftar & masuk!')
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Terjadi kesalahan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`mesh-bg safe-top safe-bottom flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 transition-opacity duration-300 sm:px-6 sm:py-10 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`
    }
    >
      <div className="w-full max-w-sm sm:max-w-md">
        {/* Logo + greeting */}
        <div className="mb-6 flex flex-col items-center text-center sm:mb-7">
          <div className="mb-4 shadow-xl shadow-[#0A84FF]/30 sm:mb-5">
            <Logo size={68} />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-800 sm:text-[28px] dark:text-slate-100">
            Epong AI
          </h1>
          <p className="mt-2 px-2 text-center text-[14px] text-slate-600 sm:text-[15px] dark:text-slate-300">
            Asisten AI pribadi yang mengenal dan mengingat Anda.
          </p>
        </div>

        {/* Glass login card */}
        <div className="glass rounded-3xl p-5 shadow-xl sm:p-6">
          {emailAuthAvailable ? (
            <>
              {/* Mode toggle */}
              <div className="mb-4 flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/60 sm:mb-5">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition sm:text-[14px] ${
                    mode === 'login'
                      ? 'bg-white text-[#0A84FF] shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition sm:text-[14px] ${
                    mode === 'signup'
                      ? 'bg-white text-[#0A84FF] shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Daftar
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <Field
                    label="Nama"
                    type="text"
                    value={name}
                    onChange={setName}
                    placeholder="Nama Anda"
                    autoComplete="name"
                    disabled={busy}
                  />
                )}
                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="kamu@email.com"
                  autoComplete="email"
                  disabled={busy}
                />
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Minimal 6 karakter"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  disabled={busy}
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="tap-feedback flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#0A84FF] to-[#0064D6] px-4 py-3 text-[14px] font-semibold text-white shadow-lg shadow-[#0A84FF]/30 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 sm:py-3.5 sm:text-[15px]"
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {mode === 'login' ? 'Memproses…' : 'Membuat akun…'}
                    </>
                  ) : mode === 'login' ? (
                    'Masuk'
                  ) : (
                    'Daftar'
                  )}
                </button>
              </form>

              <p className="mt-3 text-center text-[11px] text-slate-400 sm:mt-4 sm:text-[12px]">
                {mode === 'login'
                  ? 'Belum punya akun? Klik "Daftar" di atas.'
                  : 'Sudah punya akun? Klik "Masuk" di atas.'}
              </p>

              {/* Divider */}
              <div className="my-3 flex items-center gap-3 sm:my-4">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-[11px] font-medium text-slate-400">atau</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
            </>
          ) : (
            <>
              {/* No Supabase configured — guest-only mode */}
              <div className="mb-4 rounded-2xl bg-[#0A84FF]/8 px-4 py-3 text-center dark:bg-indigo-500/15">
                <p className="text-[13px] font-medium leading-relaxed text-[#0A84FF] dark:text-indigo-300">
                  Mode tamu aktif
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Obrolan disimpan di perangkat ini saja. Masuk dengan email untuk sinkron cloud.
                </p>
              </div>
            </>
          )}

          {/* Guest mode */}
          {showGuestInput ? (
            <div className="space-y-2">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setFadingOut(true)
                    setTimeout(() => onGuest(guestName), 300)
                  }
                }}
                placeholder="Nama Anda (opsional)"
                className="h-11 w-full rounded-2xl bg-slate-100 px-4 text-[14px] text-slate-800 outline-none sm:text-[15px] dark:bg-slate-800/60 dark:text-slate-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowGuestInput(false)}
                  className="flex-1 rounded-2xl bg-slate-100 px-4 py-2.5 text-[13px] font-medium text-slate-600 sm:text-[14px] dark:bg-slate-800/60 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFadingOut(true)
                    setTimeout(() => onGuest(guestName), 300)
                  }}
                  className="flex-1 rounded-2xl bg-slate-800 px-4 py-2.5 text-[13px] font-semibold text-white sm:text-[14px] dark:bg-slate-700"
                >
                  Mulai
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuestInput(true)}
              className="tap-feedback flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/50 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-white sm:py-3 sm:text-[14px] dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-300"
            >
              <UserIcon />
              Masuk sebagai Tamu
            </button>
          )}
        </div>

        <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-slate-400 sm:mt-5 sm:text-[12px]">
          {showGuestInput
            ? 'Mode tamu: data disimpan di perangkat ini saja, tidak tersinkron cloud.'
            : emailAuthAvailable
            ? 'Login email untuk sinkron cloud. Atau masuk sebagai tamu tanpa email.'
            : 'Masuk sebagai tamu untuk mulai mengobrol dengan Epong AI.'}
        </p>
      </div>
    </div>
  )
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="h-11 w-full rounded-2xl bg-slate-100 px-4 text-[14px] text-slate-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-[#0A84FF]/40 sm:h-12 sm:text-[15px] dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
      />
    </div>
  )
}
