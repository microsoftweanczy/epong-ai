import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/users  -> create or fetch a user by name (used for onboarding)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Try to find existing user by name (exact match)
    const existing = await db.user.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ user: existing })
    }

    // Pick an avatar color from a friendly palette
    const palette = [
      '#25D366', '#34B7F1', '#FF6B6B', '#F0B429', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#10B981',
    ]
    const avatarColor = palette[Math.floor(Math.random() * palette.length)]

    const user = await db.user.create({
      data: { name, avatarColor },
    })
    return NextResponse.json({ user })
  } catch (e) {
    console.error('[POST /api/users] error', e)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

// GET /api/users?search=xxx&exclude=userId  -> search users by name
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').trim()
    const exclude = searchParams.get('exclude') || ''

    if (!search) {
      return NextResponse.json({ users: [] })
    }

    const users = await db.user.findMany({
      where: {
        name: { contains: search },
        ...(exclude ? { NOT: { id: exclude } } : {}),
      },
      take: 20,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ users })
  } catch (e) {
    console.error('[GET /api/users] error', e)
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
  }
}
