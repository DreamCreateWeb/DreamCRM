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
  /** When the clinic has a default intake form configured, the absolute
   * URL we want the patient to land on to fill it out. */
  intakeFormUrl?: string | null
}

export async function sendBookingConfirmationEmail(to: string, data: BookingConfirmationData) {
  const resend = getResend()
  const typeLabel = data.appointmentType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
  const timeStr = data.startTime.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  const intakeBlock = data.intakeFormUrl
    ? `
        <div style="margin:0 0 24px;padding:16px 20px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#9a3412">
            One quick step before your visit
          </p>
          <p style="margin:0 0 12px;font-size:13px;color:#7c2d12;line-height:1.55">
            Take 3 minutes to fill out your new patient intake form — saves you
            time at the door.
          </p>
          <a href="${data.intakeFormUrl}" style="display:inline-block;padding:10px 18px;background:#9a3412;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">
            Fill out intake form
          </a>
        </div>`
    : ''
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
        ${intakeBlock}
        <p style="margin:0;font-size:13px;color:#888">
          We'll be in touch to confirm. If you need to reschedule, please call us directly.
        </p>
      </div>
    `,
  })
}

export interface IntakeRequestEmailData {
  patientFirstName: string
  clinicName: string
  intakeFormUrl: string
}

/**
 * Sent when staff hits "Send intake" on a patient detail page. Direct
 * link to the public intake form; the form's submission lands as a
 * `form_submission` row attached to the patient (matched by email).
 */
export async function sendIntakeRequestEmail(to: string, data: IntakeRequestEmailData) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${data.clinicName} — quick intake form before your visit`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1a17">
        <h2 style="margin:0 0 16px;font-size:20px">Hi ${escapeHtml(data.patientFirstName)},</h2>
        <p style="margin:0 0 16px;line-height:1.55">
          Before your visit at ${escapeHtml(data.clinicName)}, please take a few minutes
          to fill out our intake form. It saves time at the front desk and helps us
          take better care of you.
        </p>
        <a href="${data.intakeFormUrl}" style="display:inline-block;padding:12px 24px;background:#1c1a17;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Fill out intake form
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#6b635a;line-height:1.55">
          Have questions? Just reply to this email — it goes straight to our front desk.
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

export interface NotificationEmailInput {
  to: string
  /** Recipient name, used in the greeting if present. */
  name: string | null
  title: string
  body: string
  /** Path on dreamcreatestudio.com to deep-link to (e.g. /inbox?id=123). */
  linkPath?: string | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dreamcreatestudio.com'

export async function sendNotificationEmail(input: NotificationEmailInput) {
  const resend = getResend()
  const link = input.linkPath ? `${APP_URL}${input.linkPath}` : null
  const greeting = input.name ? `Hi ${input.name.split(' ')[0]},` : 'Hi,'
  await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: input.title,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1917">
        <p style="margin:0 0 12px;color:#57534e">${greeting}</p>
        <h2 style="margin:0 0 12px;font-size:18px;color:#0c0a09">${escapeHtml(input.title)}</h2>
        ${input.body ? `<p style="margin:0 0 16px;color:#1c1917;line-height:1.55;white-space:pre-wrap">${escapeHtml(input.body)}</p>` : ''}
        ${link ? `<a href="${link}" style="display:inline-block;padding:10px 20px;background:#0c0a09;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">Open in DreamCRM</a>` : ''}
        <p style="margin:24px 0 0;font-size:11px;color:#a8a29e">
          You're getting this because of your notification preferences. Manage them at
          <a href="${APP_URL}/settings/notifications" style="color:#57534e">settings → notifications</a>.
        </p>
      </div>
    `,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
