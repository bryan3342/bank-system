import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// GET /api/events/[id]/attendees - Get current attendees and their earnings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get event
    const event = await db.event.findUnique({
      where: { id },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if user is a member of the group
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: event.groupId,
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

    // Get all checkins for this event
    const checkins = await db.eventCheckin.findMany({
      where: { eventId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { checkedInAt: 'asc' },
    })

    const attendees = checkins.map((c) => ({
      user: c.user,
      checkedInAt: c.checkedInAt,
      isWithinRadius: c.isWithinRadius,
      lastLocationPing: c.lastLocationPing,
      totalSecondsPresent: c.totalSecondsPresent,
      currencyEarned: Number(c.currencyEarned),
    }))

    // Count active attendees (within radius)
    const activeCount = attendees.filter((a) => a.isWithinRadius).length

    return NextResponse.json({
      attendees,
      totalCheckins: attendees.length,
      activeAttendees: activeCount,
    })
  } catch (error) {
    console.error('Get attendees error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
