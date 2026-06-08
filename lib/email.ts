import { Resend } from 'resend'

// Sender identity for all transactional + marketing email. Override with the
// EMAIL_FROM env var (e.g. "Dream Create <hello@dreamcreatestudio.com>") once
// that domain is verified with the active provider — lets us pivot the From
// address by changing one env var, with no code deploy. Must always be a domain
// the current provider (Resend/SES) has verified, or sends are rejected.
const FROM = process.env.EMAIL_FROM?.trim() || 'Dream Create <Hello@DreamCreateWeb.com>'

function emailDriver(): 'ses' | 'resend' {
  return process.env.EMAIL_DRIVER === 'ses' ? 'ses' : 'resend'
}

// Single delivery path for all transactional email. Defaults to Resend;
// set EMAIL_DRIVER=ses to route through Amazon SES (lazy-imported so the
// AWS SDK never loads on the Resend path).
async function deliver(msg: { to: string; subject: string; html: string; replyTo?: string | null }): Promise<void> {
  // Config errors (missing key) throw raw — they're an ops problem, not a
  // delivery failure. Only actual SEND failures get the friendly remap so the
  // raw provider error (e.g. SES's verbose "identities failed the check in
  // region us-east-1") never leaks to staff.
  const replyTo = msg.replyTo?.trim() || undefined
  if (emailDriver() === 'ses') {
    const { sendEmailViaSes } = await import('./ses')
    try {
      await sendEmailViaSes({ from: FROM, to: msg.to, subject: msg.subject, html: msg.html, replyTo })
    } catch (err) {
      console.warn('[email] SES delivery failed:', err instanceof Error ? `${err.name}: ${err.message}` : err)
      throw new Error(friendlyEmailError(err))
    }
    return
  }
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  try {
    // Resend's SDK does NOT throw on API errors (invalid key, unverified
    // domain, rejected recipient) — it RETURNS `{ data, error }`. If we don't
    // inspect `error`, a failed send is silently reported as success: the app
    // shows "sent" while nothing is ever delivered. So check it and throw.
    const res = await new Resend(key).emails.send({
      from: FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(replyTo ? { replyTo } : {}),
    })
    if (res?.error) throw res.error
  } catch (err) {
    console.warn('[email] Resend delivery failed:', err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err))
    throw new Error(friendlyEmailError(err))
  }
}

/** Map a raw provider send error to a clean, honest user-facing message.
 *  Handles both thrown Errors (SES) and Resend's returned `{ name, message }`
 *  error object. */
function friendlyEmailError(err: unknown): string {
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : err && typeof err === 'object'
        ? `${(err as { name?: string }).name ?? ''} ${(err as { message?: string }).message ?? ''}`
        : String(err)
  // SES sandbox: outbound to non-verified recipients is held until AWS grants
  // production access. This is the most common failure in pre-prod.
  if (/not verified|MessageRejected|sandbox|verification/i.test(raw)) {
    return "We couldn’t email this address yet — outbound email is in test mode for unverified recipients until sending is approved."
  }
  return 'The email couldn’t be sent right now. Please try again.'
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await deliver({
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
  const roleLabel = data.role.charAt(0).toUpperCase() + data.role.slice(1)
  await deliver({
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

/**
 * Patient-portal invite — staff-initiated. Patient-toned (not the team-invite
 * copy), and goes through `deliver()` so it honours EMAIL_DRIVER (SES).
 */
export async function sendPatientPortalInviteEmail(
  to: string,
  data: { clinicName: string; patientFirstName: string; inviteUrl: string },
) {
  await deliver({
    to,
    subject: `${data.clinicName} — set up your patient portal`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1a17">
        <h2 style="margin:0 0 16px;font-size:20px">Hi ${escapeHtml(data.patientFirstName)},</h2>
        <p style="margin:0 0 20px;line-height:1.55">
          ${escapeHtml(data.clinicName)} invited you to set up your patient portal —
          where you can see upcoming appointments, book a visit, message the office,
          and fill out forms ahead of time.
        </p>
        <a href="${data.inviteUrl}" style="display:inline-block;padding:12px 24px;background:#1c1a17;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Set up my portal
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#6b635a;line-height:1.55">
          If you weren't expecting this, you can safely ignore this email.
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
  await deliver({
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
  await deliver({
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
  await deliver({
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
  await deliver({
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
  const link = input.linkPath ? `${APP_URL}${input.linkPath}` : null
  const greeting = input.name ? `Hi ${input.name.split(' ')[0]},` : 'Hi,'
  await deliver({
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

export interface PatientMessageEmailData {
  to: string
  /** Patient first name for the greeting; null falls back to a generic "Hi,". */
  patientFirstName: string | null
  /** Clinic display name — signs the message + names the sender in the subject. */
  clinicName: string
  /** The staff member's typed message body (plain text, rendered pre-wrap). */
  body: string
  /** Clinic inbox the patient's reply should reach (clinic_profile.email). When
   *  set, replies go to the clinic instead of the unattended platform From. */
  replyTo?: string | null
}

/**
 * Deliver a clinic→patient message (the "email" channel of the Patient
 * Communications inbox) to the patient's real inbox. Distinct from
 * sendNotificationEmail, which is a STAFF-facing internal notice (it links to
 * the CRM + cites "your notification preferences" — neither applies to a
 * patient). Reply-To points at the clinic so the patient can just hit reply.
 */
export async function sendPatientMessageEmail(data: PatientMessageEmailData) {
  const greeting = data.patientFirstName ? `Hi ${escapeHtml(data.patientFirstName)},` : 'Hi,'
  await deliver({
    to: data.to,
    replyTo: data.replyTo,
    subject: `A message from ${data.clinicName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1c1917">
        <p style="margin:0 0 16px;color:#57534e">${greeting}</p>
        <p style="margin:0 0 20px;color:#1c1917;line-height:1.6;white-space:pre-wrap">${escapeHtml(data.body)}</p>
        <p style="margin:0;color:#1c1917">— ${escapeHtml(data.clinicName)}</p>
        ${data.replyTo ? `<p style="margin:20px 0 0;font-size:12px;color:#a8a29e">You can reply directly to this email to reach us.</p>` : ''}
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
