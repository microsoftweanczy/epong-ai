import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Vision / multimodal understanding endpoint.
 * Uses z-ai-web-dev-sdk's chat.completions.createVision to analyze:
 *   - Images (image_url with base64 data URL)
 *   - Videos (video_url with base64 data URL)
 *   - Documents: PDF, DOCX, TXT (file_url with base64 data URL)
 *
 * POST body: {
 *   dataUrl: "data:image/...;base64,...",
 *   mediaType: "image" | "video" | "file",
 *   question: string
 * }
 * Response: { description: string } | { error: string }
 */

export async function POST(req: NextRequest) {
  let body: { dataUrl?: string; mediaType?: string; question?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const dataUrl = body.dataUrl?.trim()
  const mediaType = body.mediaType || 'image'
  const question = (body.question || 'Jelaskan konten ini secara detail dalam Bahasa Indonesia.').trim()
  const name = body.name || 'lampiran'

  if (!dataUrl) {
    return Response.json({ error: 'Data wajib diisi' }, { status: 400 })
  }

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    // Build the content part based on media type
    let contentPart: any
    if (mediaType === 'image') {
      contentPart = { type: 'image_url', image_url: { url: dataUrl } }
    } else if (mediaType === 'video') {
      contentPart = { type: 'video_url', video_url: { url: dataUrl } }
    } else {
      // file (PDF, DOCX, etc.)
      contentPart = { type: 'file_url', file_url: { url: dataUrl } }
    }

    const response: any = await Promise.race([
      zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              contentPart,
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('vision timeout')), 50_000)
      ),
    ])

    const description =
      response?.choices?.[0]?.message?.content || `Tidak dapat menganalisis ${name}.`

    return Response.json({ description, question, mediaType })
  } catch (e: any) {
    console.error('[vision] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal menganalisis konten' },
      { status: 500 }
    )
  }
}
