'use client'

import { EyeOff, Eye } from 'lucide-react'
import { useIncognito } from '@/lib/incognito'
import { toast } from 'sonner'

/**
 * Incognito mode toggle button.
 * When ON (active), chats are not saved to history.
 */
export function IncognitoToggle() {
  const { enabled, toggle } = useIncognito()

  const handleToggle = () => {
    toggle()
    if (!enabled) {
      toast.info('Mode penyamaran aktif — obrolan tidak akan disimpan', {
        duration: 4000,
      })
    } else {
      toast.success('Mode penyamaran dimatikan', { duration: 2500 })
    }
  }

  return (
    <button
      onClick={handleToggle}
      aria-label={enabled ? 'Matikan mode penyamaran' : 'Aktifkan mode penyamaran'}
      aria-pressed={enabled}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
        enabled
          ? 'bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400'
          : 'text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10'
      }`}
      title={enabled ? 'Mode penyamaran aktif — obrolan tidak disimpan' : 'Mode penyamaran'}
    >
      {enabled ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  )
}
