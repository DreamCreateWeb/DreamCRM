import 'server-only'
import { and, eq, gte, inArray, isNotNull, lte, ne, or } from 'drizzle-orm'
import { listShutDownOrgIds } from './billing-state'
import { db, schema } from '@/lib/db'
import { authEmailShell, deliver, sendNotificationEmail } from '@/lib/email'
import { renderAutomatedEmail } from '@/lib/services/email-automations'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { getOrCreateConfirmToken } from '@/lib/services/appointment-confirm'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getAppointmentDetail, logReminderSent, type AppointmentDetail } from '@/lib/services/appointments'
import {
  resolveReminderSettings,
  reminderTouchTemplate,
  reminderSmsBody,
  familyReminderSmsBody,
  FORMS_REMINDER_WINDOW_HOURS,
  REMINDER_MIN_GAP_HOURS,
  type ReminderSettings,
} from '@/lib/types/reminders'
import { toE164 } from '@/lib/phone'
import { visitTypePrepInstructions } from '@/lib/types/visit-types'
import { clinicDayKey } from '@/lib/format-datetime'
import type { ClinicSender } from '@/lib/email-identity'
import { reportAutomationFailure } from '@/lib/services/engine-failures'

// ── Settings CRUD (Settings → Reminders) ─────────────────────────────────────

/** Read the clinic's reminder settings, merged over defaults. Always returns a
 *  complete ReminderSettings regardless of when the row was last written. */
export async function getReminderSettings(organizationId: string): Promise<ReminderSettings> {
  const [row] = await db
    .select({ reminderSettings: schema.clinicProfile.reminderSettings })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveReminderSettings(row?.reminderSettings ?? null)
}

/** Persist reminder settings. Run through the resolver first so junk values
 *  (out-of-range offset, etc.) can't poison the column. */
export async function updateReminderSettings(
  organizationId: string,
  settings: ReminderSettings,
): Promise<ReminderSettings> {
  const cleaned = resolveReminderSettings(settings)
  await db
    .update(schema.clinicProfile)
    .set({ reminderSettings: cleaned, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
  return cleaned
}

/**
 * Automated appointment reminders.
 *
 * The public booking form + booking-confirmation email promise patients an
 * automatic reminder before their visit; until now reminders were 100% manual
 * (the "Send reminder" button in the appointment drawer). This engine closes
 * that gap: a cron (/api/cron/send-reminders) runs it every ~30 min, and for
 * each clinic it emails a reminder for every qualifying upcoming appointment
 * exactly once.
 *
 * Idempotency: an appointment is skipped if it already has an
 * `appointment_reminder_log` row within the last `offsetHours`, so running the
 * job every 30 minutes never double-sends. Automated sends are logged with
 * `sentByUserId: null` (the column already anticipates this).
 */

// ── Shared send helper (reused by the manual drawer action) ──────────────────

/**
 * Compose + send a reminder email for an already-loaded appointment, mirror it
 * to the PMS CommLog, and write the reminder log row. Pure send mechanics — the
 * CALLER owns eligibility (status guards, windowing). Extracted so the manual
 * appointment-drawer action and this automated engine share one send path
 * instead of duplicating the email body + commlog + audit-log writes.
 *
 * `organizationId` scopes the commlog + audit-log writes (AppointmentDetail
 * carries patientId but not orgId; both callers have it in scope).
 * `sentByUserId` is the staff member who clicked send (manual) or `null` for an
 * automated send. Returns `{ ok }` — never throws — so a bad address in a batch
 * doesn't abort the rest.
 */
const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

function escapeReminderHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendReminderEmail(
  organizationId: string,
  detail: AppointmentDetail,
  sender: ClinicSender,
  sentByUserId: string | null,
  opts?: {
    template?: string
    /** Recipient override — a dependent without their own email gets the
     *  reminder at their guardian's address. */
    to?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = opts?.to ?? detail.patient.email
  if (!to) return { ok: false, error: 'Patient has no email on file' }
  try {
    const typeLabel = detail.type.replace(/_/g, ' ')
    const firstName = detail.patient.fullName.split(' ')[0]
    const startStr = detail.startTime.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
    })
    const dateStr = detail.startTime.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: sender.timeZone,
    })
    // Confirmed patients get the gentler "see you soon" variant (no confirm
    // ask); unconfirmed the confirm-cta copy. Both clinic-editable (Settings →
    // Automations → Emails). The reminder's timing/on-off lives in
    // reminder_settings (the cron gates on it); a manual "Send reminder"
    // always sends, so there's no enable check on the unconfirmed variant.
    const confirmed = detail.status === 'confirmed'
    const rendered = await renderAutomatedEmail(
      organizationId,
      confirmed ? 'appointment_reminder_confirmed' : 'appointment_reminder',
      {
        firstName,
        clinicName: sender.name,
        appointmentType: typeLabel,
        appointmentDate: dateStr,
        appointmentTime: startStr,
      },
    )
    if (confirmed && !rendered.enabled) {
      return { ok: false, error: 'Confirmed-visit reminders are disabled for this clinic' }
    }

    // Per-visit-type prep instructions (Settings → Practice → Visit types) —
    // appended as their own paragraph so they survive any copy customization.
    let prep = ''
    try {
      const [profileRow] = await db
        .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, organizationId))
        .limit(1)
      prep = visitTypePrepInstructions(profileRow?.visitTypeSettings ?? null, detail.type)
    } catch {
      /* prep is a nice-to-have — never blocks the reminder */
    }
    const body = prep ? `${rendered.full.body}\n\nBefore your visit: ${prep}` : rendered.full.body

    // Unconfirmed → carry the one-click confirm button (token-is-auth landing
    // at /c/[token]; the same token across every touch of the journey).
    let confirmUrl: string | null = null
    if (!confirmed) {
      try {
        const token = await getOrCreateConfirmToken(organizationId, detail.id)
        if (token) confirmUrl = `${APP_BASE}/c/${token}`
      } catch {
        /* fall back to the plain reminder below */
      }
    }

    if (confirmUrl) {
      await deliver({
        to,
        from: sender.from,
        replyTo: sender.replyTo,
        gmail: sender.gmail,
        subject: rendered.full.subject,
        html: authEmailShell({
          heading: 'Your visit is coming up',
          introHtml: escapeReminderHtml(body).replace(/\n/g, '<br>'),
          buttonUrl: confirmUrl,
          buttonLabel: 'Confirm my visit',
          footnoteHtml:
            'Need a different time? Just reply to this email and we’ll find one together.',
        }),
      })
    } else {
      await sendNotificationEmail(
        {
          to,
          name: detail.patient.fullName,
          title: rendered.full.subject,
          body,
        },
        sender,
      )
    }
    await queueCommLogWriteBack(organizationId, detail.patient.id, {
      note: `Appointment reminder sent for ${startStr}.`,
      mode: 'Email',
    })
    await logReminderSent({
      organizationId,
      appointmentId: detail.id,
      channel: 'email',
      template: opts?.template ?? (sentByUserId ? 'default_reminder' : 'auto_reminder'),
      sentByUserId,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── The SMS channel (Phase 5 limb 3: the reminders channel choice) ──────────

/**
 * Does anyone in this org who carries this number hold a standing opt-out?
 * A STOP is recorded against every patient on the number (the carrier's view
 * is the number, not our chart — lib/services/sms-consent.ts), so the honest
 * check before ANY automated text mirrors that: scan the org's patients and
 * refuse if the number's people said stop. Reminders are transactional, but
 * a person who texted STOP expects silence, not a taxonomy lesson — an
 * explicit revocation outranks the marketing/transactional split, and only
 * a START clears it. Normalised in application code, same as the consent
 * service (the column stores whatever the front desk typed).
 */
async function numberHasStandingOptOut(organizationId: string, e164: string): Promise<boolean> {
  const rows = await db
    .select({
      phone: schema.patient.phone,
      optOutAt: schema.patient.marketingSmsOptOutAt,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
  return rows.some((r) => r.optOutAt != null && toE164(r.phone) === e164)
}

/**
 * Text one visit reminder — the SMS twin of sendReminderEmail, for patients
 * the email path cannot reach (no inbox of their own or a guardian's). Same
 * contract: pure send mechanics, the CALLER owns eligibility; never throws.
 * `expected: true` on a refusal means "a normal state, count it skipped" —
 * an unapproved clinic or a number that said STOP is not a broken engine.
 * deliverSms itself enforces the identity law (approved clinics only, no
 * platform fallback) and counts segments into the monthly ledger.
 */
export async function sendReminderSms(
  organizationId: string,
  detail: AppointmentDetail,
  sender: ClinicSender,
  sentByUserId: string | null,
  opts?: {
    template?: string
    /** E.164 recipient override — a dependent without a phone gets the text
     *  at their guardian's number. */
    to?: string
  },
): Promise<{ ok: true } | { ok: false; error: string; expected?: boolean }> {
  const to = opts?.to ?? toE164(detail.patient.phone)
  if (!to) return { ok: false, error: 'Patient has no textable phone on file', expected: true }
  try {
    if (await numberHasStandingOptOut(organizationId, to)) {
      return {
        ok: false,
        error: 'This number has texted STOP — texts stay off until they text START.',
        expected: true,
      }
    }

    const typeLabel = detail.type.replace(/_/g, ' ')
    const firstName = detail.patient.fullName.split(' ')[0]
    const dayLabel = detail.startTime.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: sender.timeZone,
    })
    const timeLabel = detail.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
    })

    // Unconfirmed → the same one-click confirm token the email journey uses.
    const confirmed = detail.status === 'confirmed'
    let confirmUrl: string | null = null
    if (!confirmed) {
      try {
        const token = await getOrCreateConfirmToken(organizationId, detail.id)
        if (token) confirmUrl = `${APP_BASE}/c/${token}`
      } catch {
        /* the plain reminder still goes */
      }
    }

    // Prep instructions ride along like they do in the email — a phone-only
    // patient must not be the one who eats before a sedation visit.
    let prep = ''
    try {
      const [profileRow] = await db
        .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, organizationId))
        .limit(1)
      prep = visitTypePrepInstructions(profileRow?.visitTypeSettings ?? null, detail.type)
    } catch {
      /* prep is a nice-to-have — never blocks the reminder */
    }

    const body = reminderSmsBody({
      firstName,
      clinicName: sender.name,
      typeLabel,
      dayLabel,
      timeLabel,
      confirmUrl,
      prep: prep || null,
    })

    const { deliverSms } = await import('@/lib/sms')
    const r = await deliverSms(organizationId, { to, body, kind: 'transactional' })
    if (!r.ok) {
      // driver_off / not_approved / bad_number are states, not breaks — the
      // engine counts them skipped. Only a real send failure is a failure.
      return { ok: false, error: r.error, expected: r.reason !== 'failed' }
    }

    const startStr = detail.startTime.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
    })
    await queueCommLogWriteBack(organizationId, detail.patient.id, {
      note: `Appointment reminder texted for ${startStr}.`,
      mode: 'Text',
    })
    await logReminderSent({
      organizationId,
      appointmentId: detail.id,
      channel: 'sms',
      template: opts?.template ?? (sentByUserId ? 'default_reminder' : 'auto_reminder'),
      sentByUserId,
      providerMessageId: r.messageId,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * One text for a family's same-day visits on a shared phone — the SMS twin
 * of sendFamilyReminderEmail. Same shape: one send, then a CommLog note and
 * a reminder-log row PER appointment so per-touch idempotency is unchanged.
 * The caller already resolved the recipient, so the STOP check runs here
 * once for the household number.
 */
async function sendFamilyReminderSms(
  organizationId: string,
  items: DueReminderItem[],
  sender: ClinicSender,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string; expected?: boolean }> {
  try {
    if (await numberHasStandingOptOut(organizationId, to)) {
      return {
        ok: false,
        error: 'This number has texted STOP — texts stay off until they text START.',
        expected: true,
      }
    }
    const sorted = [...items].sort(
      (a, b) => a.detail.startTime.getTime() - b.detail.startTime.getTime(),
    )
    const dayLabel = sorted[0].detail.startTime.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: sender.timeZone,
    })
    const body = familyReminderSmsBody({
      clinicName: sender.name,
      dayLabel,
      visits: sorted.map((item) => ({
        firstName: item.detail.patient.fullName.split(' ')[0],
        timeLabel: item.detail.startTime.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
        }),
      })),
    })

    const { deliverSms } = await import('@/lib/sms')
    const r = await deliverSms(organizationId, { to, body, kind: 'transactional' })
    if (!r.ok) {
      return { ok: false, error: r.error, expected: r.reason !== 'failed' }
    }

    for (const item of sorted) {
      const d = item.detail
      const startStr = d.startTime.toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
      })
      await queueCommLogWriteBack(organizationId, d.patient.id, {
        note: `Family visit reminder texted for ${startStr} (one text covering ${sorted.length} same-day family visits).`,
        mode: 'Text',
      })
      await logReminderSent({
        organizationId,
        appointmentId: d.id,
        channel: 'sms',
        template: item.template,
        sentByUserId: null,
        providerMessageId: r.messageId,
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── Family consolidation ─────────────────────────────────────────────────────

/** One due reminder touch, resolved and ready to send. */
interface DueReminderItem {
  detail: AppointmentDetail
  template: string
  /** Resolved recipient: an email address, or an E.164 number for the SMS
   *  fallback (the patient's own, or their guardian's). */
  recipient: string
  /** Email stays the primary channel; 'sms' means the patient had no
   *  reachable inbox anywhere and a textable phone. */
  channel: 'email' | 'sms'
}

/**
 * One email for a family's same-day visits (Lighthouse-style consolidation):
 * when several due reminders resolve to the SAME inbox for the SAME
 * clinic-local day — mom plus two kids at 9:00, 9:45 and 10:30 — the inbox
 * gets a single "your family's visits" email listing everyone, with an inline
 * confirm link per still-unconfirmed visit, instead of three near-identical
 * messages. Copy is generated (a multi-visit list doesn't fit the Emails-hub
 * token templates); the journey's timing/on-off still comes from
 * reminder_settings. Logs one reminder row PER appointment (each touch keeps
 * its own idempotency) and mirrors one CommLog note per patient.
 */
async function sendFamilyReminderEmail(
  organizationId: string,
  items: DueReminderItem[],
  sender: ClinicSender,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sorted = [...items].sort(
      (a, b) => a.detail.startTime.getTime() - b.detail.startTime.getTime(),
    )
    const dayLabel = sorted[0].detail.startTime.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: sender.timeZone,
    })

    // Per-visit-type prep, fetched once for the whole household.
    let visitTypeSettings: unknown = null
    try {
      const [profileRow] = await db
        .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, organizationId))
        .limit(1)
      visitTypeSettings = profileRow?.visitTypeSettings ?? null
    } catch {
      /* prep is a nice-to-have */
    }

    const lines: string[] = []
    for (const item of sorted) {
      const d = item.detail
      const firstName = escapeReminderHtml(d.patient.fullName.split(' ')[0])
      const typeLabel = escapeReminderHtml(d.type.replace(/_/g, ' '))
      const timeStr = d.startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
      })
      let confirmHtml = ''
      if (d.status !== 'confirmed') {
        try {
          const token = await getOrCreateConfirmToken(organizationId, d.id)
          if (token) {
            confirmHtml = ` &nbsp;·&nbsp; <a href="${APP_BASE}/c/${token}" style="color:#2A7F8C;font-weight:bold;">Confirm →</a>`
          }
        } catch {
          /* line renders without the link */
        }
      }
      lines.push(
        `<p style="margin:0 0 6px;"><strong>${firstName}</strong> — ${typeLabel}, ${timeStr}${confirmHtml}</p>`,
      )
      const prep = visitTypePrepInstructions(visitTypeSettings as never, d.type)
      if (prep) {
        lines.push(
          `<p style="margin:0 0 10px;font-size:13px;color:#666666;">Before ${firstName}’s visit: ${escapeReminderHtml(prep)}</p>`,
        )
      }
    }

    const introHtml = `<p style="margin:0 0 14px;">Hi! Your family has ${sorted.length} visits with ${escapeReminderHtml(sender.name)} on ${dayLabel} — all together here so we only nudge you once:</p>${lines.join('')}`

    await deliver({
      to,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: `Your family’s visits on ${dayLabel} — ${sender.name}`,
      html: authEmailShell({
        heading: 'Your family’s visits are coming up',
        introHtml,
        footnoteHtml:
          'Need a different time for anyone? Just reply to this email and we’ll find one together.',
      }),
    })

    for (const item of sorted) {
      const d = item.detail
      const startStr = d.startTime.toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone,
      })
      await queueCommLogWriteBack(organizationId, d.patient.id, {
        note: `Family visit reminder sent for ${startStr} (one email covering ${sorted.length} same-day family visits).`,
        mode: 'Email',
      })
      await logReminderSent({
        organizationId,
        appointmentId: d.id,
        channel: 'email',
        template: item.template,
        sentByUserId: null,
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── The automated engine ─────────────────────────────────────────────────────

export interface ReminderRunResult {
  /** Clinic orgs whose reminder settings were enabled + scanned. */
  orgsScanned: number
  /** Appointments that fell in the window and were eligible to consider. */
  candidates: number
  /** Reminders actually sent (email or text). */
  sent: number
  /** The subset of `sent` that went by text — the phone-only patients the
   *  engine used to skip entirely. */
  sentSms: number
  /** Skipped because a reminder already went out within the window (idempotency). */
  alreadyReminded: number
  /** Skipped for an expected reason (no email, etc.). */
  skipped: number
  /** Sends that errored (worth alerting on). */
  failed: number
  errors: Array<{ organizationId: string; appointmentId: string; error: string }>
}

/**
 * Find + send every due appointment reminder across all clinics. Safe to run
 * every 30 minutes — each JOURNEY TOUCH is idempotent per appointment.
 *
 * Eligibility per appointment:
 *   - status is 'scheduled' (confirm-cta copy) or 'confirmed' (gentler
 *     variant with its own on/off); cancelled / no_show / completed never,
 *   - startTime ∈ [now, now + max(touchOffsets)],
 *   - patient is active with an email on file — or a guardian link whose
 *     guardian has one (dependents get reminded via the guardian's inbox) —
 *     or, when the clinic's own texting is live, a textable phone (the SMS
 *     fallback: email is always preferred, a text goes only where no inbox
 *     can be reached),
 *   - the due touch (smallest opened offset) hasn't sent for this visit, and
 *     no other visit reminder went out within REMINDER_MIN_GAP_HOURS.
 *
 * Family consolidation: due reminders resolving to the same inbox for the
 * same clinic-local day collapse into ONE household email (see
 * sendFamilyReminderEmail); every appointment still gets its own log row, so
 * per-touch idempotency is unchanged. The same collapse applies per shared
 * phone number for the SMS fallback.
 */
export async function runDueReminders(opts?: { now?: Date }): Promise<ReminderRunResult> {
  const now = opts?.now ?? new Date()
  const result: ReminderRunResult = {
    orgsScanned: 0,
    candidates: 0,
    sent: 0,
    sentSms: 0,
    alreadyReminded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  // One row per clinic (clinic_profile is 1:1 with a clinic org). reminderSettings
  // null = REMINDER_DEFAULTS (enabled, 24h).
  const profiles = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      reminderSettings: schema.clinicProfile.reminderSettings,
    })
    .from(schema.clinicProfile)

  // THE KILL (owner ruling): an expired trial's practice sends nothing.
  const shutDown = await listShutDownOrgIds(now)
  for (const profile of profiles) {
    if (shutDown.has(profile.organizationId)) continue
    const settings = resolveReminderSettings(profile.reminderSettings)
    if (!settings.enabled) continue
    result.orgsScanned++

    // The journey: touch offsets descending (e.g. [72, 24]). The scan window
    // covers the LARGEST offset; per appointment we pick the most imminent
    // touch whose window has opened.
    const offsets = settings.touchOffsets
    const windowEnd = new Date(now.getTime() + offsets[0] * 60 * 60 * 1000)
    const gapCutoff = new Date(now.getTime() - REMINDER_MIN_GAP_HOURS * 60 * 60 * 1000)

    // Can this clinic text? Decides whether phone-only patients are even
    // CANDIDATES. One read per org; deliverSms re-enforces the law at send
    // time, so this is a scan optimisation, not the gate itself.
    let smsLive = false
    try {
      const { getClinicSmsIdentity } = await import('@/lib/sms')
      smsLive = (await getClinicSmsIdentity(profile.organizationId)).ok
    } catch {
      /* texting unavailable → the engine behaves exactly as before */
    }

    // Candidate appointments in the window with a reachable patient: the
    // patient's own email, OR a guardian link (a dependent without an email
    // gets reminders at the guardian's address), OR — only when the clinic's
    // texting is live — a textable phone (the SMS fallback for the
    // phone-only patients the public booking form has always allowed). Both
    // scheduled AND confirmed qualify — confirmed patients get the gentler
    // "see you soon" variant (its own on/off in the Emails hub); unconfirmed
    // get the confirm-cta copy. The per-touch idempotency check is a
    // per-appointment query below rather than a join, to keep this
    // dependency-light + easy to unit test in isolation.
    const reachableByEmail = or(
      and(isNotNull(schema.patient.email), ne(schema.patient.email, '')),
      isNotNull(schema.patient.guardianPatientId),
    )
    // ONE CLINIC MUST NEVER SILENCE THE TICK. This query is per-org; an
    // unwrapped throw here (statement timeout, a malformed row) would escape
    // both loops to the route's catch → HTTP 500 → every REMAINING clinic goes
    // unreminded for this run. Isolate it: count the org failed, tell the
    // Guardian, move to the next clinic.
    let candidates: Array<{
      appointmentId: string
      patientId: string
      startTime: Date
      guardianPatientId: string | null
    }>
    try {
      candidates = await db
      .select({
        appointmentId: schema.appointment.id,
        patientId: schema.appointment.patientId,
        startTime: schema.appointment.startTime,
        guardianPatientId: schema.patient.guardianPatientId,
      })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.appointment.organizationId, profile.organizationId),
          inArray(schema.appointment.status, ['scheduled', 'confirmed']),
          gte(schema.appointment.startTime, now),
          lte(schema.appointment.startTime, windowEnd),
          eq(schema.patient.isActive, 1),
          smsLive
            ? or(
                reachableByEmail,
                and(isNotNull(schema.patient.phone), ne(schema.patient.phone, '')),
              )
            : reachableByEmail,
        ),
      )
      .limit(500)
    } catch (err) {
      result.failed++
      result.errors.push({
        organizationId: profile.organizationId,
        appointmentId: '',
        error: err instanceof Error ? err.message : 'candidate scan failed',
      })
      await reportAutomationFailure(profile.organizationId, 'reminders').catch(() => {})
      continue
    }

    // Due items collect here, then send grouped by inbox + clinic-local day —
    // a family with several same-day visits gets ONE consolidated email.
    const dueItems: DueReminderItem[] = []
    let sender: ClinicSender | null = null

    for (const c of candidates) {
      result.candidates++

      // Pick this appointment's due touch: the SMALLEST offset whose window
      // has opened (hoursUntil <= offset). A visit booked inside a larger
      // touch's window gets that touch once, never a catch-up burst.
      const hoursUntil = ((c.startTime as Date).getTime() - now.getTime()) / (60 * 60 * 1000)
      const eligible = offsets.filter((o) => hoursUntil <= o)
      if (eligible.length === 0) {
        result.skipped++
        continue
      }
      const touch = Math.min(...eligible)
      const template = reminderTouchTemplate(touch)

      // Idempotency, two rules in one query:
      //  (a) this touch already sent for this appointment (ever) — a touch
      //      fires at most once;
      //  (b) ANY visit reminder (auto or manual; forms nudges don't count)
      //      went out within REMINDER_MIN_GAP_HOURS — touches never stack
      //      back-to-back on a late booking, and a manual drawer send
      //      suppresses the next automated touch.
      // Isolated per APPOINTMENT: this is the idempotency read, so a throw here
      // must never be treated as "nothing sent yet" (that would re-send a
      // reminder the patient already got) and must not abort the org's whole
      // batch. Skip just this appointment; the next run retries it.
      let priorLogs: Array<{ template: string | null; sentAt: Date }>
      try {
        priorLogs = await db
        .select({
          template: schema.appointmentReminderLog.template,
          sentAt: schema.appointmentReminderLog.sentAt,
        })
        .from(schema.appointmentReminderLog)
        .where(
          and(
            eq(schema.appointmentReminderLog.appointmentId, c.appointmentId),
            or(
              eq(schema.appointmentReminderLog.template, template),
              gte(schema.appointmentReminderLog.sentAt, gapCutoff),
            ),
          ),
        )
      } catch (err) {
        result.failed++
        result.errors.push({
          organizationId: profile.organizationId,
          appointmentId: c.appointmentId,
          error: err instanceof Error ? err.message : 'reminder-log read failed',
        })
        continue
      }
      const touchAlreadySent = priorLogs.some((l) => l.template === template)
      const recentReminder = priorLogs.some(
        (l) =>
          l.template !== FORMS_REMINDER_TEMPLATE &&
          l.sentAt instanceof Date &&
          l.sentAt >= gapCutoff,
      )
      if (touchAlreadySent || recentReminder) {
        result.alreadyReminded++
        continue
      }

      try {
        const detail = await getAppointmentDetail(profile.organizationId, c.appointmentId)
        if (!detail) {
          result.skipped++
          continue
        }
        // Resolve the recipient, email first: the patient's own address,
        // else the guardian's (family-linked dependents often have no
        // address of their own). Only when NO inbox exists anywhere does the
        // SMS fallback look at phones — the patient's own, else the
        // guardian's. A standing STOP is enforced at send time
        // (numberHasStandingOptOut inside the send helpers), where the final
        // number is known.
        let recipient: string | null = detail.patient.email
        let channel: 'email' | 'sms' = 'email'
        let guardian: { email: string | null; phone: string | null } | null = null
        if (!recipient && c.guardianPatientId) {
          const [g] = await db
            .select({ email: schema.patient.email, phone: schema.patient.phone })
            .from(schema.patient)
            .where(
              and(
                eq(schema.patient.id, c.guardianPatientId),
                eq(schema.patient.organizationId, profile.organizationId),
              ),
            )
            .limit(1)
          guardian = g ?? null
          recipient = guardian?.email?.trim() || null
        }
        if (!recipient && smsLive) {
          const phone = toE164(detail.patient.phone) ?? toE164(guardian?.phone ?? null)
          if (phone) {
            recipient = phone
            channel = 'sms'
          }
        }
        if (!recipient) {
          result.skipped++
          continue
        }
        dueItems.push({ detail, template, recipient, channel })
      } catch (err) {
        result.failed++
        result.errors.push({
          organizationId: profile.organizationId,
          appointmentId: c.appointmentId,
          error: err instanceof Error ? err.message : 'unknown',
        })
      }
    }

    if (dueItems.length === 0) continue

    try {
      sender = await getClinicSenderIdentity(profile.organizationId)
    } catch (err) {
      result.failed += dueItems.length
      result.errors.push({
        organizationId: profile.organizationId,
        appointmentId: dueItems[0].detail.id,
        error: err instanceof Error ? err.message : 'sender identity failed',
      })
      // TELL THE GUARDIAN — a persistently broken sender identity silently
      // stops every reminder for this clinic, the same as a send failure
      // (which DOES report below); without this the engine reads 'healthy'.
      await reportAutomationFailure(profile.organizationId, 'reminders').catch(() => {})
      continue
    }

    // Family consolidation: bucket by (channel, recipient, clinic-local
    // day). One visit in a bucket → the normal single-visit reminder
    // (unchanged behavior); more → one consolidated household email — or,
    // for a shared family phone, one household text.
    const buckets = new Map<string, DueReminderItem[]>()
    for (const item of dueItems) {
      const key = `${item.channel}|${item.recipient.toLowerCase()}|${clinicDayKey(item.detail.startTime, sender.timeZone)}`
      const list = buckets.get(key)
      if (list) list.push(item)
      else buckets.set(key, [item])
    }

    for (const bucket of Array.from(buckets.values())) {
      const isSms = bucket[0].channel === 'sms'
      if (bucket.length === 1) {
        const item = bucket[0]
        const r = isSms
          ? await sendReminderSms(profile.organizationId, item.detail, sender, null, {
              template: item.template,
              to: item.recipient,
            })
          : await sendReminderEmail(profile.organizationId, item.detail, sender, null, {
              template: item.template,
              to: item.recipient,
            })
        if (r.ok) {
          result.sent++
          if (isSms) result.sentSms++
        } else if (
          ('expected' in r && r.expected) ||
          r.error.includes('no email') ||
          r.error.includes('disabled')
        ) {
          result.skipped++
        } else {
          result.failed++
          result.errors.push({ organizationId: profile.organizationId, appointmentId: item.detail.id, error: r.error })
          // TELL THE GUARDIAN (Phase 4 open item #1). Reminders are the
          // automation a clinic feels most, and a week of them failing left
          // that practice reading `healthy` — an idle ledger with no
          // failures is indistinguishable from a calm one. Throttled to one
          // a day per clinic inside the helper, so a strike means a DAY.
          await reportAutomationFailure(profile.organizationId, 'reminders')
        }
      } else {
        const r = isSms
          ? await sendFamilyReminderSms(profile.organizationId, bucket, sender, bucket[0].recipient)
          : await sendFamilyReminderEmail(profile.organizationId, bucket, sender, bucket[0].recipient)
        if (r.ok) {
          result.sent += bucket.length
          if (isSms) result.sentSms += bucket.length
        } else if ('expected' in r && r.expected) {
          result.skipped += bucket.length
        } else {
          result.failed += bucket.length
          result.errors.push({ organizationId: profile.organizationId, appointmentId: bucket[0].detail.id, error: r.error })
          await reportAutomationFailure(profile.organizationId, 'reminders')
        }
      }
    }
  }

  return result
}

const FORMS_REMINDER_TEMPLATE = 'forms_intake'

/**
 * Forms-completion reminders: nudge a patient with an upcoming LIVE visit who
 * hasn't completed any intake form yet. Distinct from the visit reminder above
 * — fixes the two complaints from the research: invisible/unfinished forms, and
 * reminders firing for cancelled visits (only scheduled/confirmed qualify).
 * Idempotent via an `appointment_reminder_log` row tagged `forms_intake`.
 */
export async function runDueFormReminders(opts?: { now?: Date }): Promise<ReminderRunResult> {
  const now = opts?.now ?? new Date()
  const result: ReminderRunResult = { orgsScanned: 0, candidates: 0, sent: 0, sentSms: 0, alreadyReminded: 0, skipped: 0, failed: 0, errors: [] }

  const profiles = await db
    .select({ organizationId: schema.clinicProfile.organizationId, reminderSettings: schema.clinicProfile.reminderSettings })
    .from(schema.clinicProfile)

  const { sendIntakeRequestToPatient } = await import('@/lib/services/patient-intake-send')

  // THE KILL: a shut-down practice nudges nobody about paperwork either.
  const shutDown = await listShutDownOrgIds(now)
  for (const profile of profiles) {
    if (shutDown.has(profile.organizationId)) continue
    const settings = resolveReminderSettings(profile.reminderSettings)
    if (!settings.formsReminder) continue
    result.orgsScanned++

    const windowEnd = new Date(now.getTime() + FORMS_REMINDER_WINDOW_HOURS * 60 * 60 * 1000)
    const remindedSince = new Date(now.getTime() - FORMS_REMINDER_WINDOW_HOURS * 60 * 60 * 1000)

    // Upcoming LIVE appointments with an email on file. 'scheduled' OR
    // 'confirmed' — a confirmed visit still needs its paperwork. Cancelled /
    // no-show / completed are excluded by construction.
    const candidates = await db
      .select({ appointmentId: schema.appointment.id, patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.appointment.organizationId, profile.organizationId),
          inArray(schema.appointment.status, ['scheduled', 'confirmed']),
          gte(schema.appointment.startTime, now),
          lte(schema.appointment.startTime, windowEnd),
          eq(schema.patient.isActive, 1),
          isNotNull(schema.patient.email),
          ne(schema.patient.email, ''),
        ),
      )
      .limit(500)

    // Two batched set-membership queries instead of a per-candidate N+1 that
    // hit the (previously unindexed) form_submission table on every single
    // candidate, every 30 min, across every org.
    const patientIds = Array.from(
      new Set(candidates.map((c) => c.patientId).filter((id): id is string => !!id)),
    )
    const appointmentIds = candidates.map((c) => c.appointmentId)

    // Patients who have ever submitted any form → nothing to chase.
    const submittedRows = patientIds.length
      ? await db
          .selectDistinct({ patientId: schema.formSubmission.patientId })
          .from(schema.formSubmission)
          .where(
            and(
              eq(schema.formSubmission.organizationId, profile.organizationId),
              inArray(schema.formSubmission.patientId, patientIds),
            ),
          )
      : []
    const submittedSet = new Set(
      submittedRows.map((r) => r.patientId).filter((id): id is string => !!id),
    )

    // Appointments that already got a forms reminder within the window.
    const recentRows = appointmentIds.length
      ? await db
          .select({ appointmentId: schema.appointmentReminderLog.appointmentId })
          .from(schema.appointmentReminderLog)
          .where(
            and(
              inArray(schema.appointmentReminderLog.appointmentId, appointmentIds),
              eq(schema.appointmentReminderLog.template, FORMS_REMINDER_TEMPLATE),
              gte(schema.appointmentReminderLog.sentAt, remindedSince),
            ),
          )
      : []
    const recentSet = new Set(recentRows.map((r) => r.appointmentId))

    const remindedPatients = new Set<string>()

    for (const c of candidates) {
      if (!c.patientId) continue
      result.candidates++

      // One nudge per patient per run (a patient with two upcoming visits gets
      // a single reminder).
      if (remindedPatients.has(c.patientId)) {
        result.alreadyReminded++
        continue
      }

      // Already completed a form? Then nothing to chase.
      if (submittedSet.has(c.patientId)) {
        result.skipped++
        continue
      }

      // Cross-run dedup: a forms reminder already went out for this appointment
      // within the window.
      if (recentSet.has(c.appointmentId)) {
        result.alreadyReminded++
        continue
      }

      try {
        // Throws on success-blockers (no email, no default form). Any return
        // means it sent.
        await sendIntakeRequestToPatient(profile.organizationId, c.patientId)
        remindedPatients.add(c.patientId)
        await logReminderSent({
          organizationId: profile.organizationId,
          appointmentId: c.appointmentId,
          channel: 'email',
          template: FORMS_REMINDER_TEMPLATE,
          sentByUserId: null,
        })
        result.sent++
      } catch (err) {
        // "No email" / "no default form" / "rate limit" are expected non-sends,
        // not failures — don't noise up the error list.
        const msg = err instanceof Error ? err.message : 'unknown'
        if (/no email|default intake form|opted|already|available/i.test(msg)) {
          result.skipped++
        } else {
          result.failed++
          result.errors.push({ organizationId: profile.organizationId, appointmentId: c.appointmentId, error: msg })
        }
      }
    }
  }

  return result
}
