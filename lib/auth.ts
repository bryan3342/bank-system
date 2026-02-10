import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from './db'

// Get the current logged-in user from the session
export async function getCurrentUser() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return null
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      walletBalance: true,
      createdAt: true,
    },
  })

  return user
}

// Get current user or throw an error (for protected routes)
export async function requireUser() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  return user
}
