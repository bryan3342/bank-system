import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/groups/requests/[token]/deny — Deny a join request (from email link)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const joinRequest = await db.joinRequest.findUnique({
      where: { token },
      include: {
        group: { select: { name: true } },
        user: { select: { name: true } },
      },
    })

    if (!joinRequest) {
      return new NextResponse(htmlPage('Request Not Found', 'This link is invalid or has expired.'), {
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

    await db.joinRequest.update({
      where: { id: joinRequest.id },
      data: { status: 'denied' },
    })

    return new NextResponse(
      htmlPage('Denied', `${joinRequest.user.name}'s request to join ${joinRequest.group.name} has been denied.`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (error) {
    console.error('Deny request error:', error)
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
h1{color:#ef4444;margin-bottom:8px}p{color:#9ca3af;line-height:1.6}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}
