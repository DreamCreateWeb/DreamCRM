import 'server-only'
import { and, eq, gte, inArray, isNotNull, lte, ne, or } from 'drizzle-orm'
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
  FORMS_REMINDER_WINDOW_HOURS,
  REMINDER_MIN_GAP_HOURS,
  type ReminderSettings,
} from '@/lib/types/reminders'
import { visitTypePrepInstructions } from '@/lib/types/visit-types'
import type { ClinicSender } from '@/lib/email-identity'

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
  opts?: { template?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!detail.patient.email) return { ok: false, error: 'Patient has no email on file' }
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
        to: detail.patient.email,
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
          to: detail.patient.email,
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

// ── The automated engine ─────────────────────────────────────────────────────

export interface ReminderRunResult {
  /** Clinic orgs whose reminder settings were enabled + scanned. */
  orgsScanned: number
  /** Appointments that fell in the window and were eligible to consider. */
  candidates: number
  /** Reminders actually emailed. */
  sent: number
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
 *   - patient is active and has an email on file,
 *   - the due touch (smallest opened offset) hasn't sent for this visit, and
 *     no other visit reminder went out within REMINDER_MIN_GAP_HOURS.
 */
export async function runDueReminders(opts?: { now?: Date }): Promise<ReminderRunResult> {
  const now = opts?.now ?? new Date()
  const result: ReminderRunResult = {
    orgsScanned: 0,
    candidates: 0,
    sent: 0,
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

  for (const profile of profiles) {
    const settings = resolveReminderSettings(profile.reminderSettings)
    if (!settings.enabled) continue
    result.orgsScanned++

    // The journey: touch offsets descending (e.g. [72, 24]). The scan window
    // covers the LARGEST offset; per appointment we pick the most imminent
    // touch whose window has opened.
    const offsets = settings.touchOffsets
    const windowEnd = new Date(now.getTime() + offsets[0] * 60 * 60 * 1000)
    const gapCutoff = new Date(now.getTime() - REMINDER_MIN_GAP_HOURS * 60 * 60 * 1000)

    // Candidate appointments in the window with an email on file. Both
    // scheduled AND confirmed qualify — confirmed patients get the gentler
    // "see you soon" variant (its own on/off in the Emails hub); unconfirmed
    // get the confirm-cta copy. The per-touch idempotency check is a
    // per-appointment query below rather than a join, to keep this
    // dependency-light + easy to unit test in isolation.
    const candidates = await db
      .select({
        appointmentId: schema.appointment.id,
        patientId: schema.appointment.patientId,
        startTime: schema.appointment.startTime,
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
          isNotNull(schema.patient.email),
          ne(schema.patient.email, ''),
        ),
      )
      .limit(500)

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
      const priorLogs = await db
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
        if (!detail || !detail.patient.email) {
          result.skipped++
          continue
        }
        const sender = await getClinicSenderIdentity(profile.organizationId)
        const r = await sendReminderEmail(profile.organizationId, detail, sender, null, { template })
        if (r.ok) {
          result.sent++
        } else if (r.error.includes('no email') || r.error.includes('disabled')) {
          result.skipped++
        } else {
          result.failed++
          result.errors.push({ organizationId: profile.organizationId, appointmentId: c.appointmentId, error: r.error })
        }
      } catch (err) {
        result.failed++
        result.errors.push({
          organizationId: profile.organizationId,
          appointmentId: c.appointmentId,
          error: err instanceof Error ? err.message : 'unknown',
        })
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
  const result: ReminderRunResult = { orgsScanned: 0, candidates: 0, sent: 0, alreadyReminded: 0, skipped: 0, failed: 0, errors: [] }

  const profiles = await db
    .select({ organizationId: schema.clinicProfile.organizationId, reminderSettings: schema.clinicProfile.reminderSettings })
    .from(schema.clinicProfile)

  const { sendIntakeRequestToPatient } = await import('@/lib/services/patient-intake-send')

  for (const profile of profiles) {
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
