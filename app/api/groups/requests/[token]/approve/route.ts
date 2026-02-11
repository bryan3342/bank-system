import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/groups/requests/[token]/approve — Approve a join request (from email link)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const joinRequest = await db.joinRequest.findUnique({
      where: { token },
      include: {
        group: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    })

    if (!joinRequest) {
      return new NextResponse(htmlPage('Request Not Found', 'This approval link is invalid or has expired.'), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    if (joinRequest.status !== 'pending') {
      return new NextResponse(
        htmlPage('Already Handled', `This request was already ${joinRequest.status}.`),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Approve: update request status and add user to group
    await db.$transaction(async (tx) => {
      await tx.joinRequest.update({
        where: { id: joinRequest.id },
        data: { status: 'approved' },
      })

      await tx.groupMember.create({
        data: {
          groupId: joinRequest.groupId,
          userId: joinRequest.userId,
          role: 'member',
        },
      })
    })

    return new NextResponse(
      htmlPage('Approved!', `${joinRequest.user.name} has been added to ${joinRequest.group.name}.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (error) {
    console.error('Approve request error:', error)
    return new NextResponse(htmlPage('Error', 'Something went wrong. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

function htmlPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Gooner Bank</title>
<style>body{font-family:sans-serif;background:#0a0a0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1a1a2e;padding:40px;border-radius:16px;text-align:center;max-width:400px}
h1{color:#4ade80;margin-bottom:8px}p{color:#9ca3af;line-height:1.6}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}
