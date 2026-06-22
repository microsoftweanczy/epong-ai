import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Text-to-Speech (TTS) endpoint.
 * Uses z-ai-web-dev-sdk's audio.tts.create() to synthesize speech from text.
 *
 * POST body: { text: string, voice?: string }
 * Response: { audio: "data:audio/wav;base64,..." } | { error: string }
 *
 * Note: The SDK returns a standard Response object, not JSON.
 * We must call response.arrayBuffer() to get the audio bytes.
 * Max text length: 1024 chars (API constraint).
 */

export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return Response.json({ error: 'Teks wajib diisi' }, { status: 400 })
  }

  // Cap text length — TTS API max is 1024 chars
  const cappedText = text.slice(0, 1000)

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    // Correct API: zai.audio.tts.create() returns a Response object
    const response: Response = await Promise.race([
      zai.audio.tts.create({
        input: cappedText,
        voice: body.voice || 'tongtong',
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TTS timeout')), 25_000)
      ),
    ])

    // Get audio bytes from the Response object
    const arrayBuffer = await (response as any).arrayBuffer()
    const buffer = Buffer.from(new Uint8Array(arrayBuffer))

    if (buffer.length === 0) {
      return Response.json(
        { error: 'Tidak ada audio dalam respons' },
        { status: 502 }
      )
    }

    const base64 = buffer.toString('base64')
    return Response.json({
      audio: `data:audio/wav;base64,${base64}`,
    })
  } catch (e: any) {
    console.error('[tts] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal membuat audio' },
      { status: 500 }
    )
  }
}
