import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Image generation endpoint — uses Qwen z-image-turbo via DashScope.
 *
 * The model is called via the multimodal-generation endpoint:
 *   POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * The response contains a message with an "image" field (URL to the generated PNG).
 * We fetch the image and return it as a base64 data URL so the client can render
 * it inline (and so it persists with the conversation).
 *
 * POST body: { prompt: string, size?: string }
 * Response: { image: "data:image/png;base64,...", prompt } | { error: string }
 */

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1'
const MODEL = 'z-image-turbo'
const MAX_RETRIES = 3
const FETCH_IMAGE_TIMEOUT = 15_000

function getApiKey(): string | null {
  // Allow override via env; fall back to the built-in key.
  return process.env.QWEN_IMAGE_API_KEY || 'sk-ws-H.IYYPHR.dM6s.MEUCID8hSB15TQhZO_RutoErcWE0dXcb5lmQKeeyc319DpGbAiEA4sHr-BtPdLPDyi6TBfqCUNREaPSpusiiUoRxFBDycWM'
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

/** Call z-image-turbo and return the generated image URL. */
async function generateImageUrl(prompt: string): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API key not configured')

  const res = await withTimeout(
    fetch(`${DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
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
  // Response shape: { output: { choices: [{ message: { content: [{ image: "https://..." }] } }] } }
  const choices = data?.output?.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('No choices in response')
  }

  const content = choices[0]?.message?.content
  if (!Array.isArray(content)) {
    throw new Error('No content in response')
  }

  const imageItem = content.find((c: any) => c?.image)
  if (!imageItem?.image) {
    throw new Error('No image in response')
  }

  return imageItem.image as string
}

/** Download the image URL and convert to base64 data URL. */
async function downloadAsDataUrl(url: string): Promise<string> {
  const res = await withTimeout(fetch(url), FETCH_IMAGE_TIMEOUT)
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const base64 = buffer.toString('base64')
  return `data:image/png;base64,${base64}`
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

  let lastError: any = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const imageUrl = await generateImageUrl(prompt)
      const dataUrl = await downloadAsDataUrl(imageUrl)
      return Response.json({
        image: dataUrl,
        prompt,
        attempts: attempt,
      })
    } catch (e: any) {
      lastError = e
      console.error(
        `[generate-image] attempt ${attempt}/${MAX_RETRIES} failed:`,
        e?.message
      )
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
