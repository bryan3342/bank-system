import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

// GET /api/nearby - Get active users near the caller
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const self = await db.user.findUnique({
      where: { id: user.id },
      select: {
        lastLatitude: true,
        lastLongitude: true,
        isNearOthers: true,
      },
    })

    if (!self?.lastLatitude || !self?.lastLongitude) {
      return NextResponse.json({
        users: [],
        self: { isNearOthers: false, latitude: null, longitude: null },
      })
    }

    const cutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MS)

    const activeUsers = await db.user.findMany({
      where: {
        id: { not: user.id },
        lastLocationAt: { gte: cutoff },
        lastLatitude: { not: null },
        lastLongitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        lastLatitude: true,
        lastLongitude: true,
        lastLocationAt: true,
      },
    })

    return NextResponse.json({
      users: activeUsers.map((u) => ({
        id: u.id,
        name: u.name,
        latitude: Number(u.lastLatitude),
        longitude: Number(u.lastLongitude),
        lastSeen: u.lastLocationAt!.toISOString(),
      })),
      self: {
        isNearOthers: self.isNearOthers,
        latitude: Number(self.lastLatitude),
        longitude: Number(self.lastLongitude),
      },
    })
  } catch (error) {
    console.error('Get nearby users error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
