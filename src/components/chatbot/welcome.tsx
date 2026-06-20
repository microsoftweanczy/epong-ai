'use client'

import { Logo } from './logo'

const SUGGESTIONS = [
  {
    title: 'Rencanakan hariku',
    subtitle: 'Bantu susun pagi yang produktif',
    prompt:
      'Bantu aku merencanakan hari yang produktif. Aku biasanya bangun jam 7 pagi — beri saran jadwal yang seimbang dengan blok fokus, istirahat, dan olahraga.',
  },
  {
    title: 'Jelaskan sebuah konsep',
    subtitle: 'Buat komputasi kuantum jadi sederhana',
    prompt:
      'Jelaskan komputasi kuantum kepadaku seperti aku seorang pemula yang penasaran. Gunakan analogi sederhana dan jaga agar di bawah 150 kata.',
  },
  {
    title: 'Tulis sesuatu',
    subtitle: 'Buat pesan ramah untuk seorang teman',
    prompt:
      'Bantu aku menulis pesan singkat yang hangat untuk menyapa teman yang sudah lama tidak aku hubungi.',
  },
  {
    title: 'Curahkan ide',
    subtitle: 'Ide proyek akhir pekan',
    prompt:
      'Beri aku 5 ide proyek akhir pekan yang seru dan bisa dicapai dengan keterampilan coding dasar. Jelaskan singkat masing-masing.',
  },
]

interface Props {
  onPick: (prompt: string) => void
  userName?: string | null
}

export function Welcome({ onPick, userName }: Props) {
  const name = userName?.trim()
  const greeting = name
    ? `Halo, ${name}! Apa kabar hari ini?`
    : 'Halo! Apa kabar?'

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mb-5 shadow-lg shadow-indigo-500/30">
        <Logo size={72} />
      </div>
      <h1 className="text-[26px] font-semibold tracking-tight text-slate-800 dark:text-slate-100">
        {greeting}
      </h1>
      <p className="mt-2 max-w-sm text-center text-[15px] text-slate-500 dark:text-slate-400">
        Ada yang bisa saya bantu hari ini? Tanyakan apa saja — saya bisa
        merencanakan, menulis, menjelaskan, memberi ide, dan lainnya.
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="tap-feedback glass flex flex-col items-start rounded-3xl px-5 py-4 text-left hover:brightness-105"
          >
            <span className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
              {s.title}
            </span>
            <span className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
              {s.subtitle}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
