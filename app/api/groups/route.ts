import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// POST /api/groups - Disabled (only Cookie Club exists)
export async function POST() {
  return NextResponse.json(
    { error: 'Group creation is disabled. Use Request to Join on Cookie Club.' },
    { status: 403 }
  )
}

// GET /api/groups - List groups the user belongs to
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const memberships = await db.groupMember.findMany({
      where: { userId: user.id },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const groups = memberships.map((m) => ({
      ...m.group,
      memberCount: m.group._count.members,
      myRole: m.role,
    }))

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('List groups error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
