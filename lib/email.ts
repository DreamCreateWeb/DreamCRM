import { Resend } from 'resend'
import type { ClinicSender } from './email-identity'
import type { EmailSlots } from './types/email-automations'

// Sender identity for all transactional + marketing email. Override with the
// EMAIL_FROM env var (e.g. "Dream Create <hello@dreamcreatestudio.com>") once
// that domain is verified with the active provider — lets us pivot the From
// address by changing one env var, with no code deploy. Must always be a domain
// the current provider (Resend/SES) has verified, or sends are rejected.
const FROM = process.env.EMAIL_FROM?.trim() || 'Dream Create <Hello@DreamCreateWeb.com>'

function emailDriver(): 'ses' | 'resend' {
  return process.env.EMAIL_DRIVER === 'ses' ? 'ses' : 'resend'
}

/** Plain-text fallback for the Gmail multipart/alternative text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A bulletproof, Outlook-safe auth email (invite / magic-link / password reset).
 *
 * Old Outlook (desktop) renders with Word's engine: it ignores `max-width`,
 * `border-radius`, and the `inline-block` padding on an `<a>` — so a styled
 * link-button collapses to broken, often UN-CLICKABLE text and the whole layout
 * loses formatting (exactly what the first real clinic saw). This shell uses:
 *   - a FIXED-width `<table>` container (Outlook honors table widths, not
 *     `max-width` on a div),
 *   - a VML "roundrect" button for Outlook + a normal `<a>` for every other
 *     client, so the call-to-action is a real clickable button everywhere, and
 *   - a VISIBLE, copy-pasteable plain-text URL fallback — the link is always
 *     reachable even if the button doesn't render (the manual copy-paste is
 *     literally what rescued the first onboarding).
 * Inline styles only; user content is escaped.
 */
export function authEmailShell(opts: {
  heading: string
  introHtml: string
  buttonUrl: string
  buttonLabel: string
  accent?: string | null
  footnoteHtml?: string
}): string {
  const bg = opts.accent && /^#[0-9a-fA-F]{6}$/.test(opts.accent) ? opts.accent : '#1c1a17'
  const url = opts.buttonUrl
  const label = escapeHtml(opts.buttonLabel)
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
<tr><td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#1c1a17;">
<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#111111;">${escapeHtml(opts.heading)}</h1>
<div style="margin:0 0 26px;font-size:15px;line-height:1.55;color:#444444;">${opts.introHtml}</div>
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="13%" stroke="f" fillcolor="${bg}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${url}" style="background:${bg};border-radius:8px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:46px;height:46px;text-align:center;text-decoration:none;width:260px;">${label}</a>
<!--<![endif]-->
<p style="margin:26px 0 0;font-size:13px;line-height:1.5;color:#666666;">
Button not working? Copy and paste this link into your browser:<br>
<a href="${url}" style="color:#2A7F8C;word-break:break-all;">${escapeHtml(url)}</a>
</p>
${opts.footnoteHtml ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#999999;">${opts.footnoteHtml}</p>` : ''}
</td></tr>
</table>
<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#aaaaaa;">Dream Create</p>
</td></tr>
</table>
</body>
</html>`
}

// Single delivery path for all transactional email. Defaults to Resend;
// set EMAIL_DRIVER=ses to route through Amazon SES (lazy-imported so the
// AWS SDK never loads on the Resend path). `from` overrides the default
// platform identity (used to send patient-facing mail as the clinic).
// Exported so service modules with bespoke templates (e.g. the review-request
// email) route through the SAME provider/driver/Gmail-fallback path instead of
// instantiating their own Resend client with a stale hardcoded From.
export async function deliver(msg: {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string | null
  /** Tier 2: send via the clinic's connected Gmail account AS their real
   *  address. On any Gmail failure we fall back to the platform sender below. */
  gmail?: { accountId: string; from: string }
}): Promise<void> {
  // Config errors (missing key) throw raw — they're an ops problem, not a
  // delivery failure. Only actual SEND failures get the friendly remap so the
  // raw provider error (e.g. SES's verbose "identities failed the check in
  // region us-east-1") never leaks to staff.
  const from = msg.from?.trim() || FROM
  const replyTo = msg.replyTo?.trim() || undefined

  // Tier 2 — send AS the clinic's own Google mailbox via the Gmail API. If the
  // connection is broken (token revoked, etc.) we DON'T fail the send: fall
  // through to the platform sender so the patient still gets the email.
  if (msg.gmail) {
    try {
      const { getAccessToken, sendMessage } = await import('./services/gmail')
      const token = await getAccessToken(msg.gmail.accountId)
      await sendMessage(token, {
        from: msg.gmail.from,
        to: [msg.to],
        subject: msg.subject,
        bodyText: htmlToText(msg.html),
        bodyHtml: msg.html,
      })
      return
    } catch (err) {
      console.warn(
        '[email] Gmail send failed; falling back to platform sender:',
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      )
      // fall through to Resend/SES with the platform `from` + `replyTo`
    }
  }
  if (emailDriver() === 'ses') {
    const { sendEmailViaSes } = await import('./ses')
    try {
      await sendEmailViaSes({ from, to: msg.to, subject: msg.subject, html: msg.html, replyTo })
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
      from,
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
    html: authEmailShell({
      heading: 'Reset your password',
      introHtml:
        'You asked to reset the password on your DreamCRM account. Click below to pick a new one. This link works for 1 hour.',
      buttonUrl: resetUrl,
      buttonLabel: 'Reset password',
      footnoteHtml:
        "Didn't ask for this? You can ignore this email — your password stays the same until you click the link above.",
    }),
  })
}

/**
 * Magic-link sign-in email. When a `sender` (clinic identity) is supplied, the
 * email wears the CLINIC's brand — it comes FROM the clinic (Tier 1/Tier 2 via
 * `deliver()`), the subject names the clinic, and the body greets in the warm
 * clinic-portal voice. Patients live in their clinic's brand, not "Dream Create"
 * dental software. Falls back to the platform-branded copy when no clinic match
 * exists (e.g. a staff member signing into the dashboard).
 */
export async function sendMagicLinkEmail(to: string, url: string, sender?: ClinicSender) {
  if (sender) {
    await deliver({
      to,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: `Sign in to ${sender.name}`,
      html: authEmailShell({
        heading: 'Your sign-in link',
        introHtml: `Click below to sign in to your ${escapeHtml(sender.name)} patient portal — no password needed. It works once and expires in 15 minutes.`,
        buttonUrl: url,
        buttonLabel: 'Sign me in',
        footnoteHtml: "If you didn't ask for this, you can safely ignore it — nobody can sign in without this exact link.",
      }),
    })
    return
  }
  await deliver({
    to,
    subject: 'Your sign-in link',
    html: authEmailShell({
      heading: 'Sign in with one tap',
      introHtml:
        "Here's the sign-in link you asked for — no password needed. It works once and expires in 15 minutes.",
      buttonUrl: url,
      buttonLabel: 'Sign me in',
      footnoteHtml: "If you didn't ask for this, you can safely ignore it — nobody can sign in without this exact link.",
    }),
  })
}

/**
 * Confirm an email-change request. Sent to the user's CURRENT (old) address so
 * the person who controls the existing mailbox has to approve repointing the
 * sign-in identity — the security gate against account takeover via a borrowed
 * session. Names the requested new address so an unexpected request is obvious
 * (and ignorable — nothing changes until the link is clicked).
 */
export async function sendChangeEmailVerification(toOldEmail: string, newEmail: string, confirmUrl: string) {
  await deliver({
    to: toOldEmail,
    subject: 'Confirm your new DreamCRM email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Confirm your email change</h2>
        <p style="margin:0 0 16px;color:#444;line-height:1.5">
          Someone asked to change the email on your DreamCRM account to
          <strong>${escapeHtml(newEmail)}</strong>. To keep your account safe,
          confirm the change from your current email address.
        </p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Confirm email change
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          Didn't ask for this? You can ignore this email — your sign-in
          email stays the same until you click the button above.
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
  const org = escapeHtml(data.orgName)
  const inviter = escapeHtml(data.inviterName)
  await deliver({
    to,
    subject: `${data.inviterName} invited you to join ${data.orgName} on DreamCRM`,
    html: authEmailShell({
      heading: `You're invited to join ${data.orgName}`,
      introHtml: `<strong>${inviter}</strong> invited you to join <strong>${org}</strong> on DreamCRM as a <strong>${escapeHtml(roleLabel)}</strong>. Click below to set up your account.`,
      buttonUrl: data.inviteUrl,
      buttonLabel: 'Accept invitation',
      footnoteHtml: `Weren't expecting this? You can ignore this email.`,
    }),
  })
}

/**
 * Patient-portal invite — staff-initiated. Patient-toned (not the team-invite
 * copy), and goes through `deliver()` so it honours EMAIL_DRIVER (SES).
 */
export async function sendPatientPortalInviteEmail(
  to: string,
  data: { clinicName: string; patientFirstName: string; inviteUrl: string },
  sender?: ClinicSender,
  content?: Partial<EmailSlots>,
) {
  const subject = content?.subject ?? `${data.clinicName} — set up your patient portal`
  const headingHtml = content?.heading != null ? slotToHtml(content.heading) : `Hi ${escapeHtml(data.patientFirstName)},`
  const bodyHtml =
    content?.body != null
      ? slotToHtml(content.body)
      : `${escapeHtml(data.clinicName)} set up a patient portal for you —
          where you can see your upcoming appointments, book a visit, message the office,
          and fill out forms ahead of time.`
  const closingHtml =
    content?.closing != null
      ? slotToHtml(content.closing)
      : "Weren't expecting this? You can ignore this email."
  // Outlook-safe shell (VML button + copy-paste URL fallback) — the invite
  // link is the patient's ONLY way in, so it must survive Outlook desktop.
  await deliver({
    to,
    from: sender?.from,
    replyTo: sender?.replyTo,
    gmail: sender?.gmail,
    subject,
    html: authEmailShell({
      heading: headingHtml.replace(/<[^>]+>/g, ''),
      introHtml: bodyHtml,
      buttonUrl: data.inviteUrl,
      buttonLabel: 'Set up my portal',
      footnoteHtml: closingHtml,
    }),
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
        <h2 style="margin:0 0 8px;font-size:20px;color:#111">New appointment request</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#888">From ${data.clinicName}'s website</p>
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
  /** Clinic IANA timezone so the appointment time renders at the clinic's
   *  wall-clock (the server runs in UTC). */
  timeZone?: string
}

export async function sendBookingConfirmationEmail(to: string, data: BookingConfirmationData, sender?: ClinicSender, content?: Partial<EmailSlots>) {
  const typeLabel = data.appointmentType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
  const timeStr = data.startTime.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(data.timeZone ? { timeZone: data.timeZone } : {}),
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
  const subject = content?.subject ?? `Appointment confirmed at ${data.clinicName}`
  const headingHtml = content?.heading != null ? slotToHtml(content.heading) : 'Your appointment is set'
  const bodyHtml =
    content?.body != null
      ? slotToHtml(content.body)
      : `Hi ${data.patientName}, your <strong>${typeLabel}</strong> visit at
          <strong>${data.clinicName}</strong> is booked.`
  const closingHtml =
    content?.closing != null
      ? slotToHtml(content.closing)
      : "We'll be in touch to confirm. Need to change your time? Just give us a call."
  await deliver({
    to,
    from: sender?.from,
    replyTo: sender?.replyTo,
    gmail: sender?.gmail,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">${headingHtml}</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">${bodyHtml}</p>
        <div style="padding:16px 20px;background:#f9fafb;border-radius:8px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${timeStr}</p>
          <p style="margin:0;font-size:14px;color:#555">${data.clinicName}${data.clinicPhone ? ` · ${data.clinicPhone}` : ''}</p>
        </div>
        ${intakeBlock}
        <p style="margin:0;font-size:13px;color:#888">${closingHtml}</p>
      </div>
    `,
  })
}

export interface CancellationConfirmationData {
  patientName: string
  clinicName: string
  clinicPhone: string | null
  startTime: Date
  appointmentType: string
  /** When the clinic's plan supports online booking, the absolute URL to the
   *  public /book page so the patient can grab a new time in one tap. Null on
   *  basic tier (no online booking) — we fall back to "call us" copy instead. */
  rebookUrl?: string | null
  /** Clinic IANA timezone so the cancelled time renders at the clinic's
   *  wall-clock (the server runs in UTC). */
  timeZone?: string
}

/**
 * Patient-facing confirmation that their appointment was cancelled. Sent
 * best-effort from `cancelAppointment` (covers the portal self-cancel path too).
 * Warm, anti-shame voice — cancelling a dental visit is loaded, so we never
 * guilt-trip; we just confirm + leave the door open to rebook. Deliberately
 * NOT sent on no-show (a no-show isn't a patient-initiated cancel, and a
 * "we cancelled your visit" note would read wrong).
 */
export async function sendCancellationConfirmation(
  to: string,
  data: CancellationConfirmationData,
  sender?: ClinicSender,
  content?: Partial<EmailSlots>,
) {
  const typeLabel = data.appointmentType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  const timeStr = data.startTime.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(data.timeZone ? { timeZone: data.timeZone } : {}),
  })
  const rebookBlock = data.rebookUrl
    ? `
        <a href="${data.rebookUrl}" style="display:inline-block;padding:12px 24px;background:#1c1a17;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Find a new time
        </a>
        <p style="margin:16px 0 0;font-size:13px;color:#6b635a;line-height:1.55">
          Whenever you're ready — no rush${data.clinicPhone ? `, or just call us at ${escapeHtml(data.clinicPhone)}` : ''}.
        </p>`
    : `
        <p style="margin:0;font-size:13px;color:#6b635a;line-height:1.55">
          Whenever you're ready to rebook, just ${data.clinicPhone ? `give us a call at ${escapeHtml(data.clinicPhone)}` : 'reach out'} — we'd love to see you.
        </p>`
  const subject = content?.subject ?? `Your appointment at ${data.clinicName} was cancelled`
  const headingHtml = content?.heading != null ? slotToHtml(content.heading) : 'Appointment cancelled'
  const bodyHtml =
    content?.body != null
      ? slotToHtml(content.body)
      : `Hi ${escapeHtml(data.patientName)}, this confirms your <strong>${escapeHtml(typeLabel)}</strong>
          at <strong>${escapeHtml(data.clinicName)}</strong> has been cancelled. No problem at all —
          life happens.`
  await deliver({
    to,
    from: sender?.from,
    replyTo: sender?.replyTo,
    gmail: sender?.gmail,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1a17">
        <h2 style="margin:0 0 16px;font-size:20px">${headingHtml}</h2>
        <p style="margin:0 0 20px;line-height:1.55">${bodyHtml}</p>
        <div style="padding:16px 20px;background:#f7f4ef;border-radius:8px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#6b635a;text-decoration:line-through">${timeStr}</p>
          <p style="margin:0;font-size:13px;color:#857c70">${escapeHtml(data.clinicName)}${data.clinicPhone ? ` · ${escapeHtml(data.clinicPhone)}` : ''}</p>
        </div>
        ${rebookBlock}
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
export async function sendIntakeRequestEmail(to: string, data: IntakeRequestEmailData, sender?: ClinicSender, content?: Partial<EmailSlots>) {
  const subject = content?.subject ?? `${data.clinicName} — quick intake form before your visit`
  const headingHtml = content?.heading != null ? slotToHtml(content.heading) : `Hi ${escapeHtml(data.patientFirstName)},`
  const bodyHtml =
    content?.body != null
      ? slotToHtml(content.body)
      : `Before your visit at ${escapeHtml(data.clinicName)}, please take a few minutes
          to fill out our intake form. It saves time at the front desk and helps us
          take better care of you.`
  const closingHtml =
    content?.closing != null
      ? slotToHtml(content.closing)
      : 'Have questions? Just reply to this email — it goes straight to our front desk.'
  await deliver({
    to,
    from: sender?.from,
    replyTo: sender?.replyTo,
    gmail: sender?.gmail,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1a17">
        <h2 style="margin:0 0 16px;font-size:20px">${headingHtml}</h2>
        <p style="margin:0 0 16px;line-height:1.55">${bodyHtml}</p>
        <a href="${data.intakeFormUrl}" style="display:inline-block;padding:12px 24px;background:#1c1a17;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Fill out intake form
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#6b635a;line-height:1.55">${closingHtml}</p>
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
          Welcome to DreamCRM! Click below to confirm your email address.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Verify email
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          Didn't create a DreamCRM account? You can ignore this email.
        </p>
      </div>
    `,
  })
}

/** Escalating trial-ending email, keyed by the same milestones the cron uses. */
export type TrialEmailMilestone = 'd3' | 'd1' | 'ended'

const TRIAL_EMAIL: Record<TrialEmailMilestone, { subject: string; heading: string; intro: string; accent: string }> = {
  d3: {
    subject: '3 days left in your DreamCRM free trial',
    heading: '3 days left in your free trial',
    intro:
      'Your free trial wraps up in a few days. Add a payment method and choose a plan to keep full access to your website, patients, and bookings — it locks in your price and takes about a minute.',
    accent: '#f59e0b',
  },
  d1: {
    subject: "Last day — your DreamCRM free trial ends tomorrow",
    heading: 'Your free trial ends tomorrow',
    intro:
      "This is the last day of your free trial. Add a card and choose a plan now so your website and patient tools keep running without a break — everything you've set up is ready and waiting.",
    accent: '#ea580c',
  },
  ended: {
    subject: 'Your DreamCRM free trial has ended',
    heading: 'Your free trial has ended',
    intro:
      "Your workspace is paused, but nothing is lost — your website, patients, and settings are all safe. Add a payment method and choose a plan to switch everything back on.",
    accent: '#e11d48',
  },
}

/** Trial-ending nudge to a clinic owner. Platform-identity send (Dream Create),
 *  NOT the clinic's patient-facing sender — this is billing comms TO the clinic. */
export async function sendTrialReminderEmail(
  to: string,
  data: { firstName: string | null; milestone: TrialEmailMilestone; billingUrl: string },
) {
  const t = TRIAL_EMAIL[data.milestone]
  const hi = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hi,'
  await deliver({
    to,
    subject: t.subject,
    html: authEmailShell({
      heading: t.heading,
      introHtml: `${hi}<br><br>${t.intro}`,
      buttonUrl: data.billingUrl,
      buttonLabel: 'Add payment & choose a plan',
      accent: t.accent,
      footnoteHtml: 'You’re receiving this because your clinic is on a DreamCRM free trial.',
    }),
  })
}

/**
 * Welcome email the moment a clinic's no-card trial starts (from onboarding).
 * Platform-identity send. Doubles as an early deliverability check — before
 * this, the FIRST email an owner ever got was the day-3 trial reminder, so a
 * typo'd signup address went unnoticed until reminders and password resets
 * were already going nowhere.
 */
export async function sendTrialWelcomeEmail(
  to: string,
  data: { firstName: string | null; clinicName: string; dashboardUrl: string },
) {
  const hi = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hi,'
  await deliver({
    to,
    subject: `Welcome to DreamCRM — ${data.clinicName} is live`,
    html: authEmailShell({
      heading: 'Your free trial is live',
      introHtml: `${hi}<br><br>Welcome! <strong>${escapeHtml(
        data.clinicName,
      )}</strong> is set up with full access for 7 days — website, bookings, patients, messaging, the lot. No card needed. Build your website, invite your team, and see how it fits your front desk.`,
      buttonUrl: data.dashboardUrl,
      buttonLabel: 'Open your dashboard',
      accent: '#28B3AD',
      footnoteHtml:
        'You’re receiving this because you started a DreamCRM free trial. Not you? You can ignore this email.',
    }),
  })
}

/** Dunning email to a clinic owner when a subscription payment fails. */
export async function sendBillingPastDueEmail(
  to: string,
  data: { firstName: string | null; amountLabel: string; billingUrl: string },
) {
  const hi = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hi,'
  await deliver({
    to,
    subject: "Your DreamCRM payment didn't go through",
    html: authEmailShell({
      heading: "Your payment didn't go through",
      introHtml: `${hi}<br><br>We couldn't process ${escapeHtml(
        data.amountLabel,
      )} for your DreamCRM subscription. Update your card and we'll try again right away, so nothing stops working.`,
      buttonUrl: data.billingUrl,
      buttonLabel: 'Update payment method',
      accent: '#e11d48',
      footnoteHtml: "Already updated your card? You can ignore this — Stripe tries again automatically.",
    }),
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
  /**
   * Custom text for the action button (e.g. "View Sarah’s record →"). Lets a
   * staff notification spell out exactly what tapping the button does, instead
   * of the generic default. Falls back to "Open in DreamCRM" when absent.
   */
  linkLabel?: string | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dreamcreatestudio.com'

export async function sendNotificationEmail(input: NotificationEmailInput, sender?: ClinicSender) {
  const greeting = input.name ? `Hi ${input.name.split(' ')[0]},` : 'Hi,'

  // Clinic sender supplied → this is a PATIENT-facing message (e.g. an
  // appointment reminder). Drop the staff chrome (the "Open in DreamCRM" button
  // + "manage your notification preferences" footer don't belong in a patient's
  // inbox) and send from the clinic with a clean, signed body.
  if (sender) {
    await deliver({
      to: input.to,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: input.title,
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1917">
        <p style="margin:0 0 12px;color:#57534e">${greeting}</p>
        ${input.body ? `<p style="margin:0 0 16px;color:#1c1917;line-height:1.55;white-space:pre-wrap">${escapeHtml(input.body)}</p>` : ''}
        <p style="margin:24px 0 0;color:#1c1917">— ${escapeHtml(sender.name)}</p>
      </div>
    `,
    })
    return
  }

  // Staff-facing internal notification (default platform identity + chrome).
  const link = input.linkPath ? `${APP_URL}${input.linkPath}` : null
  const linkLabel = input.linkLabel?.trim() || 'Open in DreamCRM'
  await deliver({
    to: input.to,
    subject: input.title,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1917">
        <p style="margin:0 0 12px;color:#57534e">${greeting}</p>
        <h2 style="margin:0 0 12px;font-size:18px;color:#0c0a09">${escapeHtml(input.title)}</h2>
        ${input.body ? `<p style="margin:0 0 16px;color:#1c1917;line-height:1.55;white-space:pre-wrap">${escapeHtml(input.body)}</p>` : ''}
        ${link ? `<a href="${link}" style="display:inline-block;padding:10px 20px;background:#0c0a09;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">${escapeHtml(linkLabel)}</a>` : ''}
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
  /** Per-clinic From header so the message comes FROM the clinic, not the
   *  platform. Falls back to the default platform identity when absent. */
  from?: string
  /** Tier 2: send via the clinic's connected Gmail account. */
  gmail?: { accountId: string; from: string }
  /** Image attachments — rendered inline (hosted on S3) under the body. */
  attachments?: Array<{ url: string; name: string; contentType: string }>
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
  // Inline image attachments (hosted on the public S3 bucket). Only render the
  // ones that are actually images + have an http(s) URL — defensive against a
  // malformed meta blob.
  const images = (data.attachments ?? []).filter(
    (a) => a.contentType.startsWith('image/') && /^https?:\/\//i.test(a.url),
  )
  const attachmentsHtml = images.length
    ? `<div style="margin:0 0 20px">${images
        .map(
          (a) =>
            `<a href="${escapeHtml(a.url)}" style="display:block;margin:0 0 8px"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name || 'attachment')}" style="max-width:100%;border-radius:8px;border:1px solid #e7e5e4" /></a>`,
        )
        .join('')}</div>`
    : ''
  // A photo-only message has no body — skip the empty paragraph then.
  const bodyHtml = data.body.trim()
    ? `<p style="margin:0 0 20px;color:#1c1917;line-height:1.6;white-space:pre-wrap">${escapeHtml(data.body)}</p>`
    : ''
  await deliver({
    to: data.to,
    from: data.from,
    replyTo: data.replyTo,
    gmail: data.gmail,
    subject: `A message from ${data.clinicName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1c1917">
        <p style="margin:0 0 16px;color:#57534e">${greeting}</p>
        ${bodyHtml}
        ${attachmentsHtml}
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

/**
 * Turn a clinic-authored email slot (plain text with `{{tokens}}` already
 * substituted by renderAutomatedEmail) into safe inline HTML: escape it, then
 * honour the clinic's line breaks. This is the trust boundary for every
 * clinic-editable email body — the raw text is never injected unescaped.
 */
function slotToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}
