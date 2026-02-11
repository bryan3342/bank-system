import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Find Cookie Club
    const cookieClub = await db.group.findFirst({
      where: { name: 'Cookie Club' },
      select: { id: true },
    })
    const clubId = cookieClub?.id ?? null

    // Date boundaries
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)

    const activeThreshold = new Date(Date.now() - 2 * 60 * 1000)

    // Run all queries in parallel
    const [
      todaySum,
      weekSum,
      allTimeSum,
      dailyRaw,
      streakRaw,
      leaderboardRaw,
      activeMembersRaw,
    ] = await Promise.all([
      // Earnings: today
      db.transaction.aggregate({
        where: {
          userId: user.id,
          type: 'proximity_earning',
          amount: { gt: 0 },
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      }),
      // Earnings: this week
      db.transaction.aggregate({
        where: {
          userId: user.id,
          type: 'proximity_earning',
          amount: { gt: 0 },
          createdAt: { gte: weekStart },
        },
        _sum: { amount: true },
      }),
      // Earnings: all time
      db.transaction.aggregate({
        where: {
          userId: user.id,
          type: 'proximity_earning',
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),
      // Daily history for sparkline
      db.$queryRaw<Array<{ day: Date; total: string | number }>>`
        SELECT DATE(created_at) AS day, SUM(amount) AS total
        FROM transactions
        WHERE user_id = ${user.id}
          AND type = 'proximity_earning'
          AND amount > 0
          AND created_at >= ${weekStart}
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `,
      // Earning streak
      db.$queryRaw<Array<{ streak_length: number; last_day: Date }>>`
        WITH earning_days AS (
          SELECT DISTINCT DATE(created_at) AS day
          FROM transactions
          WHERE user_id = ${user.id}
            AND type = 'proximity_earning'
            AND amount > 0
        ),
        numbered AS (
          SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day DESC))::int AS grp
          FROM earning_days
        ),
        streaks AS (
          SELECT grp, COUNT(*)::int AS streak_length, MAX(day) AS last_day
          FROM numbered
          GROUP BY grp
        )
        SELECT streak_length, last_day
        FROM streaks
        WHERE last_day >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY last_day DESC
        LIMIT 1
      `,
      // Leaderboard
      clubId
        ? db.$queryRaw<Array<{ user_id: string; name: string; total: string | number }>>`
            SELECT u.id AS user_id, u.name, COALESCE(SUM(t.amount), 0) AS total
            FROM group_members gm
            JOIN users u ON u.id = gm.user_id
            LEFT JOIN transactions t
              ON t.user_id = u.id
              AND t.type = 'proximity_earning'
              AND t.amount > 0
            WHERE gm.group_id = ${clubId}
            GROUP BY u.id, u.name
            ORDER BY total DESC
            LIMIT 10
          `
        : Promise.resolve([]),
      // Active members
      clubId
        ? db.groupMember.findMany({
            where: {
              groupId: clubId,
              userId: { not: user.id },
              user: { lastLocationAt: { gte: activeThreshold } },
            },
            include: {
              user: {
                select: { id: true, name: true, lastLocationAt: true },
              },
            },
          })
        : Promise.resolve([]),
    ])

    // Build daily history array (7 days, oldest first)
    const dailyHistory = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      const match = (dailyRaw as Array<{ day: Date; total: string | number }>).find(
        (r) => new Date(r.day).toISOString().split('T')[0] === key
      )
      return match ? Number(match.total) : 0
    })

    // Build streak
    const streakRow = (streakRaw as Array<{ streak_length: number; last_day: Date }>)[0]
    const streakDays = streakRow ? Number(streakRow.streak_length) : 0
    const isActiveToday = streakRow
      ? new Date(streakRow.last_day).toISOString().split('T')[0] ===
        now.toISOString().split('T')[0]
      : false

    // Build leaderboard
    const leaderboard = (
      leaderboardRaw as Array<{ user_id: string; name: string; total: string | number }>
    ).map((r, i) => ({
      userId: r.user_id,
      name: r.name,
      totalEarned: Number(r.total),
      rank: i + 1,
    }))

    // Build active members
    const activeMembers = (
      activeMembersRaw as Array<{
        user: { id: string; name: string; lastLocationAt: Date | null }
      }>
    ).map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      lastSeenAt: m.user.lastLocationAt?.toISOString() ?? '',
    }))

    return NextResponse.json({
      earnings: {
        today: Number(todaySum._sum.amount ?? 0),
        thisWeek: Number(weekSum._sum.amount ?? 0),
        allTime: Number(allTimeSum._sum.amount ?? 0),
        dailyHistory,
      },
      streak: {
        days: streakDays,
        isActiveToday,
      },
      leaderboard,
      activeMembers,
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
