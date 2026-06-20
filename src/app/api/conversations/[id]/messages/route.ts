import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ChatMessage } from '@/lib/chat-types'

function toChatMessage(
  m: {
    id: string
    conversationId: string
    senderId: string
    content: string
    status: string
    createdAt: Date
    sender: { id: string; name: string; avatarColor: string }
  }
): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.sender.name,
    senderAvatarColor: m.sender.avatarColor,
    content: m.content,
    status: m.status as ChatMessage['status'],
    createdAt: m.createdAt.toISOString(),
  }
}

// GET /api/conversations/[id]/messages?userId=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = new URL(req.url).searchParams.get('userId') || ''
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // verify membership
    const participant = await db.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: id, userId },
      },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    const messages = await db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { sender: true },
    })

    return NextResponse.json({ messages: messages.map(toChatMessage) })
  } catch (e) {
    console.error('[GET messages] error', e)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/conversations/[id]/messages  { senderId, content }
// Persists the message and returns it (the client then relays via socket)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const senderId: string | undefined = body?.senderId
    const content: string = typeof body?.content === 'string' ? body.content.trim() : ''

    if (!senderId || !content) {
      return NextResponse.json({ error: 'senderId and content are required' }, { status: 400 })
    }

    // verify sender is a participant
    const participant = await db.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: senderId } },
    })
    if (!participant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    const created = await db.message.create({
      data: { conversationId: id, senderId, content, status: 'sent' },
      include: { sender: true },
    })

    // bump conversation updatedAt so it sorts to top
    await db.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({ message: toChatMessage(created) })
  } catch (e) {
    console.error('[POST messages] error', e)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
