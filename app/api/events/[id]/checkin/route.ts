import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isWithinRadius } from '@/lib/geo'

const checkinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

// POST /api/events/[id]/checkin - Check in to an event
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const result = checkinSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Location (latitude and longitude) is required' },
        { status: 400 }
      )
    }

    const { latitude, longitude } = result.data

    // Get event details
    const event = await db.event.findUnique({
      where: { id: params.id },
      include: {
        group: {
          select: { minAttendance: true },
        },
      },
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

    // Check event status - can only check in to active or confirmed events
    if (!['active', 'confirmed'].includes(event.status)) {
      return NextResponse.json(
        { error: `Cannot check in to ${event.status} event` },
        { status: 400 }
      )
    }

    // Check if already checked in
    const existingCheckin = await db.eventCheckin.findUnique({
      where: {
        eventId_userId: {
          eventId: params.id,
          userId: user.id,
        },
      },
    })

    if (existingCheckin) {
      return NextResponse.json(
        { error: 'You are already checked in to this event' },
        { status: 400 }
      )
    }

    // Check if user is within the event radius
    const withinRadius = isWithinRadius(
      latitude,
      longitude,
      Number(event.latitude),
      Number(event.longitude),
      event.radiusMeters
    )

    // Create check-in record
    const checkin = await db.eventCheckin.create({
      data: {
        eventId: params.id,
        userId: user.id,
        isWithinRadius: withinRadius,
        lastLocationPing: new Date(),
      },
    })

    // If this checkin brings us to the threshold, confirm the event
    if (withinRadius && event.status === 'active') {
      const activeCount = await db.eventCheckin.count({
        where: {
          eventId: params.id,
          isWithinRadius: true,
        },
      })

      const threshold = event.minAttendance ?? event.group.minAttendance

      if (activeCount >= threshold) {
        await db.event.update({
          where: { id: params.id },
          data: {
            status: 'confirmed',
            confirmedAt: new Date(),
          },
        })
      }
    }

    return NextResponse.json({
      checkin: {
        id: checkin.id,
        checkedInAt: checkin.checkedInAt,
        isWithinRadius: checkin.isWithinRadius,
      },
      message: withinRadius
        ? 'Checked in successfully'
        : 'Checked in, but you are outside the event area',
    })
  } catch (error) {
    console.error('Checkin error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
