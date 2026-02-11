import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isWithinRadius } from '@/lib/geo'

const pingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

// POST /api/events/[id]/ping - Send location heartbeat during event
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
    const result = pingSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Location (latitude and longitude) is required' },
        { status: 400 }
      )
    }

    const { latitude, longitude } = result.data

    // Get event details
    const event = await db.event.findUnique({
      where: { id },
      include: {
        group: {
          select: { minAttendance: true },
        },
      },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check event is active or confirmed
    if (!['active', 'confirmed'].includes(event.status)) {
      return NextResponse.json(
        { error: `Event is ${event.status}, not accepting pings` },
        { status: 400 }
      )
    }

    // Get user's checkin
    const checkin = await db.eventCheckin.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: user.id,
        },
      },
    })

    if (!checkin) {
      return NextResponse.json(
        { error: 'You must check in first' },
        { status: 400 }
      )
    }

    // Check if user is within radius
    const withinRadius = isWithinRadius(
      latitude,
      longitude,
      Number(event.latitude),
      Number(event.longitude),
      event.radiusMeters
    )

    // Update checkin with new location status
    await db.eventCheckin.update({
      where: { id: checkin.id },
      data: {
        isWithinRadius: withinRadius,
        lastLocationPing: new Date(),
      },
    })

    // If event is active, check if we should confirm it
    if (withinRadius && event.status === 'active') {
      const activeCount = await db.eventCheckin.count({
        where: {
          eventId: id,
          isWithinRadius: true,
        },
      })

      const threshold = event.minAttendance ?? event.group.minAttendance

      if (activeCount >= threshold) {
        await db.event.update({
          where: { id },
          data: {
            status: 'confirmed',
            confirmedAt: new Date(),
          },
        })
      }
    }

    return NextResponse.json({
      isWithinRadius: withinRadius,
      lastPing: new Date(),
    })
  } catch (error) {
    console.error('Ping error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
