import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Image generation endpoint.
 * Uses z-ai-web-dev-sdk's images.generations.create() to generate an image
 * from a text prompt. Returns the image as a base64 data URL.
 *
 * POST body: { prompt: string, size?: string }
 * Response: { image: "data:image/png;base64,..." } | { error: string }
 */

const SUPPORTED_SIZES = [
  '1024x1024',
  '768x1344',
  '864x1152',
  '1344x768',
  '1152x864',
  '1440x720',
  '720x1440',
]

const DEFAULT_SIZE = '1024x1024'

export async function POST(req: NextRequest) {
  let body: { prompt?: string; size?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return Response.json({ error: 'Prompt wajib diisi' }, { status: 400 })
  }

  const size = SUPPORTED_SIZES.includes(body.size || '')
    ? body.size!
    : DEFAULT_SIZE

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    // Race against a 45s timeout — image generation can be slow
    const response: any = await Promise.race([
      zai.images.generations.create({ prompt, size }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('generation timeout')), 45000)
      ),
    ])

    const base64 = response?.data?.[0]?.base64
    if (!base64) {
      return Response.json(
        { error: 'Gagal membuat gambar — respons kosong' },
        { status: 502 }
      )
    }

    return Response.json({
      image: `data:image/png;base64,${base64}`,
      prompt,
      size,
    })
  } catch (e: any) {
    console.error('[generate-image] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal membuat gambar' },
      { status: 500 }
    )
  }
}
