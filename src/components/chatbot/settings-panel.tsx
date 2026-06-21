'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Brain,
  SlidersHorizontal,
  Heart,
  Zap,
} from 'lucide-react'
import { useTheme, type ThemeMode } from '@/lib/theme'
import {
  useSettings,
  type ToneStyle,
  type Verbosity,
  type HumorLevel,
  type MemoryNote,
} from '@/lib/settings'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Terang', icon: Sun },
  { mode: 'dark', label: 'Gelap', icon: Moon },
  { mode: 'system', label: 'Sistem', icon: Monitor },
]

const TONE_OPTIONS: { value: ToneStyle; label: string }[] = [
  { value: 'santai', label: 'Santai' },
  { value: 'akrab', label: 'Akrab' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'formal', label: 'Formal' },
]

const VERBOSITY_OPTIONS: { value: Verbosity; label: string }[] = [
  { value: 'ringkas', label: 'Ringkas' },
  { value: 'seimbang', label: 'Seimbang' },
  { value: 'rinci', label: 'Rinci' },
]

const HUMOR_OPTIONS: { value: HumorLevel; label: string }[] = [
  { value: 'nonaktif', label: 'Nonaktif' },
  { value: 'sedikit', label: 'Sedikit' },
  { value: 'sering', label: 'Sering' },
]

const CATEGORY_LABELS: Record<MemoryNote['category'], string> = {
  fakta: 'Fakta',
  preferensi: 'Preferensi',
  tujuan: 'Tujuan',
  konteks: 'Konteks',
}

export function SettingsPanel({ open, onClose }: Props) {
  const { mode, setMode } = useTheme()
  const {
    prefs,
    setPrefs,
    resetPrefs,
    memory,
    memoryLoaded,
    loadMemory,
    addMemory,
    updateMemory,
    deleteMemory,
    behaviorProfile,
    setBehaviorProfile,
  } = useSettings()

  const [newMemory, setNewMemory] = useState('')
  const [newCategory, setNewCategory] = useState<MemoryNote['category']>('fakta')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState('')

  useEffect(() => {
    if (open && !memoryLoaded) loadMemory()
  }, [open, memoryLoaded, loadMemory])

  if (!open) return null

  const handleAddMemory = async () => {
    const text = newMemory.trim()
    if (!text) return
    await addMemory(text, newCategory)
    setNewMemory('')
    toast.success('Memori ditambahkan')
  }

  const handleSaveEdit = async (id: string) => {
    if (editText.trim()) {
      await updateMemory(id, editText)
      toast.success('Memori diperbarui')
    }
    setEditingId(null)
  }

  const handleSaveProfile = () => {
    setBehaviorProfile(profileDraft)
    setEditingProfile(false)
    toast.success('Profil perilaku disimpan')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center dark:bg-slate-950">
      {/* Header */}
      <div className="safe-top safe-x glass-bar flex items-center gap-2 px-3 pb-3 pt-3 text-slate-800 dark:text-slate-100">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-900/5 dark:hover:bg-white/10"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-[17px] font-semibold tracking-tight">Pengaturan</h2>
      </div>

      <div className="thin-scrollbar safe-bottom flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
          {/* ── Theme ── */}
          <Section icon={Sun} title="Tema" subtitle="Tampilan terang, gelap, atau ikut sistem">
            <div className="grid grid-cols-3 gap-2.5">
              {THEME_OPTIONS.map((opt) => {
                const active = mode === opt.mode
                const Icon = opt.icon
                return (
                  <button
                    key={opt.mode}
                    onClick={() => setMode(opt.mode)}
                    className={`tap-feedback relative flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 transition ${
                      active
                        ? 'border-[#0A84FF] bg-[#0A84FF]/10 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                    }`}
                    aria-pressed={active}
                  >
                    {active && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A84FF] text-white shadow-sm">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <Icon className={`h-6 w-6 ${active ? 'text-[#0A84FF]' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className={`text-[13px] font-semibold ${active ? 'text-[#0A84FF]' : 'text-slate-700 dark:text-slate-200'}`}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* ── AI Preferences ── */}
          <Section icon={SlidersHorizontal} title="Preferensi AI" subtitle="Sesuaikan gaya respons Epong AI">
            <div className="space-y-4">
              <Field label="Gaya bahasa">
                <SegmentedOptions
                  value={prefs.tone}
                  options={TONE_OPTIONS}
                  onChange={(v) => setPrefs({ tone: v as ToneStyle })}
                />
              </Field>
              <Field label="Panjang respons">
                <SegmentedOptions
                  value={prefs.verbosity}
                  options={VERBOSITY_OPTIONS}
                  onChange={(v) => setPrefs({ verbosity: v as Verbosity })}
                />
              </Field>
              <Field label="Tingkat humor">
                <SegmentedOptions
                  value={prefs.humor}
                  options={HUMOR_OPTIONS}
                  onChange={(v) => setPrefs({ humor: v as HumorLevel })}
                />
              </Field>

              <ToggleRow
                icon={Heart}
                label="Empati emosional"
                desc="Sesuaikan respons dengan emosi pengguna"
                checked={prefs.empathy}
                onChange={(v) => setPrefs({ empathy: v })}
              />
              <ToggleRow
                icon={Zap}
                label="Pikiran kritis"
                desc="Tantang ide dengan jujur & konstruktif"
                checked={prefs.critical}
                onChange={(v) => setPrefs({ critical: v })}
              />

              <button
                onClick={() => {
                  resetPrefs()
                  toast.success('Preferensi direset ke default')
                }}
                className="text-[13px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Reset preferensi ke default
              </button>
            </div>
          </Section>

          {/* ── Memory ── */}
          <Section
            icon={Brain}
            title="Manajemen Memori"
            subtitle="Hal-hal yang Epong AI ingat tentang Anda. Tambahkan fakta, preferensi, atau konteks penting."
          >
            {/* Add memory */}
            <div className="mb-3 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/60">
              <textarea
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                placeholder="Contoh: Saya tinggal di Makassar, suka kopi, bekerja sebagai desainer…"
                rows={2}
                className="w-full resize-none bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryNote['category'])}
                  className="rounded-lg bg-white px-2 py-1 text-[12px] text-slate-600 outline-none dark:bg-slate-700 dark:text-slate-200"
                >
                  {(Object.keys(CATEGORY_LABELS) as MemoryNote['category'][]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddMemory}
                  disabled={!newMemory.trim()}
                  className="flex items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Tambah
                </button>
              </div>
            </div>

            {/* Memory list */}
            {memory.length === 0 && (
              <p className="py-4 text-center text-[13px] text-slate-400">
                Belum ada memori. Tambahkan agar Epong AI mengenal Anda lebih baik.
              </p>
            )}
            <div className="space-y-2">
              {memory.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/40"
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {CATEGORY_LABELS[m.category]}
                  </span>
                  {editingId === m.id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(m.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="min-w-0 flex-1 rounded-md bg-white px-2 py-0.5 text-[14px] outline-none ring-1 ring-indigo-300 dark:bg-slate-700 dark:text-slate-100"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 text-[14px] text-slate-700 dark:text-slate-200">
                      {m.content}
                    </span>
                  )}
                  {editingId === m.id ? (
                    <button
                      onClick={() => handleSaveEdit(m.id)}
                      className="shrink-0 rounded-full p-1 text-emerald-500 hover:bg-emerald-500/15"
                      aria-label="Simpan"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(m.id)
                          setEditText(m.content)
                        }}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-900/10 hover:text-slate-600 dark:hover:bg-white/10"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          await deleteMemory(m.id)
                          toast.success('Memori dihapus')
                        }}
                        className="rounded-full p-1 text-slate-400 hover:bg-red-500/15 hover:text-red-500"
                        aria-label="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* ── Behavior profile ── */}
          <Section
            icon={Brain}
            title="Profil Perilaku"
            subtitle="Gambaran bagaimana Anda biasanya berinteraksi. Epong AI akan menyesuaikan gayanya."
          >
            {editingProfile ? (
              <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/60">
                <textarea
                  value={profileDraft}
                  onChange={(e) => setProfileDraft(e.target.value)}
                  placeholder="Contoh: Pengguna cenderung bertanya singkat, suka jawaban praktis, sering membahas teknologi dan bisnis…"
                  rows={4}
                  className="w-full resize-none bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditingProfile(false)
                      setProfileDraft(behaviorProfile)
                    }}
                    className="rounded-full px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-900/5 dark:hover:bg-white/10"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="flex items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1.5 text-[13px] font-medium text-white"
                  >
                    <Check className="h-4 w-4" />
                    Simpan
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setProfileDraft(behaviorProfile)
                  setEditingProfile(true)
                }}
                className="block w-full rounded-2xl bg-slate-50 px-4 py-3 text-left dark:bg-slate-800/40"
              >
                {behaviorProfile ? (
                  <p className="whitespace-pre-wrap text-[14px] text-slate-700 dark:text-slate-200">
                    {behaviorProfile}
                  </p>
                ) : (
                  <p className="text-[14px] text-slate-400">
                    Belum ada profil perilaku. Ketuk untuk menambahkan gambaran tentang gaya interaksi Anda.
                  </p>
                )}
                <span className="mt-1 block text-[12px] font-medium text-[#0A84FF]">
                  {behaviorProfile ? 'Edit profil' : 'Tambah profil'}
                </span>
              </button>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── Helper components ──

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Sun
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="text-[12px] leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="pl-1">{children}</div>
    </section>
  )
}

function Field({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      {desc && (
        <p className="-mt-1 mb-1.5 text-[11px] text-slate-400">{desc}</p>
      )}
      {children}
    </div>
  )
}

function SegmentedOptions({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
            value === opt.value
              ? 'bg-white text-[#0A84FF] shadow-sm dark:bg-slate-700 dark:text-indigo-300'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: typeof Sun
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left dark:bg-slate-800/40"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-slate-700 dark:text-slate-200">{label}</div>
        <div className="text-[12px] text-slate-500">{desc}</div>
      </div>
      <div
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          checked ? 'bg-[#0A84FF]' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </div>
    </button>
  )
}
