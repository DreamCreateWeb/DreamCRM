import 'server-only'
import { and, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { sendNotificationEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getAppointmentDetail, logReminderSent, type AppointmentDetail } from '@/lib/services/appointments'
import { resolveReminderSettings, type ReminderSettings } from '@/lib/types/reminders'
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
export async function sendReminderEmail(
  organizationId: string,
  detail: AppointmentDetail,
  sender: ClinicSender,
  sentByUserId: string | null,
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
    await sendNotificationEmail(
      {
        to: detail.patient.email,
        name: detail.patient.fullName,
        title: `Reminder: your ${typeLabel} on ${dateStr}`,
        body: `Hi ${firstName} — just a quick reminder of your ${typeLabel} appointment at ${sender.name} on ${startStr}. Reply CONFIRM or call us back to confirm. Thanks!`,
      },
      sender,
    )
    await queueCommLogWriteBack(organizationId, detail.patient.id, {
      note: `Appointment reminder sent for ${startStr}.`,
      mode: 'Email',
    })
    await logReminderSent({
      organizationId,
      appointmentId: detail.id,
      channel: 'email',
      template: sentByUserId ? 'default_reminder' : 'auto_reminder',
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
 * every 30 minutes — idempotent per appointment within its reminder window.
 *
 * Eligibility per appointment:
 *   - status is 'scheduled' or 'confirmed' (a confirmed patient still gets the
 *     day-before nudge; cancelled / no_show / completed never do),
 *   - startTime ∈ [now, now + offsetHours],
 *   - patient is active and has an email on file,
 *   - no `appointment_reminder_log` row within the last `offsetHours`.
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

    const windowEnd = new Date(now.getTime() + settings.offsetHours * 60 * 60 * 1000)
    const remindedSince = new Date(now.getTime() - settings.offsetHours * 60 * 60 * 1000)

    // Candidate appointments in the window with an email on file. The
    // idempotency check (a recent reminder log row) is a per-appointment query
    // below rather than a join, to keep this dependency-light + easy to unit
    // test the windowing/idempotency rules in isolation.
    const candidates = await db
      .select({
        appointmentId: schema.appointment.id,
        patientId: schema.appointment.patientId,
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

      // Idempotency: skip if a reminder already went out for this appointment
      // within the current window. Running every 30 min is therefore safe.
      const [recent] = await db
        .select({ id: schema.appointmentReminderLog.id })
        .from(schema.appointmentReminderLog)
        .where(
          and(
            eq(schema.appointmentReminderLog.appointmentId, c.appointmentId),
            gte(schema.appointmentReminderLog.sentAt, remindedSince),
          ),
        )
        .limit(1)
      if (recent) {
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
        const r = await sendReminderEmail(profile.organizationId, detail, sender, null)
        if (r.ok) {
          result.sent++
        } else if (r.error.includes('no email')) {
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
