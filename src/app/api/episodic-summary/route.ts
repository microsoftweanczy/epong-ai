import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import { completeChat } from '@/lib/ai-providers'
import { EPISODIC_SUMMARY_PROMPT } from '@/lib/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Generate an episodic summary of a conversation.
 * Called when a conversation ends or after enough messages.
 * Returns a short 1-2 sentence summary for future reference.
 *
 * POST body: { messages: ApiMessage[] }
 * Response: { summary: string } | { error: string }
 */

const MIN_MESSAGES = 4

export async function POST(req: NextRequest) {
  let body: { messages?: ApiMessage[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []

  if (messages.length < MIN_MESSAGES) {
    return Response.json({ summary: '' })
  }

  // Take last 15 messages for summary
  const recent = messages.slice(-15)
  const conversationText = recent
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  const promptMessages: ApiMessage[] = [
    { role: 'system', content: EPISODIC_SUMMARY_PROMPT },
    { role: 'user', content: conversationText },
  ]

  try {
    const { text } = await completeChat(promptMessages)
    const summary = text.trim().slice(0, 200)
    return Response.json({ summary })
  } catch (e: any) {
    console.error('[episodic-summary] error:', e?.message)
    return Response.json({ summary: '' })
  }
}
