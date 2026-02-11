import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// DELETE /api/groups/[id]/leave - Leave a group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check if user is a member
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: user.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 400 }
      )
    }

    // Owners cannot leave - they must transfer ownership first or delete the group
    if (membership.role === 'owner') {
      return NextResponse.json(
        { error: 'Owners cannot leave. Transfer ownership first or delete the group.' },
        { status: 400 }
      )
    }

    // Remove membership
    await db.groupMember.delete({
      where: {
        groupId_userId: {
          groupId: id,
          userId: user.id,
        },
      },
    })

    return NextResponse.json({ message: 'Successfully left the group' })
  } catch (error) {
    console.error('Leave group error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
