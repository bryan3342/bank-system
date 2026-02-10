import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { generateInviteCode } from '@/lib/utils'

// Validation for creating a group
const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  currencyRate: z.number().positive().optional().default(1.0),
  minAttendance: z.number().int().min(2).optional().default(2),
})

// POST /api/groups - Create a new group
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const result = createGroupSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { name, description, currencyRate, minAttendance } = result.data

    // Create group and add creator as owner in one transaction
    const group = await db.$transaction(async (tx) => {
      // Generate a unique invite code
      let inviteCode = generateInviteCode()
      let attempts = 0
      while (attempts < 5) {
        const existing = await tx.group.findUnique({
          where: { inviteCode },
        })
        if (!existing) break
        inviteCode = generateInviteCode()
        attempts++
      }

      // Create the group
      const newGroup = await tx.group.create({
        data: {
          name,
          description,
          inviteCode,
          ownerId: user.id,
          currencyRate,
          minAttendance,
        },
      })

      // Add the creator as owner member
      await tx.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId: user.id,
          role: 'owner',
        },
      })

      return newGroup
    })

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

// GET /api/groups - List groups the user belongs to
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const memberships = await db.groupMember.findMany({
      where: { userId: user.id },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const groups = memberships.map((m) => ({
      ...m.group,
      memberCount: m.group._count.members,
      myRole: m.role,
    }))

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('List groups error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
