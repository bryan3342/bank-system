import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { haversineMeters } from '@/lib/geo'
import { creditWallet } from '@/lib/wallet'

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

const PROXIMITY_RADIUS_METERS = 300
const PING_INTERVAL_SECONDS = 30
const GRUBS_PER_HOUR = 2
const GRUBS_PER_PING = (GRUBS_PER_HOUR / 3600) * PING_INTERVAL_SECONDS // ~0.01667
const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes
const MIN_PING_GAP_MS = 20 * 1000 // prevent abuse: ignore pings faster than 20s apart

// POST /api/location - Update GPS + check proximity earning
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const result = locationSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
    }

    const { latitude, longitude } = result.data
    const now = new Date()

    // Get user's current state (including last ping time and group memberships)
    const currentUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        lastLocationAt: true,
        memberships: { select: { groupId: true } },
      },
    })

    // Update location
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationAt: now,
      },
    })

    // Check if user is in any group — can't earn without a group
    const groupIds = currentUser?.memberships.map((m) => m.groupId) ?? []
    if (groupIds.length === 0) {
      return NextResponse.json({ success: true, isNearOthers: false })
    }

    // Rate-limit: skip earning if last ping was too recent
    const lastPing = currentUser?.lastLocationAt
    if (lastPing && now.getTime() - lastPing.getTime() < MIN_PING_GAP_MS) {
      const userState = await db.user.findUnique({
        where: { id: user.id },
        select: { isNearOthers: true },
      })
      return NextResponse.json({ success: true, isNearOthers: userState?.isNearOthers ?? false })
    }

    // Find active group members nearby
    const cutoff = new Date(now.getTime() - ACTIVE_THRESHOLD_MS)

    const nearbyGroupMembers = await db.groupMember.findMany({
      where: {
        groupId: { in: groupIds },
        userId: { not: user.id },
        user: {
          lastLocationAt: { gte: cutoff },
          lastLatitude: { not: null },
          lastLongitude: { not: null },
        },
      },
      include: {
        user: {
          select: { lastLatitude: true, lastLongitude: true },
        },
      },
    })

    // Check if any group member is within 300m
    const isNearOthers = nearbyGroupMembers.some((m) => {
      const dist = haversineMeters(
        latitude,
        longitude,
        Number(m.user.lastLatitude),
        Number(m.user.lastLongitude)
      )
      return dist <= PROXIMITY_RADIUS_METERS
    })

    // Update the flag
    await db.user.update({
      where: { id: user.id },
      data: { isNearOthers },
    })

    // Credit grubs if near group members
    if (isNearOthers) {
      await creditWallet({
        userId: user.id,
        amount: GRUBS_PER_PING,
        type: 'proximity_earning',
        description: 'Earned near friends',
      })
    }

    return NextResponse.json({ success: true, isNearOthers })
  } catch (error) {
    console.error('Update location error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
