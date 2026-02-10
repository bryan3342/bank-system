import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// Validation for updating a group
const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  currencyRate: z.number().positive().optional(),
  minAttendance: z.number().int().min(2).optional(),
})

// GET /api/groups/[id] - Get group details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const group = await db.group.findUnique({
      where: { id: params.id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { members: true, events: true },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Check if user is a member
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

    return NextResponse.json({
      group: {
        ...group,
        memberCount: group._count.members,
        eventCount: group._count.events,
        myRole: membership.role,
      },
    })
  } catch (error) {
    console.error('Get group error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// PATCH /api/groups/[id] - Update group settings (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if user is admin or owner
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: params.id,
          userId: user.id,
        },
      },
    })

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can update group settings' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const result = updateGroupSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const group = await db.group.update({
      where: { id: params.id },
      data: result.data,
    })

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Update group error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
