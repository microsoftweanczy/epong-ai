import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ChatMessage, ConversationSummary } from '@/lib/chat-types'

// GET /api/conversations?userId=xxx  -> list a user's conversations with last message + unread
export async function GET(req: NextRequest) {
  try {
    const userId = new URL(req.url).searchParams.get('userId') || ''
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const participations = await db.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: { include: { user: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: true },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    })

    const result: ConversationSummary[] = []

    for (const p of participations) {
      const conv = p.conversation
      const participants = conv.participants.map((cp) => ({
        id: cp.user.id,
        name: cp.user.name,
        avatarColor: cp.user.avatarColor,
      }))

      // avatar color: group uses green, direct uses the other user's color
      let avatarColor = '#25D366'
      let otherUserId: string | null = null
      if (!conv.isGroup) {
        const other = conv.participants.find((cp) => cp.userId !== userId)
        if (other) {
          otherUserId = other.userId
          avatarColor = other.user.avatarColor
        }
      }

      const lastDbMsg = conv.messages[0]
      const lastMessage: ChatMessage | null = lastDbMsg
        ? {
            id: lastDbMsg.id,
            conversationId: lastDbMsg.conversationId,
            senderId: lastDbMsg.senderId,
            senderName: lastDbMsg.sender.name,
            senderAvatarColor: lastDbMsg.sender.avatarColor,
            content: lastDbMsg.content,
            status: lastDbMsg.status as ChatMessage['status'],
            createdAt: lastDbMsg.createdAt.toISOString(),
          }
        : null

      // unread count: messages after this user's lastReadAt, not sent by this user
      const unreadCount = await db.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          createdAt: { gt: p.lastReadAt },
        },
      })

      // display name
      let name = conv.name
      if (!conv.isGroup && !name) {
        const other = conv.participants.find((cp) => cp.userId !== userId)
        name = other?.user.name || 'Unknown'
      }

      result.push({
        id: conv.id,
        name,
        isGroup: conv.isGroup,
        avatarColor,
        otherUserId,
        participants,
        lastMessage,
        unreadCount,
        updatedAt: conv.updatedAt.toISOString(),
      })
    }

    // sort: conversations with a last message by recency, then empty ones
    result.sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0
      return bt - at
    })

    return NextResponse.json({ conversations: result })
  } catch (e) {
    console.error('[GET /api/conversations] error', e)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}

// POST /api/conversations
// body: { userId, type: 'direct' | 'group', name?: string, participantIds: string[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId: string | undefined = body?.userId
    const type: 'direct' | 'group' = body?.type === 'group' ? 'group' : 'direct'
    const name: string | undefined = typeof body?.name === 'string' ? body.name.trim() : undefined
    const participantIds: string[] = Array.isArray(body?.participantIds) ? body.participantIds : []

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // ensure creator is included
    const memberIds = Array.from(new Set([userId, ...participantIds]))

    if (type === 'direct') {
      if (memberIds.length !== 2) {
        return NextResponse.json(
          { error: 'Direct chat requires exactly 2 participants' },
          { status: 400 }
        )
      }
      const [a, b] = memberIds.sort()
      const directKey = `direct:${a}:${b}`

      // find existing direct conversation
      const existing = await db.conversation.findUnique({
        where: { directKey },
        include: { participants: true },
      })
      if (existing) {
        return NextResponse.json({ conversation: existing, existed: true })
      }

      const conv = await db.conversation.create({
        data: {
          isGroup: false,
          directKey,
          participants: {
            create: memberIds.map((id) => ({ userId: id })),
          },
        },
        include: { participants: true },
      })
      return NextResponse.json({ conversation: conv, existed: false })
    }

    // group chat
    if (memberIds.length < 2) {
      return NextResponse.json(
        { error: 'Group needs at least 2 participants' },
        { status: 400 }
      )
    }
    if (!name) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const conv = await db.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: memberIds.map((id) => ({ userId: id })),
        },
      },
      include: { participants: true },
    })
    return NextResponse.json({ conversation: conv, existed: false })
  } catch (e) {
    console.error('[POST /api/conversations] error', e)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
