import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const joinSchema = z.object({
  inviteCode: z.string().min(1),
})

// POST /api/groups/[id]/join - Join a group using invite code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const result = joinSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    const { inviteCode } = result.data

    // Find the group and verify invite code
    const group = await db.group.findUnique({
      where: { id },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    if (group.inviteCode !== inviteCode) {
      return NextResponse.json(
        { error: 'Invalid invite code' },
        { status: 400 }
      )
    }

    // Check if already a member
    const existingMembership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: user.id,
        },
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this group' },
        { status: 400 }
      )
    }

    // Add user as member
    await db.groupMember.create({
      data: {
        groupId: id,
        userId: user.id,
        role: 'member',
      },
    })

    return NextResponse.json({
      message: 'Successfully joined the group',
      group: { id: group.id, name: group.name },
    })
  } catch (error) {
    console.error('Join group error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
