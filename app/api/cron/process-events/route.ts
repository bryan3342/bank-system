import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Daily cron: clean up stale encounter records (credited > 24h ago)
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const { count } = await db.proximityEncounter.deleteMany({
      where: {
        creditedAt: { lt: cutoff },
      },
    })

    // Also clean up pending encounters older than 24h (abandoned)
    const { count: pendingCount } = await db.proximityEncounter.deleteMany({
      where: {
        creditedAt: null,
        firstSeenAt: { lt: cutoff },
      },
    })

    return NextResponse.json({
      success: true,
      cleaned: { credited: count, pending: pendingCount },
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Cron job failed', details: String(error) },
      { status: 500 }
    )
  }
}
