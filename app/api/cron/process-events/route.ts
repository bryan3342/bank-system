import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { creditWallet } from '@/lib/wallet'
import { Decimal } from '@prisma/client/runtime/library'

// This endpoint is called by Vercel Cron every minute
// It handles event lifecycle transitions and currency payouts

export async function GET(request: NextRequest) {
  try {
    // Optional: Verify this is from Vercel Cron (in production)
    // const authHeader = request.headers.get('authorization')
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const now = new Date()
    const results = {
      activated: 0,
      confirmed: 0,
      ended: 0,
      payouts: 0,
      errors: [] as string[],
    }

    // 1. SCHEDULED → ACTIVE
    // Move events to active when their start time has passed
    const activatedEvents = await db.event.updateMany({
      where: {
        status: 'scheduled',
        startsAt: { lte: now },
      },
      data: {
        status: 'active',
      },
    })
    results.activated = activatedEvents.count

    // 2. ACTIVE → CONFIRMED
    // Check if any active events have met their attendance threshold
    const activeEvents = await db.event.findMany({
      where: { status: 'active' },
      include: {
        group: {
          select: { minAttendance: true },
        },
      },
    })

    for (const event of activeEvents) {
      const activeCount = await db.eventCheckin.count({
        where: {
          eventId: event.id,
          isWithinRadius: true,
        },
      })

      const threshold = event.minAttendance ?? event.group.minAttendance

      if (activeCount >= threshold) {
        await db.event.update({
          where: { id: event.id },
          data: {
            status: 'confirmed',
            confirmedAt: now,
          },
        })
        results.confirmed++
      }
    }

    // 3. Process payouts for CONFIRMED events
    // Pay users who are within the event radius
    const confirmedEvents = await db.event.findMany({
      where: {
        status: 'confirmed',
        endsAt: { gt: now }, // Still running
      },
      include: {
        group: {
          select: { currencyRate: true },
        },
      },
    })

    for (const event of confirmedEvents) {
      // Get all users currently within radius
      const activeCheckins = await db.eventCheckin.findMany({
        where: {
          eventId: event.id,
          isWithinRadius: true,
        },
      })

      const rate = Number(event.currencyRate ?? event.group.currencyRate)
      const payoutPerMinute = rate // Rate is already in Grub per minute

      for (const checkin of activeCheckins) {
        try {
          // Credit the user's wallet
          const creditResult = await creditWallet({
            userId: checkin.userId,
            amount: payoutPerMinute,
            type: 'event_earning',
            referenceType: 'event',
            referenceId: event.id,
            description: `Earned from: ${event.name}`,
          })

          if (creditResult.success) {
            // Update checkin stats
            await db.eventCheckin.update({
              where: { id: checkin.id },
              data: {
                totalSecondsPresent: { increment: 60 },
                currencyEarned: {
                  increment: payoutPerMinute,
                },
              },
            })
            results.payouts++
          }
        } catch (err) {
          results.errors.push(`Payout failed for user ${checkin.userId}: ${err}`)
        }
      }
    }

    // 4. ACTIVE or CONFIRMED → ENDED
    // End events that have passed their end time
    const endedEvents = await db.event.updateMany({
      where: {
        status: { in: ['active', 'confirmed'] },
        endsAt: { lte: now },
      },
      data: {
        status: 'ended',
      },
    })
    results.ended = endedEvents.count

    // For ended events, mark all users as checked out
    if (endedEvents.count > 0) {
      const justEndedEvents = await db.event.findMany({
        where: {
          status: 'ended',
          updatedAt: { gte: new Date(now.getTime() - 60000) }, // Updated in last minute
        },
        select: { id: true },
      })

      for (const event of justEndedEvents) {
        await db.eventCheckin.updateMany({
          where: {
            eventId: event.id,
            checkedOutAt: null,
          },
          data: {
            checkedOutAt: now,
            isWithinRadius: false,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Cron job failed', details: String(error) },
      { status: 500 }
    )
  }
}
