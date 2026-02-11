import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM || 'Gooner Bank <onboarding@resend.dev>'
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

export async function sendJoinRequestEmail({
  ownerEmail,
  ownerName,
  requesterName,
  groupName,
  token,
}: {
  ownerEmail: string
  ownerName: string
  requesterName: string
  groupName: string
  token: string
}) {
  const approveUrl = `${APP_URL}/api/groups/requests/${token}/approve`
  const denyUrl = `${APP_URL}/api/groups/requests/${token}/deny`

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: ownerEmail,
    subject: `${requesterName} wants to join ${groupName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4ade80;">Gooner Bank</h2>
        <p>Hey ${ownerName},</p>
        <p><strong>${requesterName}</strong> wants to join <strong>${groupName}</strong>.</p>
        <div style="margin: 24px 0;">
          <a href="${approveUrl}" style="display: inline-block; padding: 12px 24px; background: #4ade80; color: #000; text-decoration: none; border-radius: 8px; font-weight: bold; margin-right: 12px;">Approve</a>
          <a href="${denyUrl}" style="display: inline-block; padding: 12px 24px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">Deny</a>
        </div>
        <p style="color: #888; font-size: 13px;">If you didn't expect this, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    console.error('Failed to send join request email:', error)
    throw new Error('Failed to send email')
  }
}
