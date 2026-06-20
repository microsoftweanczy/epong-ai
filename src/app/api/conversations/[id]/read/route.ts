import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/conversations/[id]/read  { userId }
// Marks the caller's lastReadAt to now, and flips messages from others to "read".
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const userId: string | undefined = body?.userId
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const participant = await db.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    const now = new Date()

    // mark messages sent by others (not yet read) as read
    const updated = await db.message.updateMany({
      where: {
        conversationId: id,
        senderId: { not: userId },
        status: { not: 'read' },
      },
      data: { status: 'read' },
    })

    // bump this user's lastReadAt
    await db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: now },
    })

    return NextResponse.json({ marked: updated.count })
  } catch (e) {
    console.error('[POST read] error', e)
    return NextResponse.json({ error: 'Failed to mark read' }, { status: 500 })
  }
}
