import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Vision (image understanding) endpoint.
 * Uses z-ai-web-dev-sdk's chat.completions.createVision to analyze images.
 *
 * POST body: { image: "data:image/...;base64,...", question: string }
 * Response: { description: string } | { error: string }
 */

export async function POST(req: NextRequest) {
  let body: { image?: string; question?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const image = body.image?.trim()
  const question = (body.question || 'Jelaskan gambar ini secara detail.').trim()

  if (!image) {
    return Response.json({ error: 'Gambar wajib diisi' }, { status: 400 })
  }

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const response: any = await Promise.race([
      zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('vision timeout')), 25_000)
      ),
    ])

    const description =
      response?.choices?.[0]?.message?.content || 'Tidak dapat menganalisis gambar.'

    return Response.json({ description, question })
  } catch (e: any) {
    console.error('[vision] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal menganalisis gambar' },
      { status: 500 }
    )
  }
}
