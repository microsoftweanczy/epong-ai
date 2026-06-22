import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Speech-to-Text (ASR) endpoint.
 * Uses z-ai-web-dev-sdk to transcribe audio.
 *
 * POST body: { audio: "data:audio/...;base64,..." }
 * Response: { text: string } | { error: string }
 */

export async function POST(req: NextRequest) {
  let body: { audio?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const audio = body.audio?.trim()
  if (!audio) {
    return Response.json({ error: 'Audio wajib diisi' }, { status: 400 })
  }

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const result: any = await Promise.race([
      zai.audio.transcriptions.create({
        file: audio,
        model: 'asr',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ASR timeout')), 25_000)
      ),
    ])

    const text = result?.text || result?.transcription || ''
    return Response.json({ text })
  } catch (e: any) {
    console.error('[asr] error:', e?.message)
    return Response.json(
      { error: e?.message || 'Gagal transkripsi audio' },
      { status: 500 }
    )
  }
}
