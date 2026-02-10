import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { creditWallet } from '@/lib/wallet'

const creditSchema = z.object({
  user_id: z.string().uuid(),
  amount: z.number().positive(),
  reference_type: z.string().optional(),
  reference_id: z.string().optional(),
  description: z.string().optional(),
})

// POST /api/wallet/credit - Called by Grub Exchange when a stock is sold
// Uses server-to-server API key authentication
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.WALLET_API_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const result = creditSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { user_id, amount, reference_type, reference_id, description } = result.data

    const creditResult = await creditWallet({
      userId: user_id,
      amount,
      type: 'stock_sell',
      referenceType: reference_type,
      referenceId: reference_id,
      description,
    })

    if (!creditResult.success) {
      return NextResponse.json(
        { error: creditResult.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      newBalance: creditResult.newBalance,
    })
  } catch (error) {
    console.error('Credit wallet error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
