import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Text-to-Speech (TTS) endpoint.
 * Uses z-ai-web-dev-sdk to synthesize speech from text.
 *
 * POST body: { text: string, voice?: string }
 * Response: { audio: "data:audio/mpeg;base64,..." } | { error: string }
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

  // Cap text length — TTS can be slow for very long texts
  const cappedText = text.slice(0, 1000)

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const result: any = await Promise.race([
      zai.audio.speech.create({
        input: cappedText,
        voice: body.voice || 'default',
        response_format: 'mp3',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TTS timeout')), 25_000)
      ),
    ])

    // Result may be base64 audio or a buffer
    let audioBase64 = ''
    if (typeof result === 'string') {
      audioBase64 = result
    } else if (result?.audio) {
      audioBase64 = result.audio
    } else if (result?.data) {
      audioBase64 = result.data
    } else if (Buffer.isBuffer(result)) {
      audioBase64 = result.toString('base64')
    }

    if (!audioBase64) {
      return Response.json(
        { error: 'Tidak ada audio dalam respons' },
        { status: 502 }
      )
    }

    return Response.json({
      audio: `data:audio/mpeg;base64,${audioBase64}`,
    })
  } catch (e: any) {
    console.error('[tts] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal membuat audio' },
      { status: 500 }
    )
  }
}
