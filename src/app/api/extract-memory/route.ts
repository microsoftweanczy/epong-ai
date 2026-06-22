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

const EXTRACT_PROMPT = `Kamu adalah asisten yang mengekstrak poin PENTING SAJA dari percakapan untuk disimpan sebagai memori jangka panjang.

TUGAS: Ekstrak HANYA informasi yang BENAR-BENAR PENTING dan berguna untuk percakapan mendatang:
- Identitas user (nama, lokasi, pekerjaan) — hanya jika disebutkan jelas
- Preferensi kuat (suka/tidak suka yang konsisten)
- Tujuan atau rencana konkret
- Konteks penting yang akan relevan lagi (sedang mengerjakan proyek apa, punya hewan peliharaan, dll)

JANGAN EKSTRAK:
- Basa-basi, sapaan, terima kasih
- Pertanyaan sementara
- Informasi umum yang tidak spesifik tentang user
- Hal-hal sepele yang tidak akan relevan lagi

ATURAN:
- Hanya ekstrak yang BENAR-BENAR penting. Lebih baik sedikit tapi berkualitas.
- Maks 15 kata per poin, padat dan jelas.
- Kalau tidak ada yang penting, kembalikan array kosong []
- Jangan duplikat dengan memori yang sudah ada.

FORMAT OUTPUT: HANYA JSON array, tanpa markdown.
Contoh: [{"content":"Tinggal di Makassar","category":"fakta"},{"content":"Suka kopi susu","category":"preferensi"}]

Kategori: fakta, preferensi, tujuan, konteks`

const MIN_MESSAGES = 4
const MIN_TOTAL_CHARS = 150
const MAX_MEMORIES_PER_EXTRACTION = 3
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

  const { text: result } = await completeChat(messages)
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
