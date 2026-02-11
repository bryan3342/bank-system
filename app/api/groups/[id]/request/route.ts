import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendJoinRequestEmail } from '@/lib/email'

// POST /api/groups/[id]/request — Request to join a group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id: groupId } = await params

    // Find the group and its owner
    const group = await db.group.findUnique({
      where: { id: groupId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Check if already a member
    const existingMembership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this group' },
        { status: 400 }
      )
    }

    // Check if there's already a pending request
    const existingRequest = await db.joinRequest.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    })

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'You already have a pending request' },
          { status: 400 }
        )
      }
      if (existingRequest.status === 'denied') {
        return NextResponse.json(
          { error: 'Your request was denied' },
          { status: 400 }
        )
      }
    }

    // Create join request with a unique token
    const token = randomBytes(32).toString('hex')

    await db.joinRequest.create({
      data: {
        groupId,
        userId: user.id,
        token,
      },
    })

    // Send email to the group owner
    try {
      await sendJoinRequestEmail({
        ownerEmail: group.owner.email,
        ownerName: group.owner.name,
        requesterName: user.name,
        groupName: group.name,
        token,
      })
    } catch {
      // Email failure shouldn't block the request creation
      console.error('Email send failed, but request was created')
    }

    return NextResponse.json({
      message: 'Join request sent. The group owner will review your request.',
    })
  } catch (error) {
    console.error('Join request error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
