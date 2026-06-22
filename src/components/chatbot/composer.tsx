'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { ArrowUp, Square, Shirt, MessageSquare, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react'
import type { Attachment } from '@/lib/types'

export type ChatMode = 'chat' | 'image'

interface Props {
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop: () => void
  busy: boolean
  mode: ChatMode
  onToggleMode: () => void
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const ACCEPTED_TEXT_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'application/json',
  'application/javascript', 'text/javascript', 'text/html', 'text/css',
  'text/x-python', 'application/x-python-code',
]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_TEXT_LENGTH = 50000

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export function Composer({ onSend, onStop, busy, mode, onToggleMode }: Props) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [value])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const newAttachments: Attachment[] = []

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" terlalu besar (maks 5MB)`)
        continue
      }

      const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/')
      const isText = ACCEPTED_TEXT_TYPES.includes(file.type) || file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|js|ts|py|html|css|xml|yml|yaml|sh)$/i)

      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file)
        newAttachments.push({
          id: uid(),
          type: 'image',
          name: file.name,
          mimeType: file.type,
          dataUrl,
        })
      } else if (isText) {
        const textContent = await readFileAsText(file)
        newAttachments.push({
          id: uid(),
          type: 'file',
          name: file.name,
          mimeType: file.type || 'text/plain',
          dataUrl: '',
          textContent: textContent.slice(0, MAX_TEXT_LENGTH),
        })
      } else {
        alert(`Tipe file "${file.name}" tidak didukung. Gunakan gambar atau file teks.`)
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }, [])

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const submit = () => {
    const text = value.trim()
    if (!text && attachments.length === 0) return
    if (busy) return
    onSend(text, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setAttachments([])
  }

  const isImageMode = mode === 'image'
  const placeholder = isImageMode
    ? 'Deskripsikan gambar yang ingin dibuat…'
    : attachments.length > 0
    ? 'Tulis pesan atau kirim kosong untuk analisis lampiran…'
    : 'Tulis pesan untuk Epong AI…'

  return (
    <div className="safe-bottom mx-2 mb-2 mt-1 sm:mx-3 sm:mb-3">
      <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-2 py-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
              >
                {att.type === 'image' ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-4 w-4 text-[#0A84FF]" />
                )}
                <span className="max-w-[120px] truncate text-[11px] text-slate-600 dark:text-slate-300">
                  {att.name}
                </span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 text-white transition hover:bg-red-500 dark:bg-slate-600"
                  aria-label="Hapus lampiran"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="glass flex min-h-[44px] flex-1 items-center rounded-[22px] px-3.5 py-2 shadow-lg sm:min-h-[48px] sm:rounded-[24px] sm:px-4">
            {/* File upload button (hidden in image-gen mode) */}
            {!isImageMode && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Lampirkan file atau gambar"
                title="Lampirkan gambar atau file teks"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-900/8 hover:text-[#0A84FF] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 sm:h-9 sm:w-9"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={`${ACCEPTED_IMAGE_TYPES.join(',')},${ACCEPTED_TEXT_TYPES.join(',')},.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yml,.yaml,.sh`}
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = '' // reset so same file can be re-selected
              }}
            />
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder={placeholder}
              enterKeyHint="send"
              className="font-chat max-h-36 min-h-[24px] flex-1 resize-none bg-transparent px-2 py-1 text-[15px] leading-[1.5] text-slate-900 outline-none placeholder:text-slate-500 sm:text-[16px] dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>
          {busy ? (
            <button
              onClick={onStop}
              aria-label="Hentikan"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition hover:bg-slate-700 active:scale-95 sm:h-12 sm:w-12 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim() && attachments.length === 0}
              aria-label={isImageMode ? 'Buat gambar' : 'Kirim pesan'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#0064D6] text-white shadow-lg shadow-[#0A84FF]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none sm:h-12 sm:w-12"
            >
              {isImageMode ? (
                <Shirt className="h-5 w-5" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </div>
      {/* Image mode toggle — small shirt icon below the input box */}
      <div className="mx-auto mt-1.5 flex w-full max-w-3xl items-center justify-center gap-2 lg:max-w-4xl">
        <button
          onClick={onToggleMode}
          aria-label={isImageMode ? 'Beralih ke mode chat' : 'Beralih ke mode gambar'}
          title={isImageMode ? 'Mode Gambar aktif — klik untuk kembali ke Chat' : 'Klik untuk membuat Gambar'}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
            isImageMode
              ? 'bg-[#0A84FF] text-white shadow-sm'
              : 'text-slate-400 hover:text-[#0A84FF] hover:bg-slate-900/5 dark:hover:bg-white/10'
          }`}
        >
          <Shirt className="h-3.5 w-3.5" />
          <span>{isImageMode ? 'Mode Gambar aktif' : 'Buat Gambar'}</span>
        </button>
      </div>
      {/* Mode hint banner */}
      {isImageMode && (
        <div className="mx-auto mt-1 flex w-full max-w-3xl items-center justify-center gap-1.5 rounded-full bg-[#0A84FF]/10 px-3 py-1 lg:max-w-4xl">
          <MessageSquare className="h-3 w-3 text-[#0A84FF]" />
          <span className="text-[11px] font-medium text-[#0A84FF]">
            Ketik deskripsi lalu kirim untuk membuat gambar
          </span>
        </div>
      )}
    </div>
  )
}
