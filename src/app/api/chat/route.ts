import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences, MemoryNote } from '@/lib/settings'
import { buildMemoryPrompt } from '@/lib/memory-engine'
import { gatherRealtimeContext, buildRealtimePrompt } from '@/lib/realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Uses:
 * - Smart routing (ai-providers.ts) for model selection
 * - Realtime engine (realtime.ts) for web search when needed
 * - Memory engine (memory-engine.ts) for personalized context
 *
 * Response: Server-Sent Events stream
 */

interface ChatRequestBody {
  messages?: ApiMessage[]
  prefs?: Preferences | null
  memory?: MemoryNote[]
  behaviorProfile?: string
  relationshipDepth?: number
  emotionalProfile?: string
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  const userQuery = lastUserMsg?.content || ''

  // ── 1. Build system instruction with memory engine ──
  const systemInstruction = buildInstruction(
    body.prefs,
    body.memory,
    body.behaviorProfile
  )

  // ── 2. Inject hierarchical memory via memory engine ──
  const memoryPrompt = buildMemoryPrompt(
    body.memory || [],
    userQuery,
    body.relationshipDepth || 0,
    body.emotionalProfile || '',
    body.behaviorProfile || ''
  )

  // ── 3. Realtime web search (if needed) via realtime engine ──
  // gatherRealtimeContext uses LLM-based intent detection (primary)
  // + regex fallback. It performs web_search + page_reader for deep context.
  const realtimeCtx = await gatherRealtimeContext(incoming)
  const realtimePrompt = buildRealtimePrompt(realtimeCtx)

  // ── 4. Combine all context ──
  const fullSystem = [systemInstruction, memoryPrompt, realtimePrompt]
    .filter(Boolean)
    .join('')

  const messages: ApiMessage[] = [
    { role: 'system', content: fullSystem },
    ...incoming.slice(-20),
  ]

  // ── 5. Stream response ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      // Notify frontend that a search is happening
      if (realtimeCtx.performed) {
        send({
          searchPerformed: true,
          sources: realtimeCtx.sourceCount,
          pagesRead: realtimeCtx.pagesRead,
          query: realtimeCtx.query,
        })
      }

      const result = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!result.success) {
        send({ content: `*(Maaf, AI sedang bermasalah. ${result.error})*` })
      } else {
        send({ provider: result.provider, modelCode: result.modelCode })
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function buildInstruction(
  prefs?: Preferences | null,
  memory?: MemoryNote[],
  behaviorProfile?: string
): string {
  const p: Preferences = prefs ?? {
    tone: 'santai', verbosity: 'seimbang', humor: 'sedikit',
    empathy: true, critical: true, safeMode: false,
  }
  const today = new Date().toISOString().split('T')[0]

  const parts: string[] = [
    'Kamu adalah ManggarAI, asisten AI pribadi yang dibuat oleh Wensy Corp (Manggar) — orang ganteng dari Mbodong dan Waemata, Labuan Bajo.',
    `Tanggal hari ini: ${today}.`,
    '',
    '=== ATURAN BAHASA INDONESIA (WAJIB DIIKUTI) ===',
    'Kamu WAJIB berbicara dalam Bahasa Indonesia yang natural, seperti orang Indonesia asli.',
    'Pahami dan gunakan slang/ungkapan Indonesia: "gimana", "kayaknya", "sih", "dong", "nih", "kok", "btw", "tbh", "yg", "dgn", "utk".',
    'Pahami konteks lokal Indonesia: budaya, makanan, tempat, kebiasaan, hukum, dll.',
    'Gunakan kata ganti yang sesuai: "kamu" untuk santai, "Anda" untuk formal.',
    'JANGAN pernah pakai Bahasa Inggris kecuali diminta atau ada istilah teknis.',
    'JANGAN terjemahkan kaku dari Inggris. Gunakan ekspresi yang natural dalam Bahasa Indonesia.',
    'Contoh buruk: "Bagaimana saya bisa membantu Anda hari ini?" → Contoh baik: "Ada yang bisa aku bantu? 😊"',
    '',
    '=== KEPRIBADIAN & HUMOR ===',
    'Jadilah asisten yang hangat, akrab, dan punya selera humor tinggi.',
    'Gunakan humor secara natural — lelucon ringan, perumpamaan, atau sarkasme yang sopan sesuai konteks.',
    'Jika user bercanda, balas dengan bercanda. Jika user serius, jadi serius.',
    'Baca emosi user dari cara mereka menulis dan sesuaikan respons.',
    'Jangan kaku seperti robot. Jadilah seperti teman ngobrol yang pintar.',
    'Gunakan emoji secukupnya (1-2 per pesan) untuk menambah ekspresi.',
    '',
    '=== KUALITAS OUTPUT ===',
    'Tulis kalimat LENGKAP. Jangan potong kata atau kalimat.',
    'Ejaan harus benar: "menjabat" bukan "menjab", "berdasarkan" bukan "basarkan".',
    'TIDAK BOLEH pakai **bold** markdown. Gunakan teks biasa saja.',
    'Format: poin-poin dengan dash (-) untuk topik kompleks, paragraf untuk chat santai.',
    'Jika tidak tahu jawabannya, jujur saja. Jangan mengarang (no hallucination).',
    '',
    '=== KONTEKS PENGGUNA ===',
  ]

  if (memory && memory.length > 0) {
    parts.push('Hal-hal yang kamu ingat tentang user:')
    for (const m of memory.slice(0, 15)) {
      parts.push(`- [${m.category}] ${m.content}`)
    }
    parts.push('Gunakan konteks ini secara natural. Jangan sebutkan "saya ingat" kecuali diminta.')
  } else {
    parts.push('(Belum ada memori tentang user. Pelajari dari percakapan.)')
  }

  if (behaviorProfile && behaviorProfile.trim()) {
    parts.push('')
    parts.push('=== PROFIL PERILAKU USER ===')
    parts.push(behaviorProfile.trim())
    parts.push('Sesuaikan gaya komunikasi dengan profil ini.')
  }

  parts.push('')
  const toneMap: Record<string, string> = {
    santai: 'Gaya: santai banget, kayak temen. Pakai "kamu" atau "aku".',
    akrab: 'Gaya: super akrab, kayak sahabat. Pakai "kamu" atau "aku".',
    profesional: 'Gaya: profesional tapi tetap bersahabat. Pakai "Anda".',
    formal: 'Gaya: formal dan hormat. Pakai "Anda".',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  const verbMap: Record<string, string> = {
    ringkas: 'Panjang: singkat, maksimal 2-3 kalimat untuk pertanyaan sederhana.',
    seimbang: 'Panjang: seimbang, pakai poin-poin untuk topik kompleks.',
    rinci: 'Panjang: detail, pakai heading dan poin-poin.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: nonaktif.',
    sedikit: 'Humor: sesekali, jangan pas topik serius.',
    sering: 'Humor: sering, playful dan witty sesuai konteks.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  if (p.empathy) parts.push('Baca emosi user dan respons dengan empati.')
  if (p.critical) parts.push('Jujur dan kritis — tantang ide buruk dengan sopan.')

  parts.push('Jadilah natural, hangat, dan benar-benar membantu.')

  return parts.join('\n')
}
