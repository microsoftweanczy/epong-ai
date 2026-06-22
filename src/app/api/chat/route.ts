import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import type { Attachment } from '@/lib/types'
import { streamChat } from '@/lib/ai-providers'
import {
  gatherRealtimeContext,
  buildRealtimePrompt,
} from '@/lib/realtime'
import type { Preferences, MemoryNote } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ChatRequestBody {
  messages?: ApiMessage[]
  prefs?: Preferences | null
  memory?: MemoryNote[]
  behaviorProfile?: string
  attachments?: Attachment[]
}

/**
 * Streaming chat completion endpoint.
 *
 * Response: Server-Sent Events stream:
 *   data: {"content":"hello"}\n\n
 *   data: [DONE]\n\n
 */

interface ChatRequestBody {
  messages?: ApiMessage[]
  prefs?: Preferences | null
  memory?: MemoryNote[]
  behaviorProfile?: string
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const attachments = body.attachments || []

  // ── Process attachments: analyze images/videos/docs via VLM + extract text ──
  let attachmentContext = ''
  if (attachments.length > 0) {
    const parts: string[] = []
    for (const att of attachments) {
      // Images, videos, and binary docs (PDF/DOCX) → analyze via VLM
      if ((att.type === 'image' || att.type === 'video' || att.type === 'file') && att.dataUrl) {
        try {
          const visionRes = await fetch(`${req.nextUrl.origin}/api/vision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: att.dataUrl,
              mediaType: att.type,
              name: att.name,
              question:
                att.type === 'image'
                  ? 'Jelaskan gambar ini secara detail dalam Bahasa Indonesia.'
                  : att.type === 'video'
                  ? 'Jelaskan apa yang terjadi dalam video ini secara detail dalam Bahasa Indonesia.'
                  : 'Ringkas dan jelaskan isi dokumen ini secara detail dalam Bahasa Indonesia.',
            }),
          })
          if (visionRes.ok) {
            const vData = await visionRes.json()
            const label =
              att.type === 'image' ? 'Gambar' : att.type === 'video' ? 'Video' : 'Dokumen'
            parts.push(`[${label}: ${att.name}]\nDeskripsi: ${vData.description}`)
          } else {
            // VLM failed — if it's a text-based file with textContent, use that
            if (att.textContent) {
              parts.push(`[File: ${att.name}]\nKonten:\n${att.textContent.slice(0, 3000)}`)
            } else {
              parts.push(`[${att.name} — gagal dianalisis]`)
            }
          }
        } catch {
          parts.push(`[${att.name} — gagal dianalisis]`)
        }
      } else if (att.type === 'file' && att.textContent) {
        // Plain text files — inject content directly (no VLM needed)
        parts.push(`[File: ${att.name}]\nKonten:\n${att.textContent.slice(0, 3000)}`)
      }
    }
    if (parts.length > 0) {
      attachmentContext = `\n\n=== USER ATTACHMENTS ===\n${parts.join('\n\n')}\n=== END ATTACHMENTS ===\nReference these attachments when answering. The user uploaded them for context.`
    }
  }

  const systemInstruction = buildInstruction(
    body.prefs,
    body.memory,
    body.behaviorProfile
  )

  // ── Read user intention: decide if realtime web data is needed ──
  const realtimeCtx = await gatherRealtimeContext(incoming)
  const realtimePrompt = buildRealtimePrompt(realtimeCtx)

  const fullSystem = [systemInstruction, attachmentContext, realtimePrompt]
    .filter(Boolean)
    .join('')

  // Note: streamChat trims history internally (MAX_HISTORY=20) — no need to slice here.
  const messages: ApiMessage[] = [
    { role: 'system', content: fullSystem },
    ...incoming,
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      // Tell the frontend a search is happening (so it can show the 🔍 indicator)
      if (realtimeCtx.performed) {
        send({
          searchPerformed: true,
          sources: realtimeCtx.sourceCount,
          pagesRead: realtimeCtx.pagesRead,
          query: realtimeCtx.query,
        })
      }

      const ok = await streamChat(messages, (delta) =>
        send({ content: delta })
      )

      if (!ok) {
        send({ content: '*(Maaf, AI sedang bermasalah. Coba lagi ya.)*' })
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

const DEFAULT_PREFS: Preferences = {
  tone: 'santai',
  verbosity: 'seimbang',
  humor: 'sedikit',
  empathy: true,
  critical: true,
}

function buildInstruction(
  prefs?: Preferences | null,
  memory?: MemoryNote[],
  behaviorProfile?: string
): string {
  const p: Preferences = prefs ?? DEFAULT_PREFS
  const today = new Date().toISOString().split('T')[0]
  const parts: string[] = [
    'You are Epong AI, a helpful AI assistant built by Wensy Corp (Epong) — a handsome guy from Mbodong and Waemata, Labuan Bajo.',
    `Today's date is ${today}. Your training data has a cutoff, so for anything time-sensitive (news, prices, events, current people in roles), rely on the provided web search results.`,
    'Detect the language the user speaks and respond in that same language.',
    'Always use correct spelling, grammar, and punctuation — never mirror the user\'s typos.',
    'When you use web search results, cite sources naturally (e.g., "menurut [1]" or "berdasarkan sumber dari detik.com"). Be transparent that the info came from a web search.',
    'If the user asks about something current but you don\'t have search results, honestly say you don\'t have the latest info rather than guessing.',
    // ── Quality rules — prevent garbled/truncated output ──
    'OUTPUT QUALITY RULES (CRITICAL):',
    '- Write COMPLETE sentences. Never truncate words or cut off mid-sentence.',
    '- Each bullet point must be a full, readable sentence with proper subject + verb + object.',
    '- Do NOT drop letters, syllables, or words. If a sentence is long, finish it completely before moving on.',
    '- Use proper Indonesian spelling: "menjabat" (not "menjab"), "berdasarkan" (not "basarkan"), "awal" (not "aw"), "menjabat sebagai" (not "menat sebagai"), "Penasihat" (not "Penihat"), "miliar" (not "trun"), "memimpin" (not "impin"), "jauh" (not "jau"), "terutama" (not "terama"), "tentu" (not "J ya").',
    '- NO BOLD TEXT. Do NOT use **bold** markdown anywhere. Use regular text only. For headers, use a dash prefix like "- Header: sentence" instead of bold.',
    '- Format: use simple bullet points (dash prefix) with a complete sentence each. End with a brief summary sentence.',
    '- Before sending each chunk, mentally verify the sentence is complete and correctly spelled.',
  ]

  // ── Inject user memory (facts the AI should remember) ──
  if (memory && memory.length > 0) {
    const memoryText = memory
      .map(
        (m) =>
          `- [${m.category}] ${m.content}`
      )
      .join('\n')
    parts.push(
      `\n=== THINGS YOU REMEMBER ABOUT THE USER ===\n${memoryText}\nUse this context naturally. Don't recite it back unless relevant.`
    )
  }

  // ── Inject behavior profile ──
  if (behaviorProfile && behaviorProfile.trim()) {
    parts.push(
      `\n=== USER INTERACTION PROFILE ===\n${behaviorProfile.trim()}\nAdapt your style to match.`
    )
  }

  const toneMap: Record<string, string> = {
    santai: 'Style: casual and friendly. Use "kamu".',
    akrab: 'Style: very warm, like a best friend. Use "kamu".',
    profesional: 'Style: professional but approachable. Use "Anda".',
    formal: 'Style: formal and respectful. Use "Anda".',
  }
  if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone])

  const verbMap: Record<string, string> = {
    ringkas: 'Length: concise, max 2-3 sentences for simple questions.',
    seimbang: 'Length: balanced, use bullet points for complex topics.',
    rinci: 'Length: detailed, use headings and bullet points.',
  }
  if (p.verbosity && verbMap[p.verbosity]) parts.push(verbMap[p.verbosity])

  const humorMap: Record<string, string> = {
    nonaktif: 'Humor: disabled.',
    sedikit: 'Humor: occasional, never during serious topics.',
    sering: 'Humor: playful and witty when appropriate.',
  }
  if (p.humor && humorMap[p.humor]) parts.push(humorMap[p.humor])

  if (p.empathy) parts.push('Read the user\'s emotion and respond with empathy.')
  if (p.critical) parts.push('Be critically honest — challenge bad ideas respectfully.')

  parts.push('Be natural, warm, and genuinely helpful.')
  return parts.join('\n')
}
