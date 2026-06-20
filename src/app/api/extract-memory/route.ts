import { NextRequest } from 'next/server'
import type { ApiMessage, MemoryNote } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Extract key facts/memories from a conversation using AI.
 * Returns an array of {content, category} suggestions.
 *
 * Strategy: try OpenRouter -> GLM -> z-ai SDK (same as chat).
 * Output: JSON array of memory notes.
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
  // Only look at the last ~10 messages for extraction
  const recent = incoming.slice(-10)
  const existing = body.existingMemory || []

  // Skip extraction for trivial conversations
  if (recent.length < 2) {
    return Response.json({ memories: [] })
  }
  const totalChars = recent.reduce((s, m) => s + (m.content?.length || 0), 0)
  if (totalChars < 80) {
    return Response.json({ memories: [] })
  }

  const messages: ApiMessage[] = [
    { role: 'system', content: EXTRACT_PROMPT },
    {
      role: 'user',
      content: `MEMORI YANG SUDAH ADA (jangan duplikat):\n${existing.length > 0 ? existing.map((m) => `- ${m.content}`).join('\n') : '(belum ada)'}\n\nPERCAKAPAN:\n${recent.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nEkstrak poin penting baru (JSON array saja):`,
    },
  ]

  try {
    let result = ''
    let success = false

    // Try OpenRouter first (primary)
    if (process.env.OPENROUTER_API_KEY) {
      try {
        result = await completeFromOpenRouter(messages)
        success = true
      } catch (e: any) {
        console.error('[extract] OpenRouter failed:', e?.message)
      }
    }
    // Fallback to GLM
    if (!success && process.env.GLM_API_KEY) {
      try {
        result = await completeFromGLM(messages)
        success = true
      } catch (e: any) {
        console.error('[extract] GLM failed:', e?.message)
      }
    }
    // Fallback to z-ai SDK
    if (!success) {
      try {
        result = await completeFromZAI(messages)
        success = true
      } catch (e: any) {
        console.error('[extract] z-ai failed:', e?.message)
      }
    }

    if (!success) {
      return Response.json({ memories: [] })
    }

    // Parse the JSON array from result
    const memories = parseMemories(result)
    return Response.json({ memories })
  } catch (e: any) {
    console.error('[extract] error:', e?.message)
    return Response.json({ memories: [] })
  }
}

function parseMemories(text: string): Array<{ content: string; category: string }> {
  try {
    // Find JSON array in the text (in case model wraps it)
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
          ['fakta', 'preferensi', 'tujuan', 'konteks'].includes(m.category)
      )
      .map((m: any) => ({
        content: String(m.content).trim().slice(0, 150),
        category: m.category,
      }))
      .slice(0, 5) // max 5 per extraction
  } catch {
    return []
  }
}

// ── Non-streaming completions (simpler for extraction) ──

async function completeFromOpenRouter(messages: ApiMessage[]): Promise<string> {
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free'
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://epong-ai.vercel.app',
      'X-Title': 'Epong AI',
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 100)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

async function completeFromGLM(messages: ApiMessage[]): Promise<string> {
  const base = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
  const model = process.env.GLM_MODEL || 'glm-4.5-flash'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GLM_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 800 }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`GLM ${res.status}: ${t.slice(0, 100)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

async function completeFromZAI(messages: ApiMessage[]): Promise<string> {
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  const zai = await ZAI.create()
  const completion: any = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  } as any)
  return completion?.choices?.[0]?.message?.content || ''
}
