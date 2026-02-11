import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/groups/cookie-club — Get Cookie Club info + user's membership/request status
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Find Cookie Club
    const group = await db.group.findFirst({
      where: { name: 'Cookie Club' },
      include: {
        _count: { select: { members: true } },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Cookie Club not found' }, { status: 404 })
    }

    // Check membership
    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
    })

    // Check join request
    const joinRequest = await db.joinRequest.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
    })

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        memberCount: group._count.members,
      },
      status: membership
        ? 'member'
        : joinRequest?.status === 'pending'
          ? 'pending'
          : joinRequest?.status === 'denied'
            ? 'denied'
            : 'none',
      role: membership?.role || null,
    })
  } catch (error) {
    console.error('Cookie club status error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
