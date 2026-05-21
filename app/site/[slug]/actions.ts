'use server'

import { randomUUID } from 'crypto'
import { eq, and, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { sendContactRequestEmail, sendBookingConfirmationEmail } from '@/lib/email'
import { getAvailableSlots, isSlotAvailable, SLOT_MINUTES, type BookingSlot } from '@/lib/services/booking'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { organization } from '@/lib/db/schema/auth'

export async function submitContactRequest(formData: FormData) {
  const orgId = formData.get('orgId')?.toString()
  const name = formData.get('name')?.toString().trim()
  const phone = formData.get('phone')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const message = formData.get('message')?.toString().trim() || null
  const preferredDate = formData.get('preferredDate')?.toString().trim() || null

  if (!orgId) throw new Error('Missing organization')
  if (!name) throw new Error('Name is required')
  if (!phone) throw new Error('Phone is required')

  const [profile] = await db
    .select({ email: clinicProfile.email, displayName: clinicProfile.displayName })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  // Fire-and-forget: don't fail the form just because email is misconfigured.
  if (profile?.email) {
    sendContactRequestEmail(profile.email, {
      clinicName: profile.displayName ?? 'Your Clinic',
      patientName: name,
      phone,
      email,
      preferredDate,
      message,
    }).catch((err) => {
      console.error('[clinic-site] contact email failed', err)
    })
  }
}

export async function listBookingSlots(
  orgId: string,
  dateIso: string,
): Promise<BookingSlot[]> {
  if (!orgId || !dateIso) return []
  const date = new Date(dateIso)
  if (isNaN(date.getTime())) return []
  return getAvailableSlots(orgId, date)
}

export async function submitBookingRequest(formData: FormData) {
  const orgId = formData.get('orgId')?.toString()
  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const phone = formData.get('phone')?.toString().trim() || null
  const appointmentType = formData.get('type')?.toString() || 'checkup'
  const startTimeRaw = formData.get('startTime')?.toString()
  const notes = formData.get('notes')?.toString().trim() || null

  if (!orgId) throw new Error('Missing organization')
  if (!firstName || !lastName) throw new Error('Name is required')
  if (!startTimeRaw) throw new Error('Appointment date and time are required')

  const startTime = new Date(startTimeRaw)
  if (isNaN(startTime.getTime())) throw new Error('Invalid date/time')
  if (startTime.getTime() < Date.now()) throw new Error('Appointment must be in the future')

  // Race-condition guard — between page load and submit, someone else
  // could have grabbed the same slot. Re-check against the live calendar.
  const stillFree = await isSlotAvailable(orgId, startTime)
  if (!stillFree) {
    throw new Error('That slot is no longer available — please pick another time.')
  }

  let patientId = ''
  // Look up an existing patient by email OR phone — phone-only bookings
  // are common (some patients don't share email), and we want to attach
  // repeat visits to the same patient row.
  if (email || phone) {
    const conditions = [] as ReturnType<typeof eq>[]
    if (email) conditions.push(eq(patient.email, email))
    if (phone) conditions.push(eq(patient.phone, phone))
    const [existing] = await db
      .select({ id: patient.id })
      .from(patient)
      .where(
        and(
          eq(patient.organizationId, orgId),
          conditions.length === 1 ? conditions[0] : or(conditions[0], conditions[1])!,
        ),
      )
      .limit(1)
    patientId = existing?.id ?? ''
  }

  if (!patientId) {
    patientId = randomUUID()
    const now = new Date()
    await db.insert(patient).values({
      id: patientId,
      organizationId: orgId,
      firstName,
      lastName,
      email,
      phone,
      isActive: 1,
      source: 'booking',
      lifecycle: 'new',
      firstSeenAt: now,
      lastActivityAt: now,
    })
  } else {
    await db
      .update(patient)
      .set({ lastActivityAt: new Date() })
      .where(eq(patient.id, patientId))
  }

  // Default end time = start + one slot (30 min). Lets the schedule view
  // and conflict detection both work without a separate end-time field.
  const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60_000)

  await db.insert(appointment).values({
    id: randomUUID(),
    organizationId: orgId,
    patientId,
    title: `${appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1).replace('_', ' ')} – ${firstName} ${lastName}`,
    startTime,
    endTime,
    type: appointmentType,
    status: 'scheduled',
    notes,
    source: 'booking_widget',
  })

  const [profile] = await db
    .select({
      email: clinicProfile.email,
      displayName: clinicProfile.displayName,
      phone: clinicProfile.phone,
      websiteDomain: clinicProfile.websiteDomain,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  if (email) {
    // Build the intake-form link when the clinic has a default form.
    let intakeFormUrl: string | null = null
    const defaultForm = await getDefaultFormTemplate(orgId)
    if (defaultForm) {
      const [org] = await db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1)
      if (org) {
        const base = publicSiteUrl({
          slug: org.slug,
          profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
        })
        intakeFormUrl = `${base}/intake/${defaultForm.slug}`
      }
    }

    sendBookingConfirmationEmail(email, {
      patientName: `${firstName} ${lastName}`,
      clinicName: profile?.displayName ?? 'Your Clinic',
      clinicPhone: profile?.phone ?? null,
      startTime,
      appointmentType,
      intakeFormUrl,
    }).catch((err) => {
      console.error('[clinic-site] booking email failed', err)
    })
  }
}
