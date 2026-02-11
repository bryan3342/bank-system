import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// Validation for creating an event
const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(10000).optional().default(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minAttendance: z.number().int().min(2).optional(),
  currencyRate: z.number().positive().optional(),
})

// POST /api/groups/[id]/events - Create an event (admin only)
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

    // Check if user is admin or owner
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: id,
          userId: user.id,
        },
      },
    })

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can create events' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const result = createEventSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const data = result.data

    // Validate that end time is after start time
    const startsAt = new Date(data.startsAt)
    const endsAt = new Date(data.endsAt)

    if (endsAt <= startsAt) {
      return NextResponse.json(
        { error: 'End time must be after start time' },
        { status: 400 }
      )
    }

    // Create the event
    const event = await db.event.create({
      data: {
        groupId: id,
        name: data.name,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        radiusMeters: data.radiusMeters,
        startsAt,
        endsAt,
        minAttendance: data.minAttendance,
        currencyRate: data.currencyRate,
        createdBy: user.id,
      },
    })

    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    console.error('Create event error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// GET /api/groups/[id]/events - List group events
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
        { status: 403 }
      )
    }

    // Get query params for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const upcoming = searchParams.get('upcoming') === 'true'

    // Build query
    const where: any = { groupId: id }

    if (status) {
      where.status = status
    }

    if (upcoming) {
      where.startsAt = { gte: new Date() }
      where.status = { in: ['scheduled', 'active', 'confirmed'] }
    }

    const events = await db.event.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true },
        },
        _count: {
          select: { checkins: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    })

    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        attendeeCount: e._count.checkins,
      })),
    })
  } catch (error) {
    console.error('List events error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
