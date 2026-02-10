import { db } from './db'
import { Decimal } from '@prisma/client/runtime/library'

type TransactionType = 'event_earning' | 'stock_buy' | 'stock_sell' | 'transfer' | 'adjustment'

interface WalletOperationParams {
  userId: string
  amount: number // positive for credit, negative for debit
  type: TransactionType
  referenceType?: string
  referenceId?: string
  description?: string
}

// Credit (add money) to a user's wallet
export async function creditWallet(params: {
  userId: string
  amount: number
  type: TransactionType
  referenceType?: string
  referenceId?: string
  description?: string
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { userId, amount, type, referenceType, referenceId, description } = params

  if (amount <= 0) {
    return { success: false, newBalance: 0, error: 'Amount must be positive' }
  }

  try {
    // Use a transaction to ensure both updates happen together
    const result = await db.$transaction(async (tx) => {
      // Get current balance with a lock to prevent race conditions
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      })

      if (!user) {
        throw new Error('User not found')
      }

      const currentBalance = Number(user.walletBalance)
      const newBalance = currentBalance + amount

      // Update the user's balance
      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      })

      // Record the transaction
      await tx.transaction.create({
        data: {
          userId,
          type,
          amount: new Decimal(amount),
          balanceAfter: new Decimal(newBalance),
          referenceType,
          referenceId,
          description,
        },
      })

      return newBalance
    })

    return { success: true, newBalance: result }
  } catch (error) {
    console.error('Credit wallet error:', error)
    return {
      success: false,
      newBalance: 0,
      error: error instanceof Error ? error.message : 'Failed to credit wallet',
    }
  }
}

// Debit (remove money) from a user's wallet
export async function debitWallet(params: {
  userId: string
  amount: number
  type: TransactionType
  referenceType?: string
  referenceId?: string
  description?: string
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { userId, amount, type, referenceType, referenceId, description } = params

  if (amount <= 0) {
    return { success: false, newBalance: 0, error: 'Amount must be positive' }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Get current balance
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      })

      if (!user) {
        throw new Error('User not found')
      }

      const currentBalance = Number(user.walletBalance)

      // Check if user has enough balance
      if (currentBalance < amount) {
        throw new Error('Insufficient balance')
      }

      const newBalance = currentBalance - amount

      // Update the user's balance
      await tx.user.update({
        where: { id: userId },
        data: { walletBalance: newBalance },
      })

      // Record the transaction (negative amount for debit)
      await tx.transaction.create({
        data: {
          userId,
          type,
          amount: new Decimal(-amount),
          balanceAfter: new Decimal(newBalance),
          referenceType,
          referenceId,
          description,
        },
      })

      return newBalance
    })

    return { success: true, newBalance: result }
  } catch (error) {
    console.error('Debit wallet error:', error)
    return {
      success: false,
      newBalance: 0,
      error: error instanceof Error ? error.message : 'Failed to debit wallet',
    }
  }
}

// Get user's current balance (buying power)
export async function getBuyingPower(userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  })

  if (!user) {
    throw new Error('User not found')
  }

  return Number(user.walletBalance)
}
