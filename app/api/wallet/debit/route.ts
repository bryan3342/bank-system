import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { debitWallet } from '@/lib/wallet'

const debitSchema = z.object({
  user_id: z.string().uuid(),
  amount: z.number().positive(),
  reference_type: z.string().optional(),
  reference_id: z.string().optional(),
  description: z.string().optional(),
})

// POST /api/wallet/debit - Called by Grub Exchange when a stock is purchased
// Uses server-to-server API key authentication
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.WALLET_API_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const result = debitSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { user_id, amount, reference_type, reference_id, description } = result.data

    const debitResult = await debitWallet({
      userId: user_id,
      amount,
      type: 'stock_buy',
      referenceType: reference_type,
      referenceId: reference_id,
      description,
    })

    if (!debitResult.success) {
      return NextResponse.json(
        { error: debitResult.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      newBalance: debitResult.newBalance,
    })
  } catch (error) {
    console.error('Debit wallet error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
