import { Resend } from 'resend'

const FROM = 'Dream Create <Hello@DreamCreateWeb.com>'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your DreamCRM password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Reset your password</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          You requested a password reset for your DreamCRM account.
          Click the button below to choose a new password.
          This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Reset password
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          If you didn't request this, you can safely ignore this email.
          Your password won't change until you click the link above.
        </p>
      </div>
    `,
  })
}

export interface InvitationEmailData {
  inviterName: string
  orgName: string
  role: string
  inviteUrl: string
}

export async function sendInvitationEmail(to: string, data: InvitationEmailData) {
  const resend = getResend()
  const roleLabel = data.role.charAt(0).toUpperCase() + data.role.slice(1)
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${data.inviterName} invited you to join ${data.orgName} on DreamCRM`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">You're invited to join ${data.orgName}</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          <strong>${data.inviterName}</strong> has invited you to join <strong>${data.orgName}</strong> on DreamCRM as a <strong>${roleLabel}</strong>.
        </p>
        <a href="${data.inviteUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Accept invitation
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          This invitation will expire in 48 hours. If you weren't expecting this, you can safely ignore it.
        </p>
      </div>
    `,
  })
}

export interface ContactRequestData {
  clinicName: string
  patientName: string
  phone: string
  email: string | null
  preferredDate: string | null
  message: string | null
}

export async function sendContactRequestEmail(to: string, data: ContactRequestData) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: `New appointment request from ${data.patientName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111">New Appointment Request</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#888">via ${data.clinicName}'s website</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#555;width:140px">Name</td><td style="padding:8px 0;color:#111;font-weight:600">${data.patientName}</td></tr>
          <tr><td style="padding:8px 0;color:#555">Phone</td><td style="padding:8px 0;color:#111">${data.phone}</td></tr>
          ${data.email ? `<tr><td style="padding:8px 0;color:#555">Email</td><td style="padding:8px 0;color:#111">${data.email}</td></tr>` : ''}
          ${data.preferredDate ? `<tr><td style="padding:8px 0;color:#555">Preferred Date</td><td style="padding:8px 0;color:#111">${data.preferredDate}</td></tr>` : ''}
          ${data.message ? `<tr><td style="padding:8px 0;color:#555;vertical-align:top">Message</td><td style="padding:8px 0;color:#111">${data.message}</td></tr>` : ''}
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          Sent from your DreamCRM clinic website.
        </p>
      </div>
    `,
  })
}

export interface BookingConfirmationData {
  patientName: string
  clinicName: string
  clinicPhone: string | null
  startTime: Date
  appointmentType: string
}

export async function sendBookingConfirmationEmail(to: string, data: BookingConfirmationData) {
  const resend = getResend()
  const typeLabel = data.appointmentType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
  const timeStr = data.startTime.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Appointment confirmed at ${data.clinicName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Appointment Confirmed</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          Hi ${data.patientName}, your <strong>${typeLabel}</strong> appointment at
          <strong>${data.clinicName}</strong> has been scheduled.
        </p>
        <div style="padding:16px 20px;background:#f9fafb;border-radius:8px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${timeStr}</p>
          <p style="margin:0;font-size:14px;color:#555">${data.clinicName}${data.clinicPhone ? ` · ${data.clinicPhone}` : ''}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#888">
          We'll be in touch to confirm. If you need to reschedule, please call us directly.
        </p>
      </div>
    `,
  })
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your DreamCRM email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Verify your email</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          Welcome to DreamCRM! Click the button below to verify your email address.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Verify email
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          If you didn't create a DreamCRM account, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}
