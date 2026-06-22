import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Speech-to-Text (ASR) endpoint.
 * Uses z-ai-web-dev-sdk's audio.asr.create() to transcribe audio.
 *
 * POST body: { audio: "data:audio/...;base64,..." }
 * Response: { text: string } | { error: string }
 */

function stripDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  // Extract the base64 portion from "data:audio/webm;base64,..."
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (match) {
    return { mimeType: match[1], base64: match[2] }
  }
  // If no prefix, assume it's already raw base64
  return { base64: dataUrl, mimeType: 'audio/wav' }
}

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

  // Strip the data URL prefix — the SDK expects raw base64 in file_base64
  const { base64, mimeType } = stripDataUrl(audio)

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    // Correct API: zai.audio.asr.create({ file_base64 })
    const result: any = await Promise.race([
      zai.audio.asr.create({
        file_base64: base64,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ASR timeout')), 25_000)
      ),
    ])

    // Response shape: { text: "transcribed text" }
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
