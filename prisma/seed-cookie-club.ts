import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Find bryan user by name (case-insensitive search)
  const bryan = await db.user.findFirst({
    where: { name: { contains: 'bryan', mode: 'insensitive' } },
  })

  if (!bryan) {
    console.error('Could not find a user named "bryan". Please create the account first.')
    process.exit(1)
  }

  console.log(`Found user: ${bryan.name} (${bryan.email})`)

  // Check if Cookie Club already exists
  const existing = await db.group.findFirst({
    where: { name: 'Cookie Club' },
  })

  if (existing) {
    console.log('Cookie Club already exists, skipping seed.')
    return
  }

  // Create Cookie Club with bryan as owner
  const group = await db.$transaction(async (tx) => {
    const newGroup = await tx.group.create({
      data: {
        name: 'Cookie Club',
        description: 'The one and only group for earning Grubs',
        inviteCode: 'COOKIE01',
        ownerId: bryan.id,
      },
    })

    await tx.groupMember.create({
      data: {
        groupId: newGroup.id,
        userId: bryan.id,
        role: 'owner',
      },
    })

    return newGroup
  })

  console.log(`Created "Cookie Club" (id: ${group.id}) with ${bryan.name} as owner`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
