import 'server-only'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { sendBookingConfirmationEmail } from '@/lib/email'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getBookingIntakeForm } from '@/lib/services/forms'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'

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
    )
    await queueCommLogWriteBack(opts.organizationId, opts.patientId, {
      note: `Booking confirmation sent for ${opts.appointmentType.replace(/_/g, ' ')} on ${opts.startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
      mode: 'Email',
    }).catch(() => {})
  } catch (err) {
    console.warn('[booking-confirmation] failed', err)
  }
}
