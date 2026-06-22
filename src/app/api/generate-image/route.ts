import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Image generation endpoint.
 *
 * Primary: Hugging Face FLUX.1-schnell (fast, high quality, free)
 * Fallback: Qwen z-image-turbo via DashScope (reliable)
 *
 * POST body: { prompt: string }
 * Response: { image: "data:image/png;base64,..." } | { error: string }
 */

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell'
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1'
const DASHSCOPE_MODEL = 'z-image-turbo'
const MAX_RETRIES = 2

function getDashscopeKey(): string {
  return process.env.GLM_API_KEY || process.env.QWEN_IMAGE_API_KEY || ''
}

function getHFToken(): string {
  return process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || ''
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

/** Primary: Hugging Face FLUX.1-schnell */
async function generateWithHF(prompt: string): Promise<Buffer> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  // HF token is optional — works without it (just rate-limited)
  const token = getHFToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await withTimeout(
    fetch(HF_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 4, // FLUX.1-schnell is optimized for 4 steps
          width: 1024,
          height: 1024,
        },
      }),
    }),
    30_000
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HF ${res.status}: ${text.slice(0, 200)}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('image')) {
    // HF sometimes returns JSON error even with 200
    const text = await res.text().catch(() => '')
    throw new Error(`HF returned non-image: ${text.slice(0, 200)}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1000) {
    throw new Error('HF returned empty image')
  }
  return buf
}

/** Fallback: Qwen z-image-turbo via DashScope */
async function generateWithDashscope(prompt: string): Promise<string> {
  const apiKey = getDashscopeKey()
  if (!apiKey) throw new Error('DashScope key not configured')

  const res = await withTimeout(
    fetch(`${DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DASHSCOPE_MODEL,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
            },
          ],
        },
      }),
    }),
    45_000
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DashScope ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const choices = data?.output?.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('No choices in DashScope response')
  }

  const content = choices[0]?.message?.content
  if (!Array.isArray(content)) {
    throw new Error('No content in DashScope response')
  }

  const imageItem = content.find((c: any) => c?.image)
  if (!imageItem?.image) {
    throw new Error('No image in DashScope response')
  }

  // Download the image URL and convert to base64
  const imageUrl = imageItem.image as string
  const imgRes = await withTimeout(fetch(imageUrl), 15_000)
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  return `data:image/png;base64,${buf.toString('base64')}`
}

export async function POST(req: NextRequest) {
  let body: { prompt?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return Response.json({ error: 'Prompt wajib diisi' }, { status: 400 })
  }

  // ── Try Hugging Face FLUX.1-schnell first (primary) ──
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buf = await generateWithHF(prompt)
      const base64 = buf.toString('base64')
      return Response.json({
        image: `data:image/png;base64,${base64}`,
        prompt,
        provider: 'FLUX.1-schnell',
        attempts: attempt,
      })
    } catch (e: any) {
      console.error(`[generate-image] HF attempt ${attempt}/${MAX_RETRIES} failed:`, e?.message)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }

  // ── Fallback: Qwen z-image-turbo via DashScope ──
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const dataUrl = await generateWithDashscope(prompt)
      return Response.json({
        image: dataUrl,
        prompt,
        provider: 'z-image-turbo',
        attempts: attempt,
      })
    } catch (e: any) {
      console.error(`[generate-image] DashScope attempt ${attempt}/${MAX_RETRIES} failed:`, e?.message)
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt))
      }
    }
  }

  return Response.json(
    {
      error: 'Gagal membuat gambar. Hugging Face dan DashScope sedang bermasalah. Coba lagi nanti.',
    },
    { status: 502 }
  )
}
