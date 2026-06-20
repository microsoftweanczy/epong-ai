import { NextRequest } from 'next/server'
import type { ApiMessage, MemoryNote } from '@/lib/types'
import { completeChat } from '@/lib/ai-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Extract key facts/memories from a conversation using AI.
 * Uses `completeChat()` from `@/lib/ai-providers` (smart fallback chain).
 * Returns JSON: { memories: [{content, category}, ...] }
 */

const EXTRACT_PROMPT = `Kamu adalah asisten yang mengekstrak poin penting dari percakapan untuk disimpan sebagai memori jangka panjang.

TUGAS: Dari percakapan berikut, ekstrak HANYA informasi yang:
- Fakta personal tentang user (nama, lokasi, pekerjaan, keluarga, hobi)
- Preferensi user (suka/tidak suka, gaya komunikasi)
- Tujuan atau rencana user
- Konteks penting (sedang mengerjakan apa, masalah apa)

ATURAN:
- Jangan ekstrak kalimat basa-basi (sapaan, terima kasih)
- Jangan ekstrak pertanyaan yang belum dijawab
- Hanya ekstrak kalimat pendek dan padat (maks 15 kata per poin)
- Jangan duplikat poin yang mirip
- Kalau tidak ada poin penting, kembalikan array kosong []

FORMAT OUTPUT: HANYA JSON array, tanpa markdown, tanpa penjelasan.
Contoh: [{"content":"Tinggal di Makassar","category":"fakta"},{"content":"Suka kopi susu","category":"preferensi"}]

Kategori yang tersedia: fakta, preferensi, tujuan, konteks`

const MIN_MESSAGES = 2
const MIN_TOTAL_CHARS = 80
const MAX_MEMORIES_PER_EXTRACTION = 5
const MAX_MEMORY_LENGTH = 150
const VALID_CATEGORIES = ['fakta', 'preferensi', 'tujuan', 'konteks']

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    existingMemory?: MemoryNote[]
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const recent = incoming.slice(-10)
  const existing = body.existingMemory || []

  // Skip trivial conversations
  if (recent.length < MIN_MESSAGES) {
    return Response.json({ memories: [] })
  }
  const totalChars = recent.reduce((s, m) => s + (m.content?.length || 0), 0)
  if (totalChars < MIN_TOTAL_CHARS) {
    return Response.json({ memories: [] })
  }

  const messages: ApiMessage[] = [
    { role: 'system', content: EXTRACT_PROMPT },
    {
      role: 'user',
      content: `MEMORI YANG SUDAH ADA (jangan duplikat):\n${existing.length > 0 ? existing.map((m) => `- ${m.content}`).join('\n') : '(belum ada)'}\n\nPERCAKAPAN:\n${recent.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nEkstrak poin penting baru (JSON array saja):`,
    },
  ]

  const result = await completeChat(messages, 'auto')
  const memories = parseMemories(result)
  return Response.json({ memories })
}

function parseMemories(
  text: string
): Array<{ content: string; category: string }> {
  try {
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) return []
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (m: any) =>
          m &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0 &&
          VALID_CATEGORIES.includes(m.category)
      )
      .map((m: any) => ({
        content: String(m.content).trim().slice(0, MAX_MEMORY_LENGTH),
        category: m.category,
      }))
      .slice(0, MAX_MEMORIES_PER_EXTRACTION)
  } catch {
    return []
  }
}
