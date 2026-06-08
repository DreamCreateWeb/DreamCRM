'use server'

import { randomUUID } from 'crypto'
import { eq, and, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { sendContactRequestEmail, sendBookingConfirmationEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getSlotsForDay, isSlotAvailable, SLOT_MINUTES, type SlotsForDay } from '@/lib/services/booking'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { publicSiteUrl, resolveClinicOrgIdBySlug } from '@/lib/services/clinic-site'
import { createLead } from '@/lib/services/leads'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { queueAppointmentWriteBack } from '@/lib/services/pms'
import { organization } from '@/lib/db/schema/auth'

export async function submitContactRequest(formData: FormData) {
  // Resolve the org from the PUBLIC slug, never a client-posted orgId — a
  // submission can only ever target the real clinic whose page it came from.
  const orgId = await resolveClinicOrgIdBySlug(formData.get('slug')?.toString() ?? '')
  if (!orgId) throw new Error('We couldn’t find this clinic. Please refresh and try again.')

  // Source-attribution fields populated by the client-side ContactForm.
  // All optional — older form versions / programmatic submissions won't
  // have them and that's fine.
  const sourcePage = formData.get('sourcePage')?.toString().trim() || null
  const referrer = formData.get('referrer')?.toString().trim() || null
  const utmSource = formData.get('utm_source')?.toString().trim() || null
  const utmMedium = formData.get('utm_medium')?.toString().trim() || null
  const utmCampaign = formData.get('utm_campaign')?.toString().trim() || null

  const [profile] = await db
    .select({
      email: clinicProfile.email,
      displayName: clinicProfile.displayName,
      leadForms: clinicProfile.leadForms,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  // Map each submitted value by its (possibly customised) field definition:
  // system fields → lead columns, custom fields → labelled note lines.
  const fields = resolveLeadForm((profile?.leadForms as LeadFormsConfig | null) ?? null, 'contact')
  let name = ''
  let phone = ''
  let email: string | null = null
  let preferredDate: string | null = null
  let messageMain: string | null = null
  const detailLines: string[] = []
  for (const f of fields) {
    const raw = formData.get(f.id)?.toString().trim() || ''
    if (f.required && !raw) throw new Error(`${f.label} is required`)
    if (f.systemKey === 'name') name = raw
    else if (f.systemKey === 'phone') phone = raw
    else if (f.systemKey === 'email') email = raw || null
    else if (f.systemKey === 'preferredDate') preferredDate = raw || null
    else if (f.systemKey === 'message') messageMain = raw || null
    else if (raw && raw !== '__other__') detailLines.push(`${f.label}: ${raw}`)
  }
  if (!name) name = 'Website enquiry'
  if (!phone && !email) throw new Error('Please give us a phone or email so we can reach you')
  const message = [messageMain, ...detailLines].filter(Boolean).join('\n\n') || null

  // Persist the lead BEFORE firing email — DB success is the source of
  // truth. Email is best-effort notification on top.
  await createLead({
    organizationId: orgId,
    name,
    phone,
    email,
    preferredDate,
    message,
    sourcePage,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
  })

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
): Promise<SlotsForDay> {
  if (!orgId || !dateIso) return { slots: [], closedReason: 'invalid_hours' }
  const date = new Date(dateIso)
  if (isNaN(date.getTime())) return { slots: [], closedReason: 'invalid_hours' }
  return getSlotsForDay(orgId, date)
}

export async function submitBookingRequest(formData: FormData) {
  const slug = formData.get('slug')?.toString()
  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const phone = formData.get('phone')?.toString().trim() || null
  const appointmentType = formData.get('type')?.toString() || 'checkup'
  const startTimeRaw = formData.get('startTime')?.toString()
  const notes = formData.get('notes')?.toString().trim() || null

  // Source attribution (mirrors the contact form) — powers SEO organic→booking
  // attribution. All optional.
  const sourcePage = formData.get('sourcePage')?.toString().trim() || null
  const referrer = formData.get('referrer')?.toString().trim() || null
  const utmSource = formData.get('utm_source')?.toString().trim() || null
  const utmMedium = formData.get('utm_medium')?.toString().trim() || null
  const utmCampaign = formData.get('utm_campaign')?.toString().trim() || null

  // Resolve the org from the PUBLIC slug, never a client-posted orgId.
  const orgId = await resolveClinicOrgIdBySlug(slug ?? '')
  if (!orgId) throw new Error('We couldn’t find this clinic. Please refresh and try again.')
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

  const apptId = randomUUID()
  await db.insert(appointment).values({
    id: apptId,
    organizationId: orgId,
    patientId,
    title: `${appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1).replace('_', ' ')} – ${firstName} ${lastName}`,
    startTime,
    endTime,
    type: appointmentType,
    status: 'scheduled',
    notes,
    source: 'booking_widget',
    sourcePage,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
  })

  // Two-way PMS: queue this public booking to be written to the clinic's PMS on
  // the next sync (best-effort; never blocks the booking confirmation).
  await queueAppointmentWriteBack(orgId, apptId)

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

    const sender = await getClinicSenderIdentity(orgId)
    sendBookingConfirmationEmail(
      email,
      {
        patientName: `${firstName} ${lastName}`,
        clinicName: sender.name,
        clinicPhone: profile?.phone ?? null,
        startTime,
        appointmentType,
        intakeFormUrl,
      },
      sender,
    ).catch((err) => {
      console.error('[clinic-site] booking email failed', err)
    })
    // Mirror the booking confirmation into OD's CommLog (best-effort).
    queueCommLogWriteBack(orgId, patientId, {
      note: `Booking confirmation sent for ${appointmentType.replace(/_/g, ' ')} on ${startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
      mode: 'Email',
    }).catch(() => {})
  }
}
