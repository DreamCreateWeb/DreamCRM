'use server'

import { randomUUID } from 'crypto'
import { eq, and, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { sendContactRequestEmail, sendBookingConfirmationEmail, sendNotificationEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getSlotsForDay, isSlotAvailable, insertAppointmentIfSlotFree, SLOT_MINUTES, type SlotsForDay } from '@/lib/services/booking'
import { visitTypeDuration } from '@/lib/types/visit-types'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { publicSiteUrl, resolveClinicOrgIdBySlug } from '@/lib/services/clinic-site'
import { createLead } from '@/lib/services/leads'
import { recordInboundMessage } from '@/lib/services/patient-messaging'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { queueAppointmentWriteBack } from '@/lib/services/pms'
import { organization } from '@/lib/db/schema/auth'
import { looksLikeBot } from '@/lib/form-trust'

export async function submitContactRequest(formData: FormData) {
  // Silent spam drop — a filled honeypot or instant submit returns the normal
  // success shape (no throw) without persisting anything, so bots get no signal.
  if (looksLikeBot(formData)) return
  // Per-IP rate limit (same silent-drop shape as the honeypot, so a flood gets
  // no signal). Generous for a real person; tight on a script.
  if (!(await rateLimitPublicAction('contact'))) return

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
      phone: clinicProfile.phone,
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

  // Ping the front desk so the lead lands in the triage queue with a nudge,
  // and send the patient a warm auto-acknowledgement so they know it landed.
  // Both best-effort — the lead row above is the source of truth.
  try {
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      orgId,
      {
        bucket: 'comments',
        type: 'website_lead',
        title: `New website lead — ${name}`,
        body: message ? message.slice(0, 140) : 'New enquiry from your website.',
        linkPath: '/leads',
        meta: { sourcePage },
      },
      { roles: ['owner', 'admin'] },
    )
  } catch (err) {
    console.warn('[clinic-site] lead notification failed', err)
  }

  // Patient auto-acknowledgement — only when they gave an email. Sent FROM the
  // clinic identity (Tier 1/2) so it doesn't read as platform spam.
  if (email) {
    try {
      const sender = await getClinicSenderIdentity(orgId)
      await sendNotificationEmail(
        {
          to: email,
          name,
          title: `Thanks for reaching out to ${sender.name}`,
          body: `Hi ${name.split(' ')[0]}, we got your message and we'll reach out within one business day. If it's urgent${profile?.phone ? ` you can call us at ${profile.phone}` : ''} — otherwise, sit tight and we'll be in touch soon.`,
        },
        sender,
      )
    } catch (err) {
      console.warn('[clinic-site] contact auto-ack email failed', err)
    }
  }
}

/**
 * Request-only booking (when the clinic has turned OFF online self-scheduling
 * in Settings → Practice). The public /book page renders a short request form
 * instead of the slot picker; this persists the request as an INBOUND MESSAGE
 * in the clinic's inbox (one thread per patient) rather than creating an
 * appointment. The front desk then replies — by email, SMS (Phase B), or
 * in-app — to set the actual time.
 *
 * Email is required (it's the reliable reach-back channel and the reply
 * composer's default); phone is optional. The org is resolved from the PUBLIC
 * slug, never a client-posted id.
 */
export async function submitAppointmentRequest(formData: FormData): Promise<void> {
  // Silent spam drop — a filled honeypot / instant submit returns the normal
  // success shape (no throw) without persisting anything, so bots get no signal.
  if (looksLikeBot(formData)) return
  if (!(await rateLimitPublicAction('booking', { limit: 6 }))) return

  const orgId = await resolveClinicOrgIdBySlug(formData.get('slug')?.toString() ?? '')
  if (!orgId) throw new Error('We couldn’t find this clinic. Please refresh and try again.')

  const firstName = formData.get('firstName')?.toString().trim() || ''
  const lastName = formData.get('lastName')?.toString().trim() || ''
  const email = formData.get('email')?.toString().trim() || ''
  const phone = formData.get('phone')?.toString().trim() || null
  // The visit-type <select> submits the human LABEL (not an id) so the message
  // reads naturally with no server-side catalog lookup. Empty = "not specified".
  const reason = formData.get('reason')?.toString().trim() || ''
  const preferred = formData.get('preferredTimes')?.toString().trim() || ''
  const note = formData.get('notes')?.toString().trim() || ''

  if (!firstName || !lastName) throw new Error('Please tell us your first and last name')
  // Email is mandatory for request-only booking — it's how the front desk
  // reaches back (in-app needs a portal login; SMS is Phase B), and it's the
  // reply composer's default channel.
  if (!email) throw new Error('Please add an email so we can reach you about your visit')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That email doesn’t look right — please double-check it')
  }

  // Find an existing patient by email OR phone (repeat requesters thread to the
  // same record) — else create a lead-lifecycle patient. Mirrors the booking
  // path's dedupe so a request doesn't fork a duplicate patient.
  let patientId = ''
  if (email || phone) {
    const conditions = [eq(patient.email, email)] as ReturnType<typeof eq>[]
    if (phone) conditions.push(eq(patient.phone, phone))
    const [existing] = await db
      .select({ id: patient.id })
      .from(patient)
      .where(
        and(
          eq(patient.organizationId, orgId),
          conditions.length === 1 ? conditions[0] : or(...conditions)!,
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
      source: 'website_request',
      lifecycle: 'lead',
      firstSeenAt: now,
      lastActivityAt: now,
    })
  } else {
    await db.update(patient).set({ lastActivityAt: new Date() }).where(eq(patient.id, patientId))
  }

  // Build the inbound message body. Lead with a scannable first line so the
  // inbox list preview reads "New appointment request …" at a glance, then the
  // structured details, then the patient's own note (if any).
  const lines = ['New appointment request via the website.']
  if (reason) lines.push(`Looking for: ${reason}`)
  if (preferred) lines.push(`Preferred times: ${preferred}`)
  if (note) lines.push('', note)
  const body = lines.join('\n')

  // Record as an INBOUND message (channel=email → the reply composer defaults
  // to the email the patient just gave us). This also fires the owner/admin
  // notification + bumps the inbox unread badge (see recordInboundMessage).
  await recordInboundMessage({
    organizationId: orgId,
    patientId,
    body,
    channel: 'email',
  })
}

export async function listBookingSlots(
  orgId: string,
  dateIso: string,
  durationMinutes?: number,
): Promise<SlotsForDay> {
  if (!orgId || !dateIso) return { slots: [], closedReason: 'invalid_hours' }
  // The booking UI sends the patient's selected calendar day as 'YYYY-MM-DD',
  // interpreted in the CLINIC's timezone server-side. Tolerate a full ISO from
  // a stale client (pre-deploy) by converting to a Date. The visit duration
  // makes the slot check span the whole appointment against the clinic's chairs.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return getSlotsForDay(orgId, dateIso, undefined, durationMinutes)
  }
  const date = new Date(dateIso)
  if (isNaN(date.getTime())) return { slots: [], closedReason: 'invalid_hours' }
  return getSlotsForDay(orgId, date, undefined, durationMinutes)
}

/**
 * Confirmation payload returned to the booking widget so the success screen can
 * render the booked details, a maps link, an inline "Add to calendar" .ics, and
 * (when the clinic has one) a "fill out your intake form now" CTA. Email-less
 * (phone-only) bookers get this same on-screen artifact — it's their only
 * record, since no confirmation email is sent.
 */
export interface BookingConfirmation {
  patientName: string
  clinicName: string
  clinicPhone: string | null
  /** Absolute instant of the visit start (the client renders it in the clinic's zone). */
  startTimeIso: string
  /** Absolute instant of the visit end. */
  endTimeIso: string
  /** IANA timezone the visit is scheduled in, so the screen labels match the email. */
  timeZone: string
  /** Human visit-type label, e.g. "Cleaning". */
  visitTypeLabel: string
  /** One-line address for display + the .ics LOCATION (null when unset). */
  addressText: string | null
  /** Google Maps directions deep link (null when no address). */
  mapsUrl: string | null
  /** Public intake-form URL when the clinic has a default form (null otherwise). */
  intakeFormUrl: string | null
  /** Whether a confirmation email was sent (false for phone-only bookers). */
  emailSent: boolean
}

/** Title-case a visit-type id into a display label ("root_canal" → "Root canal"). */
function visitTypeLabelFromId(id: string): string {
  const spaced = id.replace(/_/g, ' ').trim()
  if (!spaced) return 'Visit'
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export async function submitBookingRequest(formData: FormData): Promise<BookingConfirmation> {
  const slug = formData.get('slug')?.toString()
  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const phone = formData.get('phone')?.toString().trim() || null
  const appointmentType = formData.get('type')?.toString() || 'checkup'
  const startTimeRaw = formData.get('startTime')?.toString()
  const notesRaw = formData.get('notes')?.toString().trim() || ''

  // Optional front-desk-context questions (NexHealth-style). Both optional, no
  // schema — they ride the appointment notes as labelled lines so the front
  // desk sees them without a new column. `__skip__`/empty are ignored.
  const visitedBefore = formData.get('visitedBefore')?.toString().trim() || ''
  const hasInsurance = formData.get('hasInsurance')?.toString().trim() || ''
  const contextLines: string[] = []
  if (visitedBefore === 'new') contextLines.push('New patient (first visit)')
  else if (visitedBefore === 'returning') contextLines.push('Returning patient')
  if (hasInsurance === 'yes') contextLines.push('Has dental insurance')
  else if (hasInsurance === 'no') contextLines.push('No dental insurance')
  else if (hasInsurance === 'unsure') contextLines.push('Unsure about dental insurance')
  const notes = [...contextLines, notesRaw].filter(Boolean).join('\n') || null

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

  // Silent spam drop — a filled honeypot or instant submit books nothing but
  // returns a benign confirmation shape so bots get no signal. (Real bots
  // rarely clear the live slot-availability check below anyway; this is a
  // cheap first gate.)
  if (looksLikeBot(formData)) {
    const [p] = await db
      .select({ displayName: clinicProfile.displayName, phone: clinicProfile.phone, timezone: clinicProfile.timezone })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, orgId))
      .limit(1)
    const start = new Date(startTimeRaw)
    const startIso = isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString()
    return {
      patientName: `${firstName} ${lastName}`.trim(),
      clinicName: p?.displayName ?? 'our office',
      clinicPhone: p?.phone ?? null,
      startTimeIso: startIso,
      endTimeIso: startIso,
      timeZone: p?.timezone ?? 'America/New_York',
      visitTypeLabel: visitTypeLabelFromId(appointmentType),
      addressText: null,
      mapsUrl: null,
      intakeFormUrl: null,
      emailSent: false,
    }
  }

  const startTime = new Date(startTimeRaw)
  if (isNaN(startTime.getTime())) throw new Error('Invalid date/time')
  if (startTime.getTime() < Date.now()) throw new Error('Appointment must be in the future')

  // Resolve the visit-type duration from the clinic's catalog so the race-guard
  // checks the whole appointment window and endTime reflects the real length.
  const [vtRow] = await db
    .select({
      visitTypeSettings: clinicProfile.visitTypeSettings,
      selfBookingEnabled: clinicProfile.selfBookingEnabled,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  // If the clinic turned OFF self-scheduling after this tab loaded, never create
  // an appointment — the /book page already renders the request-a-visit form
  // when disabled, so reaching here means a stale tab or a replayed submit.
  if (vtRow?.selfBookingEnabled === false) {
    throw new Error(
      'Online booking isn’t available right now — please send your request and the office will reach out to schedule.',
    )
  }
  const durationMinutes = visitTypeDuration(vtRow?.visitTypeSettings ?? null, appointmentType)

  // Race-condition guard — between page load and submit, someone else
  // could have grabbed the same slot. Re-check against the live calendar
  // across the whole visit window (respecting the clinic's chair count).
  const stillFree = await isSlotAvailable(orgId, startTime, durationMinutes)
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

  // End time = start + the visit-type duration (falls back to one 30-min slot
  // for unknown types). Lets the schedule view + chair-aware conflict detection
  // both work off a correct visit length.
  const endTime = new Date(startTime.getTime() + Math.max(SLOT_MINUTES, durationMinutes) * 60_000)

  const apptId = randomUUID()
  // Atomic book: re-checks availability under an advisory lock before inserting,
  // so two patients submitting the same last-open slot can't both get it.
  const booked = await insertAppointmentIfSlotFree(orgId, startTime, durationMinutes, {
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
  if (!booked) {
    throw new Error('That slot is no longer available — please pick another time.')
  }

  // Two-way PMS: queue this public booking to be written to the clinic's PMS on
  // the next sync (best-effort; never blocks the booking confirmation).
  await queueAppointmentWriteBack(orgId, apptId)

  // Ping the front desk so a new online booking doesn't sit unseen until
  // someone opens the agenda. Best-effort — never blocks the booking.
  try {
    const dateLabel = startTime.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      orgId,
      {
        bucket: 'comments',
        type: 'online_booking',
        title: `New online booking — ${firstName} ${lastName}, ${dateLabel}`,
        body: `${appointmentType.replace(/_/g, ' ')} requested via your website.`,
        // Take them straight to the patient — their record shows this visit in
        // the timeline plus every way to follow up (message, confirm, rebook).
        linkPath: `/patients/${patientId}`,
        linkLabel: `View ${firstName}’s record →`,
        meta: { appointmentId: apptId, patientId },
      },
      { roles: ['owner', 'admin'] },
    )
  } catch (err) {
    console.warn('[clinic-site] booking notification failed', err)
  }

  const [profile] = await db
    .select({
      email: clinicProfile.email,
      displayName: clinicProfile.displayName,
      phone: clinicProfile.phone,
      websiteDomain: clinicProfile.websiteDomain,
      addressLine1: clinicProfile.addressLine1,
      addressLine2: clinicProfile.addressLine2,
      city: clinicProfile.city,
      state: clinicProfile.state,
      postalCode: clinicProfile.postalCode,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  // Build the intake-form link when the clinic has a default form. Done once
  // (independent of email) so the on-screen success CTA can surface it even for
  // phone-only bookers — the on-screen artifact replaces the email they'll
  // never get.
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

  if (email) {
    sendBookingConfirmationEmail(
      email,
      {
        patientName: `${firstName} ${lastName}`,
        clinicName: sender.name,
        clinicPhone: profile?.phone ?? null,
        startTime,
        appointmentType,
        intakeFormUrl,
        timeZone: sender.timeZone,
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

  // One-line address for display + the .ics LOCATION, and a directions deep
  // link. Hides cleanly when the clinic hasn't set an address.
  const addressText =
    [profile?.addressLine1, profile?.addressLine2, profile?.city, profile?.state, profile?.postalCode]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(', ') || null
  const mapsUrl = addressText
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`
    : null

  return {
    patientName: `${firstName} ${lastName}`,
    clinicName: sender.name,
    clinicPhone: profile?.phone ?? null,
    startTimeIso: startTime.toISOString(),
    endTimeIso: endTime.toISOString(),
    timeZone: sender.timeZone,
    visitTypeLabel: visitTypeLabelFromId(appointmentType),
    addressText,
    mapsUrl,
    intakeFormUrl,
    emailSent: Boolean(email),
  }
}
