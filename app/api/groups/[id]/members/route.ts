import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/groups/[id]/members - List members of a group
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if user is a member of this group
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: params.id,
          userId: user.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      )
    }

    // Get all members
    const members = await db.groupMember.findMany({
      where: { groupId: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // owner first, then admin, then member
        { joinedAt: 'asc' },
      ],
    })

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        user: m.user,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    })
  } catch (error) {
    console.error('List members error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
