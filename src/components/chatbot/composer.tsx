'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import {
  ArrowUp, Square, Shirt, MessageSquare, Paperclip, X,
  FileText, Image as ImageIcon, Video, File, Mic, Loader2,
} from 'lucide-react'
import type { Attachment } from '@/lib/types'
import { toast } from 'sonner'

export type ChatMode = 'chat' | 'image'

interface Props {
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop: () => void
  busy: boolean
  mode: ChatMode
  onToggleMode: () => void
}

// ── File type classification ──
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'tif']
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/tiff', 'image/x-icon']
const VIDEO_EXTS = ['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv', 'm4v', '3gp', 'ogv']
const VIDEO_MIMES = ['video/mp4', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv', 'video/x-m4v', 'video/3gpp', 'video/ogg']
const TEXT_EXTS = ['txt', 'md', 'markdown', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'html', 'htm', 'css', 'scss', 'xml', 'yml', 'yaml', 'sh', 'bash', 'zsh', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'r', 'swift', 'kt', 'dart', 'lua', 'pl', 'scala', 'vue', 'svelte', 'toml', 'ini', 'cfg', 'conf', 'log']
const TEXT_MIMES = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/javascript', 'text/javascript', 'application/x-javascript', 'text/html', 'text/css', 'text/xml', 'application/xml', 'application/x-yaml', 'text/yaml', 'application/x-sh', 'application/x-python-code', 'text/x-python']
const DOC_EXTS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'rtf', 'epub']
const DOC_MIMES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'application/epub+zip']

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (generous for videos/docs)
const MAX_TEXT_LENGTH = 50000
const ACCEPT_ATTR = [
  ...IMAGE_EXTS.map((e) => `.${e}`),
  ...VIDEO_EXTS.map((e) => `.${e}`),
  ...TEXT_EXTS.map((e) => `.${e}`),
  ...DOC_EXTS.map((e) => `.${e}`),
].join(',')

function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function classifyFile(file: File): 'image' | 'video' | 'text' | 'doc' | 'unknown' {
  const ext = getExt(file.name)
  if (IMAGE_MIMES.includes(file.type) || IMAGE_EXTS.includes(ext)) return 'image'
  if (VIDEO_MIMES.includes(file.type) || VIDEO_EXTS.includes(ext)) return 'video'
  if (TEXT_MIMES.includes(file.type) || TEXT_EXTS.includes(ext)) return 'text'
  if (DOC_MIMES.includes(file.type) || DOC_EXTS.includes(ext)) return 'doc'
  return 'unknown'
}

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
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [value])

  // ── Voice input (ASR) ──
  // Records audio as WAV (not WebM) because the ASR API may not support WebM.
  // We use the AudioContext API to capture raw PCM samples, then encode to WAV.
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
      })
      mediaStreamRef.current = stream

      // Use AudioContext to get raw PCM data
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx({ sampleRate: 16000 })
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      chunksRef.current = []

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        // Clone the data (it gets reused)
        chunksRef.current.push(new Float32Array(input))
      }

      source.connect(processor)
      processor.connect(ctx.destination)

      setRecording(true)
    } catch (e: any) {
      toast.error('Tidak bisa akses mikrofon: ' + e.message)
    }
  }, [])

  // Convert Float32 PCM samples to a WAV Blob (16-bit PCM, mono, 16kHz)
  const encodeWav = (chunks: Float32Array[], sampleRate: number): Blob => {
    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const buffer = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    // Convert to 16-bit PCM
    const wavBuffer = new ArrayBuffer(44 + buffer.length * 2)
    const view = new DataView(wavBuffer)

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + buffer.length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, sampleRate, true) // sample rate
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample
    writeString(36, 'data')
    view.setUint32(40, buffer.length * 2, true)

    // Write PCM samples
    let pos = 44
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]))
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      pos += 2
    }

    return new Blob([wavBuffer], { type: 'audio/wav' })
  }

  const stopRecording = useCallback(() => {
    if (!recording) return

    // Stop the processor and close audio context
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }

    // Encode to WAV and send to ASR
    const chunks = chunksRef.current
    if (chunks.length === 0) {
      setRecording(false)
      return
    }

    const wavBlob = encodeWav(chunks, 16000)
    setRecording(false)
    setTranscribing(true)

    // Convert WAV blob to base64 data URL
    const reader = new FileReader()
    reader.onloadend = async () => {
      const dataUrl = reader.result as string
      try {
        const res = await fetch('/api/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: dataUrl }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'ASR failed')
        }
        const data = await res.json()
        if (data.text) {
          setValue((prev) => (prev ? prev + ' ' : '') + data.text)
          toast.success('Transkripsi suara berhasil')
        } else {
          toast.error('Tidak ada teks terdeteksi')
        }
      } catch (e: any) {
        toast.error('Gagal transkripsi: ' + e.message)
      } finally {
        setTranscribing(false)
      }
    }
    reader.readAsDataURL(wavBlob)
  }, [recording])

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording()
    else startRecording()
  }, [recording, startRecording, stopRecording])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const newAttachments: Attachment[] = []

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" terlalu besar (maks 10MB)`)
        continue
      }

      const kind = classifyFile(file)

      if (kind === 'image') {
        const dataUrl = await readFileAsDataUrl(file)
        newAttachments.push({
          id: uid(), type: 'image', name: file.name, mimeType: file.type || 'image/png', dataUrl,
        })
      } else if (kind === 'video') {
        const dataUrl = await readFileAsDataUrl(file)
        newAttachments.push({
          id: uid(), type: 'video', name: file.name, mimeType: file.type || 'video/mp4', dataUrl,
        })
      } else if (kind === 'text') {
        const textContent = await readFileAsText(file)
        newAttachments.push({
          id: uid(), type: 'file', name: file.name, mimeType: file.type || 'text/plain',
          dataUrl: '', textContent: textContent.slice(0, MAX_TEXT_LENGTH),
        })
      } else if (kind === 'doc') {
        // PDF/DOCX/PPTX/XLSX → send as binary to VLM via file_url
        const dataUrl = await readFileAsDataUrl(file)
        newAttachments.push({
          id: uid(), type: 'file', name: file.name, mimeType: file.type || 'application/octet-stream', dataUrl,
        })
      } else {
        alert(`Tipe file "${file.name}" tidak didukung. Didukung: gambar, video, PDF, dokumen, file teks/kode.`)
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
    : 'Tulis pesan untuk ManggarAI…'

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
                ) : att.type === 'video' ? (
                  <Video className="h-5 w-5 text-purple-500" />
                ) : att.dataUrl ? (
                  <File className="h-5 w-5 text-red-500" />
                ) : (
                  <FileText className="h-5 w-5 text-[#0A84FF]" />
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
                aria-label="Lampirkan file, gambar, atau video"
                title="Lampirkan gambar, video, PDF, dokumen, atau file teks/kode"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-900/8 hover:text-[#0A84FF] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 sm:h-9 sm:w-9"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
            )}
            {/* Voice input button (hidden in image-gen mode) */}
            {!isImageMode && (
              <button
                onClick={toggleRecording}
                disabled={busy || transcribing}
                aria-label={recording ? 'Berhenti merekam' : 'Rekam suara'}
                title={recording ? 'Klik untuk berhenti merekam' : 'Rekam pesan suara'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 sm:h-9 sm:w-9 ${
                  recording
                    ? 'animate-pulse bg-red-500 text-white'
                    : transcribing
                    ? 'text-[#0A84FF]'
                    : 'text-slate-500 hover:bg-slate-900/8 hover:text-[#0A84FF] dark:text-slate-400 dark:hover:bg-white/10'
                }`}
              >
                {transcribing ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Mic className="h-[18px] w-[18px]" />
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
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
      {/* Image mode toggle — positioned at bottom-left below the input box */}
      <div className="relative z-10 mx-auto mt-1.5 flex w-full max-w-3xl items-center justify-start gap-2 pl-1 lg:max-w-4xl">
        <button
          onClick={onToggleMode}
          type="button"
          aria-label={isImageMode ? 'Beralih ke mode chat' : 'Beralih ke mode gambar'}
          title={isImageMode ? 'Mode Gambar aktif — klik untuk kembali ke Chat' : 'Klik untuk membuat Gambar'}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition active:scale-95 ${
            isImageMode
              ? 'bg-[#0A84FF] text-white shadow-sm'
              : 'text-slate-500 hover:text-[#0A84FF] hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10'
          }`}
        >
          <Shirt className="h-4 w-4" />
          <span>{isImageMode ? 'Mode Gambar' : 'Buat Gambar'}</span>
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
