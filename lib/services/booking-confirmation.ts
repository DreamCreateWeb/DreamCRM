import 'server-only'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { authEmailShell, deliver, sendBookingConfirmationEmail, sendNotificationEmail } from '@/lib/email'
import { formatClinicDateTime, formatClinicDayTime } from '@/lib/format-datetime'
import { renderAutomatedEmail } from '@/lib/services/email-automations'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getBookingIntakeForm } from '@/lib/services/forms'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { getOrCreateConfirmToken } from '@/lib/services/appointment-confirm'
import { appBaseUrl } from '@/lib/clinic-site-helpers'
import type { ClinicSender } from '@/lib/email-identity'

/**
 * Send a booking confirmation email + mirror it into the PMS CommLog.
 * Best-effort (never throws) so a booking never fails on comms.
 *
 * Used by the patient-portal + front-desk booking paths so a patient gets the
 * same confirmation (with the intake-form link) the public widget already
 * sends — previously only the widget confirmed, and a patient booked by staff
 * or via the portal heard nothing.
 */
export async function sendBookingConfirmation(opts: {
  organizationId: string
  patientId: string
  appointmentType: string
  startTime: Date
}): Promise<void> {
  try {
    const [p] = await db
      .select({ email: patient.email, firstName: patient.firstName, lastName: patient.lastName })
      .from(patient)
      .where(and(eq(patient.organizationId, opts.organizationId), eq(patient.id, opts.patientId)))
      .limit(1)
    if (!p?.email) return

    const [profile] = await db
      .select({
        email: clinicProfile.email,
        displayName: clinicProfile.displayName,
        phone: clinicProfile.phone,
        websiteDomain: clinicProfile.websiteDomain,
      })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, opts.organizationId))
      .limit(1)

    // New vs returning drives which form auto-sends — a returning patient with a
    // prior completed visit gets the short update form, not the full intake.
    const [priorVisit] = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(
        and(
          eq(appointment.organizationId, opts.organizationId),
          eq(appointment.patientId, opts.patientId),
          eq(appointment.status, 'completed'),
          lt(appointment.startTime, new Date()),
        ),
      )
      .limit(1)
    const isNewPatient = !priorVisit

    let intakeFormUrl: string | null = null
    const defaultForm = await getBookingIntakeForm(opts.organizationId, isNewPatient)
    if (defaultForm) {
      const [org] = await db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, opts.organizationId))
        .limit(1)
      if (org) {
        const base = publicSiteUrl({
          slug: org.slug,
          profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
        })
        intakeFormUrl = `${base}/intake/${defaultForm.slug}`
      }
    }

    const sender = await getClinicSenderIdentity(opts.organizationId)
    // Resolve the clinic's editable copy (Settings → Automations → Emails). When
    // they've turned this email off, skip the send + the commlog mirror entirely.
    const rendered = await renderAutomatedEmail(opts.organizationId, 'booking_confirmation', {
      firstName: p.firstName,
      patientName: `${p.firstName} ${p.lastName}`.trim(),
      clinicName: sender.name,
      clinicPhone: profile?.phone ?? '',
      appointmentType: opts.appointmentType.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()),
      appointmentTime: formatClinicDateTime(opts.startTime, sender.timeZone),
    })
    if (!rendered.enabled) return
    await sendBookingConfirmationEmail(
      p.email,
      {
        patientName: `${p.firstName} ${p.lastName}`.trim(),
        clinicName: sender.name,
        clinicPhone: profile?.phone ?? null,
        startTime: opts.startTime,
        appointmentType: opts.appointmentType,
        intakeFormUrl,
        timeZone: sender.timeZone,
      },
      sender,
      rendered.override,
    )
    await queueCommLogWriteBack(opts.organizationId, opts.patientId, {
      note: `Booking confirmation sent for ${opts.appointmentType.replace(/_/g, ' ')} on ${formatClinicDayTime(opts.startTime, sender.timeZone)}.`,
      mode: 'Email',
    }).catch(() => {})
  } catch (err) {
    console.warn('[booking-confirmation] failed', err)
  }
}

export type RescheduleNoticeResult =
  | { sent: true }
  | { sent: false; reason: 'not_found' | 'no_email' | 'disabled' | 'failed' }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Tell the patient their visit MOVED — the `rescheduled` email from the
 * Emails hub (Settings → Automations → Emails), carrying the same one-click
 * `/c/[token]` confirm the reminder does, so the moved visit can be confirmed
 * from the inbox instead of sitting Unconfirmed until the next reminder.
 *
 * `newAppointmentId` is the row the reschedule MINTED (the original is now
 * cancelled-via-reschedule); the token is minted on that row, so the button
 * confirms the new time and nothing else. The clinic's switch is honoured
 * (off → nothing goes out, no CommLog line claims it did). The shell path
 * carries the button; when a token cannot be minted the plain signed note
 * goes out instead, as the reminder does. Best-effort: never throws.
 */
export async function sendRescheduleNotice(
  organizationId: string,
  newAppointmentId: string,
  sender: ClinicSender,
): Promise<RescheduleNoticeResult> {
  try {
    const [row] = await db
      .select({
        patientId: appointment.patientId,
        startTime: appointment.startTime,
        type: appointment.type,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
      })
      .from(appointment)
      .innerJoin(patient, eq(appointment.patientId, patient.id))
      .where(and(eq(appointment.organizationId, organizationId), eq(appointment.id, newAppointmentId)))
      .limit(1)
    if (!row) return { sent: false, reason: 'not_found' }
    if (!row.email) return { sent: false, reason: 'no_email' }

    const typeLabel = row.type.replace(/_/g, ' ')
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    const rendered = await renderAutomatedEmail(organizationId, 'rescheduled', {
      firstName: row.firstName,
      patientName: fullName,
      clinicName: sender.name,
      appointmentType: typeLabel,
      appointmentDate: row.startTime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: sender.timeZone,
      }),
      appointmentTime: formatClinicDateTime(row.startTime, sender.timeZone),
    })
    if (!rendered.enabled) return { sent: false, reason: 'disabled' }

    let confirmUrl: string | null = null
    try {
      const token = await getOrCreateConfirmToken(organizationId, newAppointmentId)
      if (token) confirmUrl = `${appBaseUrl()}/c/${token}`
    } catch {
      /* fall back to the plain note below */
    }

    if (confirmUrl) {
      await deliver({
        to: row.email,
        from: sender.from,
        replyTo: sender.replyTo,
        gmail: sender.gmail,
        subject: rendered.full.subject,
        html: authEmailShell({
          heading: 'Your visit has a new time',
          introHtml: escapeHtml(rendered.full.body).replace(/\n/g, '<br>'),
          buttonUrl: confirmUrl,
          buttonLabel: 'Confirm my new time',
          footnoteHtml: 'Need a different time? Just reply to this email and we’ll find one together.',
        }),
      })
    } else {
      await sendNotificationEmail(
        { to: row.email, name: fullName, title: rendered.full.subject, body: rendered.full.body },
        sender,
      )
    }
    // The CommLog mirror the inline body used to write — a PMS-connected
    // practice still sees "patient notified" on the chart.
    await queueCommLogWriteBack(organizationId, row.patientId, {
      note: `Appointment rescheduled to ${formatClinicDayTime(row.startTime, sender.timeZone)} — patient notified by email.`,
      mode: 'Email',
    }).catch(() => {})
    return { sent: true }
  } catch (err) {
    console.warn('[reschedule-notice] failed', err)
    return { sent: false, reason: 'failed' }
  }
}
