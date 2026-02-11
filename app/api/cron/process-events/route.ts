import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { creditWallet } from '@/lib/wallet'
import { haversineMeters } from '@/lib/geo'

const PROXIMITY_RADIUS_METERS = 300
const GRUBS_PER_HOUR = 2
const GRUBS_PER_TICK = GRUBS_PER_HOUR / 60 // ~0.0333 per minute
const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

// This endpoint is called by Vercel Cron every minute
// It checks which users from the SAME GROUP are near each other and credits them Grubs
export async function GET() {
  try {
    const now = new Date()
    const cutoff = new Date(now.getTime() - ACTIVE_THRESHOLD_MS)

    // 1. Find all users who have pinged location recently AND are in at least one group
    const activeUsers = await db.user.findMany({
      where: {
        lastLocationAt: { gte: cutoff },
        lastLatitude: { not: null },
        lastLongitude: { not: null },
        memberships: { some: {} }, // must be in at least one group
      },
      select: {
        id: true,
        lastLatitude: true,
        lastLongitude: true,
        memberships: {
          select: { groupId: true },
        },
      },
    })

    // 2. Build a map of groupId -> user ids for group-based proximity checks
    const groupUsers = new Map<string, typeof activeUsers>()
    for (const user of activeUsers) {
      for (const membership of user.memberships) {
        const list = groupUsers.get(membership.groupId) || []
        list.push(user)
        groupUsers.set(membership.groupId, list)
      }
    }

    // 3. For each group, pairwise distance check — find users within 300m of at least one group mate
    const usersNearGroupMates = new Set<string>()

    for (const [, members] of groupUsers) {
      if (members.length < 2) continue // need at least 2 members active

      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const a = members[i]
          const b = members[j]
          const dist = haversineMeters(
            Number(a.lastLatitude),
            Number(a.lastLongitude),
            Number(b.lastLatitude),
            Number(b.lastLongitude)
          )
          if (dist <= PROXIMITY_RADIUS_METERS) {
            usersNearGroupMates.add(a.id)
            usersNearGroupMates.add(b.id)
          }
        }
      }
    }

    // 4. Update isNearOthers flag for all active users
    const allActiveIds = activeUsers.map((u) => u.id)

    if (allActiveIds.length > 0) {
      await db.user.updateMany({
        where: { id: { in: allActiveIds } },
        data: { isNearOthers: false },
      })

      const nearIds = Array.from(usersNearGroupMates)
      if (nearIds.length > 0) {
        await db.user.updateMany({
          where: { id: { in: nearIds } },
          data: { isNearOthers: true },
        })
      }
    }

    // 5. Credit each qualifying user
    let payouts = 0
    const errors: string[] = []

    for (const userId of usersNearGroupMates) {
      try {
        const result = await creditWallet({
          userId,
          amount: GRUBS_PER_TICK,
          type: 'proximity_earning',
          description: 'Earned near friends',
        })
        if (result.success) {
          payouts++
        }
      } catch (err) {
        errors.push(`Payout failed for ${userId}: ${err}`)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results: {
        activeUsers: activeUsers.length,
        usersNearGroupMates: usersNearGroupMates.size,
        payouts,
        errors,
      },
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Cron job failed', details: String(error) },
      { status: 500 }
    )
  }
}
