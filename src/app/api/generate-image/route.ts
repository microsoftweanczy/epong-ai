import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Image generation endpoint.
 * Uses z-ai-web-dev-sdk's images.generations.create() to generate an image
 * from a text prompt. Returns the image as a base64 data URL.
 *
 * Includes retry logic (up to 3 attempts) because the image API can be
 * slow or fail intermittently.
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
const MAX_RETRIES = 3
const ATTEMPT_TIMEOUT_MS = 40_000 // per-attempt timeout

let _zai: any = null
async function getZAI() {
  if (_zai) return _zai
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = ZAIModule.default
  _zai = await ZAI.create()
  return _zai
}

async function tryGenerate(prompt: string, size: string): Promise<string> {
  const zai = await getZAI()
  const response: any = await Promise.race([
    zai.images.generations.create({ prompt, size }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('generation timeout')), ATTEMPT_TIMEOUT_MS)
    ),
  ])
  const base64 = response?.data?.[0]?.base64
  if (!base64) throw new Error('respons kosong')
  return base64
}

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

  // Retry loop — image generation can fail or timeout intermittently
  let lastError: any = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const base64 = await tryGenerate(prompt, size)
      return Response.json({
        image: `data:image/png;base64,${base64}`,
        prompt,
        size,
        attempts: attempt,
      })
    } catch (e: any) {
      lastError = e
      console.error(`[generate-image] attempt ${attempt}/${MAX_RETRIES} failed:`, e?.message)
      // Brief pause before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt))
      }
    }
  }

  return Response.json(
    {
      error: `Gagal membuat gambar setelah ${MAX_RETRIES} percobaan. ${lastError?.message || ''}`.trim(),
    },
    { status: 502 }
  )
}
