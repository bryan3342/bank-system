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

const PROXIMITY_RADIUS_METERS = 200
const MIN_ENCOUNTER_MS = 30_000 // 30 seconds minimum proximity
const COOLDOWN_MS = 3 * 60 * 60 * 1000 // 3 hours
const GRUBS_PER_ENCOUNTER = 2
const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes
const MIN_PING_GAP_MS = 20 * 1000 // prevent abuse

// POST /api/location - Update GPS + process encounter-based earning
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

    // Get user's current state
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

    // Must be in a group to earn
    const groupIds = currentUser?.memberships.map((m) => m.groupId) ?? []
    if (groupIds.length === 0) {
      return NextResponse.json({ success: true, encounters: 0 })
    }

    // Rate-limit pings
    const lastPing = currentUser?.lastLocationAt
    if (lastPing && now.getTime() - lastPing.getTime() < MIN_PING_GAP_MS) {
      return NextResponse.json({ success: true, encounters: 0 })
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
          select: { id: true, lastLatitude: true, lastLongitude: true },
        },
      },
    })

    // Filter to those within 200m
    const nearbyUserIds = nearbyGroupMembers
      .filter((m) => {
        const dist = haversineMeters(
          latitude,
          longitude,
          Number(m.user.lastLatitude),
          Number(m.user.lastLongitude)
        )
        return dist <= PROXIMITY_RADIUS_METERS
      })
      .map((m) => m.user.id)

    // Deduplicate (a user could be in multiple shared groups)
    const uniqueNearbyIds = [...new Set(nearbyUserIds)]

    let encountersCredited = 0

    for (const otherId of uniqueNearbyIds) {
      // Normalize pair: smaller ID first
      const [userAId, userBId] =
        user.id < otherId ? [user.id, otherId] : [otherId, user.id]

      const existing = await db.proximityEncounter.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
      })

      if (existing) {
        if (existing.creditedAt) {
          // Already credited — check cooldown
          const elapsed = now.getTime() - existing.creditedAt.getTime()
          if (elapsed < COOLDOWN_MS) {
            // Still in cooldown, skip
            continue
          }
          // Cooldown expired — reset encounter
          await db.proximityEncounter.update({
            where: { id: existing.id },
            data: { firstSeenAt: now, creditedAt: null },
          })
        } else {
          // Pending encounter — check if 30s have passed
          const elapsed = now.getTime() - existing.firstSeenAt.getTime()
          if (elapsed >= MIN_ENCOUNTER_MS) {
            // Credit both users
            await db.proximityEncounter.update({
              where: { id: existing.id },
              data: { creditedAt: now },
            })

            await Promise.all([
              creditWallet({
                userId: user.id,
                amount: GRUBS_PER_ENCOUNTER,
                type: 'encounter_earning',
                referenceType: 'encounter',
                referenceId: existing.id,
                description: 'Encounter with a Cookie Club member',
              }),
              creditWallet({
                userId: otherId,
                amount: GRUBS_PER_ENCOUNTER,
                type: 'encounter_earning',
                referenceType: 'encounter',
                referenceId: existing.id,
                description: 'Encounter with a Cookie Club member',
              }),
            ])

            encountersCredited++
          }
          // else: still pending, not enough time yet
        }
      } else {
        // No record — create pending encounter
        await db.proximityEncounter.create({
          data: { userAId, userBId, firstSeenAt: now },
        })
      }
    }

    return NextResponse.json({ success: true, encounters: encountersCredited })
  } catch (error) {
    console.error('Update location error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
