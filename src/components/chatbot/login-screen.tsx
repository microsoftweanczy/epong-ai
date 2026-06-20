'use client'

import { useState } from 'react'
import { Logo } from './logo'
import { toast } from 'sonner'

interface Props {
  onSignIn: (email: string, password: string) => Promise<{ error: any }>
  onSignUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ data: any; error: any }>
}

export function LoginScreen({ onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

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
    <div className="mesh-bg safe-top safe-bottom flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Logo + greeting */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-5 shadow-xl shadow-indigo-500/30">
            <Logo size={80} />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Epong AI
          </h1>
          <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300">
            Asisten AI pribadi yang mengenal dan mengingat Anda.
          </p>
        </div>

        {/* Glass login card */}
        <div className="glass rounded-3xl p-6 shadow-xl">
          {/* Mode toggle */}
          <div className="mb-5 flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/60">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-xl px-3 py-2 text-[14px] font-semibold transition ${
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
              className={`flex-1 rounded-xl px-3 py-2 text-[14px] font-semibold transition ${
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
              className="tap-feedback flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#0A84FF] to-[#0064D6] px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#0A84FF]/30 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
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

          <p className="mt-4 text-center text-[12px] text-slate-400">
            {mode === 'login'
              ? 'Belum punya akun? Klik "Daftar" di atas.'
              : 'Sudah punya akun? Klik "Masuk" di atas.'}
          </p>
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-slate-400">
          Data Anda aman & terenkripsi di Supabase.
          <br />
          Obrolan & memori tersinkron antar perangkat.
        </p>
      </div>
    </div>
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
        className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-[15px] text-slate-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-[#0A84FF]/40 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
      />
    </div>
  )
}
