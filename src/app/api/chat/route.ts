import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import type { Preferences, MemoryNote } from '@/lib/settings'
import { buildMemoryPrompt } from '@/lib/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Streaming chat completion endpoint.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

// Keywords that suggest the user needs real-time data
const REALTIME_PATTERNS = [
  /terbaru|terkini|hari ini|sekarang|saat ini|kini|baru saja|kemarin/i,
  /latest|today|current|recent|right now|yesterday/i,
  /berita|news|update|pengumuman/i,
  /harga|price|cuaca|weather|saham|stock|bitcoin|crypto|kurs/i,
  /jadwal|schedule|result|hasil|skor|score|pertandingan/i,
  /trending|viral|populer/i,
  /\b202[4-9]\b/i,
  /apa yang sedang|what.*happening/i,
  /status terbaru|kondisi sekarang|perkembangan/i,
]

function needsWebSearch(text: string): boolean {
  return REALTIME_PATTERNS.some((p) => p.test(text))
}

async function quickWebSearch(query: string): Promise<string> {
  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num: 3 })
    if (!Array.isArray(results) || results.length === 0) return ''
    return results
      .map((r: any, i: number) => `${i + 1}. ${r.name}\n   ${r.snippet || ''}\n   Sumber: ${r.url}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  let body: {
    messages?: ApiMessage[]
    prefs?: Preferences | null
    memory?: MemoryNote[]
    behaviorProfile?: string
    relationshipDepth?: number
    emotionalProfile?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const lastUserMsg = [...incoming].reverse().find((m) => m.role === 'user')
  const userQuery = lastUserMsg?.content || ''

  // Build system instruction with memory engine
  const systemInstruction = buildInstruction(
    body.prefs,
    body.memory,
    body.behaviorProfile
  )

  // Inject hierarchical memory via memory engine
  const memoryPrompt = buildMemoryPrompt(
    body.memory || [],
    userQuery,
    body.relationshipDepth || 0,
    body.emotionalProfile || '',
    body.behaviorProfile || ''
  )

  // Check if web search needed
  let searchContext = ''
  let searchFailed = false

  if (lastUserMsg && needsWebSearch(lastUserMsg.content)) {
    searchContext = await Promise.race([
      quickWebSearch(lastUserMsg.content),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000)),
    ])
    if (!searchContext) searchFailed = true
  }

  // Combine: system instruction + memory + search context
  const parts = [systemInstruction, memoryPrompt]
  if (searchContext) {
    parts.push(`\n\nHASIL PENCARIAN WEB REALTIME:\n${searchContext}\nGunakan data ini. Sebut sumbernya. Tanggal: ${new Date().toISOString().split('T')[0]}`)
  } else if (searchFailed) {
    parts.push('\n\nCATATAN: Pencarian web gagal. Jangan gunakan data lama untuk hal terkini. Katakan: "Maaf, pencarian internet bermasalah, coba lagi."')
  }
  const fullSystem = parts.filter(Boolean).join('')

  const messages: ApiMessage[] = [
    { role: 'system', content: fullSystem },
    ...incoming.slice(-20),
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      if (searchContext) {
        send({ searchPerformed: true })
      }

      const result = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!result.success) {
        send({ content: `*(Maaf, AI sedang bermasalah. ${result.error})*` })
      } else {
        // Send the provider name so the UI can display which API was used
        send({ provider: result.provider })
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

  // Inject memory
  if (memory && memory.length > 0) {
    parts.push('Hal-hal yang kamu ingat tentang user:')
    for (const m of memory.slice(0, 15)) {
      parts.push(`- [${m.category}] ${m.content}`)
    }
    parts.push('Gunakan konteks ini secara natural. Jangan sebutkan "saya ingat" kecuali diminta.')
  } else {
    parts.push('(Belum ada memori tentang user. Pelajari dari percakapan.)')
  }

  // Inject behavior profile
  if (behaviorProfile && behaviorProfile.trim()) {
    parts.push('')
    parts.push('=== PROFIL PERILAKU USER ===')
    parts.push(behaviorProfile.trim())
    parts.push('Sesuaikan gaya komunikasi dengan profil ini.')
  }

  // Prefs
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
