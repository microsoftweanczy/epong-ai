import { NextRequest } from 'next/server'
import type { ApiMessage } from '@/lib/types'
import type { MemoryNote } from '@/lib/settings'
import { completeChat } from '@/lib/ai-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Analyze user behavior from conversation history.
 * Generates a personalized behavior profile that helps the AI adapt.
 *
 * Input: { messages, existingMemory, existingProfile }
 * Output: { profile: string, insights: string[] }
 */

const ANALYZE_PROMPT = `You are a behavior analyst. Analyze the user's conversation patterns and create a concise behavior profile.

Based on the conversation, identify:
1. Communication style (formal/casual/direct/indirect)
2. Topics of interest (work, education, tech, personal, etc.)
3. Emotional patterns (optimistic, anxious, curious, practical)
4. Response preferences (likes detailed or brief answers, bullet points or paragraphs)
5. Language patterns (formal/informal, uses slang, asks follow-up questions)

Output format (JSON):
{
  "profile": "2-3 sentence summary of the user's communication style and preferences",
  "insights": ["short insight 1", "short insight 2", "short insight 3"]
}

Keep it concise and actionable. This profile will help personalize future responses.
Output ONLY the JSON, no markdown.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages: ApiMessage[] = body.messages || []
    const existingMemory: MemoryNote[] = body.existingMemory || []
    const existingProfile: string = body.existingProfile || ''

    if (messages.length < 4) {
      return Response.json({ profile: existingProfile, insights: [] })
    }

    // Build analysis context
    const conversationText = messages
      .slice(-15) // last 15 messages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const memoryText = existingMemory
      .slice(0, 10)
      .map((m) => `- ${m.content}`)
      .join('\n')

    const analysisMessages: ApiMessage[] = [
      { role: 'system', content: ANALYZE_PROMPT },
      {
        role: 'user',
        content: `EXISTING PROFILE: ${existingProfile || '(none)'}\n\nUSER MEMORY:\n${memoryText || '(none)'}\n\nRECENT CONVERSATION:\n${conversationText}\n\nAnalyze and output JSON:`,
      },
    ]

    const result = await completeChat(analysisMessages)

    try {
      // Parse JSON from result
      const match = result.match(/\{[\s\S]*\}/)
      if (!match) {
        return Response.json({ profile: existingProfile, insights: [] })
      }
      const parsed = JSON.parse(match[0])
      return Response.json({
        profile: parsed.profile || existingProfile,
        insights: parsed.insights || [],
      })
    } catch {
      return Response.json({ profile: existingProfile, insights: [] })
    }
  } catch (e: any) {
    console.error('[analyze-behavior] error:', e?.message)
    return Response.json({ profile: '', insights: [] })
  }
}
