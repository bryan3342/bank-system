import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// Validation for updating an event
const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(10).max(10000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  minAttendance: z.number().int().min(2).optional(),
  currencyRate: z.number().positive().optional(),
})

// GET /api/events/[id] - Get event details
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

    const event = await db.event.findUnique({
      where: { id },
      include: {
        group: {
          select: { id: true, name: true, currencyRate: true, minAttendance: true },
        },
        creator: {
          select: { id: true, name: true },
        },
        checkins: {
          where: { isWithinRadius: true },
          select: { userId: true },
        },
        _count: {
          select: { checkins: true },
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

    // Check if user has checked in
    const myCheckin = await db.eventCheckin.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: user.id,
        },
      },
    })

    return NextResponse.json({
      event: {
        ...event,
        totalCheckins: event._count.checkins,
        activeAttendees: event.checkins.length,
        effectiveRate: Number(event.currencyRate ?? event.group.currencyRate),
        effectiveMinAttendance: event.minAttendance ?? event.group.minAttendance,
        myCheckin: myCheckin
          ? {
              checkedInAt: myCheckin.checkedInAt,
              isWithinRadius: myCheckin.isWithinRadius,
              currencyEarned: Number(myCheckin.currencyEarned),
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get event error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// PATCH /api/events/[id] - Update event (admin only, only if scheduled)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const event = await db.event.findUnique({
      where: { id },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if user is admin
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: event.groupId,
          userId: user.id,
        },
      },
    })

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can update events' },
        { status: 403 }
      )
    }

    // Can only update scheduled events
    if (event.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Can only update scheduled events' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const result = updateEventSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const data = result.data
    const updateData: any = {}

    if (data.name) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.latitude) updateData.latitude = data.latitude
    if (data.longitude) updateData.longitude = data.longitude
    if (data.radiusMeters) updateData.radiusMeters = data.radiusMeters
    if (data.startsAt) updateData.startsAt = new Date(data.startsAt)
    if (data.endsAt) updateData.endsAt = new Date(data.endsAt)
    if (data.minAttendance) updateData.minAttendance = data.minAttendance
    if (data.currencyRate) updateData.currencyRate = data.currencyRate

    const updated = await db.event.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ event: updated })
  } catch (error) {
    console.error('Update event error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id] - Cancel event (admin only)
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

    const event = await db.event.findUnique({
      where: { id },
    })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if user is admin
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: event.groupId,
          userId: user.id,
        },
      },
    })

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can cancel events' },
        { status: 403 }
      )
    }

    // Can't cancel already ended events
    if (event.status === 'ended') {
      return NextResponse.json(
        { error: 'Cannot cancel an ended event' },
        { status: 400 }
      )
    }

    await db.event.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    return NextResponse.json({ message: 'Event cancelled' })
  } catch (error) {
    console.error('Cancel event error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
