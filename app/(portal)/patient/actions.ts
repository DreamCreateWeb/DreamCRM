'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appointment, patient } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import { visitTypeDuration } from '@/lib/types/visit-types'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  getAccessiblePatientIds,
  getVisitForPatients,
  sendMessageFromPatient,
} from '@/lib/services/patient-portal'
import {
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from '@/lib/services/appointments'
import { getSlotsForDay, isSlotAvailable, insertAppointmentIfSlotFree, SLOT_MINUTES, type SlotsForDay } from '@/lib/services/booking'
import { addToWaitlist } from '@/lib/services/appointment-waitlist'
import { proposePaymentPlan } from '@/lib/services/payment-plans'
import { paymentPlan, npsResponse } from '@/lib/db/schema/clinic'
import { recordNpsScore, recordNpsComment } from '@/lib/services/nps'
import { queueAppointmentWriteBack } from '@/lib/services/pms'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { sendBookingConfirmation } from '@/lib/services/booking-confirmation'
import { notifyOrgMembers } from '@/lib/services/notifications'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'
import { sanitizeAttachments, type MessageAttachment } from '@/lib/types/messaging'

/**
 * Patient-side server actions for the portal. Every action:
 *   1. resolves the tenant and requires a patient context,
 *   2. scopes the target to the signed-in patient (+ linked dependents
 *      when family access is on),
 *   3. enforces the clinic's portal settings (feature flags + notice
 *      windows) server-side — the UI hides what's off, but the action is
 *      the real gate.
 *
 * Mutations reuse the same lifecycle services the front desk uses, so the
 * PMS write-back queue, terminal-state guards, and audit timestamps behave
 * identically regardless of who initiated the change.
 */

export type PortalActionResult = { ok: true } | { ok: false; error: string }

const HOUR_MS = 3_600_000

async function requirePatient(): Promise<TenantContext & { patientId: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    throw new Error('Only patients can use the portal')
  }
  return ctx as TenantContext & { patientId: string }
}

function revalidateVisits() {
  revalidatePath('/patient/dashboard')
  revalidatePath('/patient/appointments')
}

/** Slot lookup for the portal book + reschedule pickers. Read-only. */
export async function getPortalSlotsAction(dateKey: string): Promise<SlotsForDay> {
  const ctx = await requirePatient()
  return getSlotsForDay(ctx.organizationId, dateKey)
}

export async function confirmMyVisitAction(visitId: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled') return { ok: false, error: 'This visit doesn’t need confirming.' }

  try {
    await confirmAppointment(ctx.organizationId, visitId, 'portal')
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidateVisits()
  return { ok: true }
}

export async function cancelMyVisitAction(visitId: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.reschedule) {
    return { ok: false, error: 'Online cancellation isn’t available — give us a call and we’ll take care of it.' }
  }
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
    return { ok: false, error: 'This visit can’t be cancelled online.' }
  }

  const noticeMs = settings.reschedule.minNoticeHours * HOUR_MS
  if (visit.startTime.getTime() - Date.now() < noticeMs) {
    return {
      ok: false,
      error: `This visit is less than ${settings.reschedule.minNoticeHours} hours away — give us a quick call and we’ll sort it out together.`,
    }
  }

  try {
    await cancelAppointment(ctx.organizationId, visitId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidateVisits()
  return { ok: true }
}

/**
 * "Notify me if something opens sooner" — self-enroll on the fast-pass
 * waitlist for an upcoming visit. Idempotent (re-joining refreshes the
 * existing entry); the same waitlist the front desk works from, so a slot
 * opening reaches portal joiners exactly like staff-added ones.
 */
export async function joinMyWaitlistAction(visitId: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.waitlist) {
    return { ok: false, error: 'The waitlist isn’t available online — give us a call and we’ll add you.' }
  }
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
    return { ok: false, error: 'This visit can’t join the waitlist.' }
  }
  if (visit.startTime.getTime() <= Date.now()) {
    return { ok: false, error: 'This visit has already started.' }
  }
  try {
    await addToWaitlist(ctx.organizationId, {
      patientId: visit.patientId,
      visitType: visit.type ?? null,
      providerId: visit.providerId ?? null,
      appointmentId: visit.id,
      source: 'portal',
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidateVisits()
  return { ok: true }
}

export async function rescheduleMyVisitAction(
  visitId: string,
  newStartIso: string,
): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.reschedule) {
    return { ok: false, error: 'Online rescheduling isn’t available — give us a call and we’ll find you a time.' }
  }
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
    return { ok: false, error: 'This visit can’t be moved online.' }
  }

  const noticeMs = settings.reschedule.minNoticeHours * HOUR_MS
  if (visit.startTime.getTime() - Date.now() < noticeMs) {
    return {
      ok: false,
      error: `This visit is less than ${settings.reschedule.minNoticeHours} hours away — give us a quick call and we’ll sort it out together.`,
    }
  }

  const newStart = new Date(newStartIso)
  if (isNaN(newStart.getTime()) || newStart.getTime() <= Date.now()) {
    return { ok: false, error: 'Pick a time in the future.' }
  }
  // The NEW slot must also respect the clinic's notice window — otherwise a
  // patient could move a far-off visit into a slot two hours from now, which
  // the front desk can't staff. Mirrors booking's min-notice on the new time
  // (the SlotPicker filters these client-side too; this is the real gate).
  if (newStart.getTime() < Date.now() + noticeMs) {
    return {
      ok: false,
      error: `Pick a time at least ${settings.reschedule.minNoticeHours} hours out — for anything sooner, give us a quick call.`,
    }
  }
  // The new slot must be a real opening (ignore the visit being moved so its
  // current time still counts as available).
  const { slots } = await getSlotsForDay(ctx.organizationId, newStart, visitId)
  const targetIso = newStart.toISOString()
  const free = slots.some((s) => s.startIso === targetIso && s.available)
  if (!free) return { ok: false, error: 'That time was just taken — pick another one.' }

  try {
    await rescheduleAppointment({
      organizationId: ctx.organizationId,
      appointmentId: visitId,
      newStartTime: newStart,
      newEndTime: null, // preserve original duration
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  // Same confirmation email a fresh booking gets — the patient ends up with
  // the new time in writing without us inventing a new template.
  await sendBookingConfirmation({
    organizationId: ctx.organizationId,
    patientId: visit.patientId,
    appointmentType: visit.type,
    startTime: newStart,
  })

  // Ping the front desk so a patient-initiated change doesn't slip past them.
  const reName = await patientDisplayName(ctx.organizationId, visit.patientId)
  await notifyOrgMembers(
    ctx.organizationId,
    {
      bucket: 'comments',
      type: 'portal_reschedule',
      title: 'Visit rescheduled by patient',
      body: `${reName} moved their visit to ${await fmtNotifyDate(ctx.organizationId, newStart)}.`,
      linkPath: '/appointments',
    },
    { roles: ['owner', 'admin'] },
  )

  revalidateVisits()
  return { ok: true }
}

export async function bookMyVisitAction(formData: FormData): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.booking) {
    return { ok: false, error: 'Online booking isn’t available — give us a call and we’ll find you a time.' }
  }

  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  // Booking for self by default; a guardian may book for a linked dependent.
  const forPatientId = formData.get('forPatientId')?.toString() || ctx.patientId
  if (!allowed.includes(forPatientId)) {
    return { ok: false, error: 'You can only book for yourself or your linked family members.' }
  }

  const type = formData.get('type')?.toString() || ''
  if (!settings.booking.allowedTypes.includes(type)) {
    return { ok: false, error: 'That visit type can’t be booked online — give us a call and we’ll set it up.' }
  }

  const startTimeRaw = formData.get('startTime')?.toString()
  const startTime = startTimeRaw ? new Date(startTimeRaw) : null
  if (!startTime || isNaN(startTime.getTime())) return { ok: false, error: 'Pick a time for your visit.' }
  if (startTime.getTime() < Date.now() + settings.booking.minNoticeHours * HOUR_MS) {
    return { ok: false, error: 'That time is too soon to book online — pick a later slot or give us a call.' }
  }

  // Resolve the visit-type duration from the clinic's catalog so the race-guard
  // checks the whole appointment window and endTime reflects the real length
  // (mirrors the public + front-desk booking paths; wave 1 left this at +30min).
  const [vtRow] = await db
    .select({
      visitTypeSettings: clinicProfile.visitTypeSettings,
      selfBookingEnabled: clinicProfile.selfBookingEnabled,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  // Clinic-wide self-scheduling switch (separate from the portal feature
  // toggle): when off, the portal surfaces "Request a visit" instead — so a
  // booking write here means a stale tab. Don't create the appointment.
  if (vtRow?.selfBookingEnabled === false) {
    return { ok: false, error: 'Online booking is turned off — send a request and the office will reach out to schedule.' }
  }
  const durationMinutes = visitTypeDuration(vtRow?.visitTypeSettings ?? null, type)

  const free = await isSlotAvailable(ctx.organizationId, startTime, durationMinutes)
  if (!free) return { ok: false, error: 'That time was just taken — pick another one.' }

  const notes = formData.get('notes')?.toString().trim() || ''
  // The comfort question — Tend-style "positive anticipation". Lands in the
  // visit notes so the front desk actually sees it.
  const comfort = formData.get('comfort')?.toString().trim() || ''
  const combinedNotes =
    [notes, comfort ? `Comfort note: ${comfort}` : ''].filter(Boolean).join('\n') || null

  // Agenda title carries the visit-holder's name — matters when a guardian
  // books for a dependent (the booker isn't the patient in the chair).
  const label = PORTAL_VISIT_LABELS[type] ?? 'Visit'
  const [forPatient] = await db
    .select({ firstName: patient.firstName, lastName: patient.lastName })
    .from(patient)
    .where(and(eq(patient.id, forPatientId), eq(patient.organizationId, ctx.organizationId)))
    .limit(1)
  const patientName = forPatient ? `${forPatient.firstName} ${forPatient.lastName}` : ctx.userName

  // End time = start + the visit-type duration (never shorter than one slot).
  const endTime = new Date(startTime.getTime() + Math.max(SLOT_MINUTES, durationMinutes) * 60_000)
  const apptId = randomUUID()
  // Atomic book — re-check under an advisory lock before insert (no double-book).
  const booked = await insertAppointmentIfSlotFree(ctx.organizationId, startTime, durationMinutes, {
    id: apptId,
    organizationId: ctx.organizationId,
    patientId: forPatientId,
    title: `${label} - ${patientName}`,
    startTime,
    endTime,
    type,
    status: 'scheduled',
    notes: combinedNotes,
    source: 'portal',
  })
  if (!booked) return { ok: false, error: 'That time was just taken — pick another one.' }

  await queueAppointmentWriteBack(ctx.organizationId, apptId)
  await sendBookingConfirmation({
    organizationId: ctx.organizationId,
    patientId: forPatientId,
    appointmentType: type,
    startTime,
  })

  // Let the front desk know a portal booking landed so it doesn't surprise
  // them on the schedule.
  await notifyOrgMembers(
    ctx.organizationId,
    {
      bucket: 'comments',
      type: 'portal_booking',
      title: 'Portal booking',
      body: `${patientName} booked ${label.toLowerCase()} for ${await fmtNotifyDate(ctx.organizationId, startTime)}.`,
      linkPath: '/appointments',
    },
    { roles: ['owner', 'admin'] },
  )

  revalidateVisits()
  return { ok: true }
}

/**
 * Request-only booking from the portal — the counterpart of bookMyVisitAction
 * for clinics that have turned OFF self-scheduling (Settings → Practice). No
 * slot is taken; instead the request lands as an INBOUND in-app message on the
 * patient's own thread (so the clinic's reply surfaces in their portal
 * Messages), and the front desk reaches out to set the time. Mirrors the public
 * website's submitAppointmentRequest, but the patient is already known (no
 * contact fields). A guardian may request for a linked dependent — the message
 * still threads to the GUARDIAN's record (the contact who'll read the reply),
 * with the dependent named in the body.
 */
export async function requestMyVisitAction(formData: FormData): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  // The portal booking surface only exists when features.booking is on; its
  // MODE (slot picker vs request) is the master self-scheduling switch.
  if (!settings.features.booking) {
    return { ok: false, error: 'Online requests aren’t available right now — give us a call and we’ll find you a time.' }
  }

  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const forPatientId = formData.get('forPatientId')?.toString() || ctx.patientId
  if (!allowed.includes(forPatientId)) {
    return { ok: false, error: 'You can only request for yourself or your linked family members.' }
  }

  // The visit-type picker submits the human LABEL (free text), like the website
  // request form, so the message reads naturally with no catalog lookup.
  const reason = formData.get('reason')?.toString().trim() || ''
  const preferred = formData.get('preferredTimes')?.toString().trim() || ''
  const note = formData.get('notes')?.toString().trim() || ''

  // Name the dependent in the body when a guardian requests for someone else.
  let forName = ''
  if (forPatientId !== ctx.patientId) {
    const [dep] = await db
      .select({ firstName: patient.firstName })
      .from(patient)
      .where(and(eq(patient.id, forPatientId), eq(patient.organizationId, ctx.organizationId)))
      .limit(1)
    forName = dep?.firstName ?? ''
  }

  const lines = ['New appointment request via the patient portal.']
  if (forName) lines.push(`For: ${forName}`)
  if (reason) lines.push(`Looking for: ${reason}`)
  if (preferred) lines.push(`Preferred times: ${preferred}`)
  if (note) lines.push('', note)
  const body = lines.join('\n')

  // Thread to the LOGGED-IN patient so the clinic's reply reaches whoever can
  // read it (a dependent typically has no own login). sendMessageFromPatient
  // records the inbound in-app message + notifies owner/admin.
  await sendMessageFromPatient(ctx.organizationId, ctx.patientId, body)
  revalidatePath('/patient/messages')
  return { ok: true }
}

/**
 * "Request my records" from the portal Records page. A patient's right to a copy
 * of their chart/X-rays is universal (HIPAA), so there's no feature flag — but
 * the records themselves live in the clinic's PMS, not here. So we route the
 * request as an INBOUND in-app message: the front desk sees it in /messages,
 * replies in the patient's own portal thread, and mails/hands over the records
 * out-of-band. Turns the old passive "call us" card into a real, tracked ask.
 */
/**
 * "Split this into monthly payments" — the patient starts a payment plan on
 * their OWN full balance, right from Billing. Reuses the exact staff propose
 * path (floors, one-open-plan rule, Connect check, proposal email as a paper
 * trail), then routes them straight to the secure /i/[token] accept page
 * instead of making them wait for the email.
 */
export async function startMyPaymentPlanAction(
  installments: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.billing || !settings.features.payments) {
    return { ok: false, error: 'Payment plans aren’t available online — give us a call and we’ll set one up together.' }
  }
  const [me] = await db
    .select({ balance: patient.pmsBalanceCents })
    .from(patient)
    .where(and(eq(patient.organizationId, ctx.organizationId), eq(patient.id, ctx.patientId)))
    .limit(1)
  const totalCents = me?.balance ?? 0
  if (totalCents <= 0) return { ok: false, error: 'You don’t have a balance right now.' }

  const res = await proposePaymentPlan(
    ctx.organizationId,
    ctx.patientId,
    { totalCents, installments },
    ctx.userId,
  )
  if (!res.ok) return res
  const [plan] = await db
    .select({ token: paymentPlan.token })
    .from(paymentPlan)
    .where(and(eq(paymentPlan.organizationId, ctx.organizationId), eq(paymentPlan.id, res.planId)))
    .limit(1)
  if (!plan) return { ok: false, error: 'Something went wrong — try again.' }
  revalidatePath('/patient/invoices')
  return { ok: true, url: `/i/${plan.token}` }
}

/** Verify a survey token belongs to the logged-in patient (tenant + owner). */
async function myOwnSurvey(token: string): Promise<boolean> {
  const ctx = await requirePatient()
  const [row] = await db
    .select({ patientId: npsResponse.patientId })
    .from(npsResponse)
    .where(and(eq(npsResponse.token, token), eq(npsResponse.organizationId, ctx.organizationId)))
    .limit(1)
  return !!row && row.patientId === ctx.patientId
}

/**
 * One-tap post-visit rating from the dashboard card. Reuses the exact email-
 * survey recording path (same rows, same detractor escalation to the team) —
 * the only difference is the auth: logged-in ownership check instead of
 * token-IS-auth.
 */
export async function answerMySurveyAction(token: string, score: number): Promise<PortalActionResult> {
  if (!(await myOwnSurvey(token))) return { ok: false, error: 'We couldn’t find that survey.' }
  const ok = await recordNpsScore(token, score)
  if (!ok) return { ok: false, error: 'That didn’t save — try again.' }
  revalidatePath('/patient/dashboard')
  return { ok: true }
}

/** The optional follow-up comment (post-score). */
export async function commentMySurveyAction(token: string, comment: string): Promise<PortalActionResult> {
  if (!(await myOwnSurvey(token))) return { ok: false, error: 'We couldn’t find that survey.' }
  const ok = await recordNpsComment(token, comment)
  if (!ok) return { ok: false, error: 'That didn’t save — try again.' }
  return { ok: true }
}

export async function requestMyRecordsAction(): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const body = [
    'Records request via the patient portal.',
    '',
    'I’d like a copy of my records (X-rays included). Please let me know the best way to get them to me — thank you!',
  ].join('\n')
  try {
    await sendMessageFromPatient(ctx.organizationId, ctx.patientId, body)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidatePath('/patient/messages')
  return { ok: true }
}

/** Short "Mon, Jun 15, 2:00 PM" for staff notifications — at the CLINIC's
 *  wall-clock (this runs on the UTC server, so bare toLocaleString would
 *  print a shifted time). */
async function fmtNotifyDate(organizationId: string, d: Date): Promise<string> {
  return formatClinicDayTime(d, await getClinicTimeZone(organizationId))
}

/** First+last name of a patient in this org, for notification copy. */
async function patientDisplayName(organizationId: string, patientId: string): Promise<string> {
  const [p] = await db
    .select({ firstName: patient.firstName, lastName: patient.lastName })
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, organizationId)))
    .limit(1)
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'A patient'
}

export async function sendPortalMessageAction(
  body: string,
  attachments?: MessageAttachment[],
): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.messages) {
    return { ok: false, error: 'Messaging isn’t available — give us a call instead.' }
  }
  const trimmed = body.trim()
  const clean = sanitizeAttachments(attachments)
  if (!trimmed && clean.length === 0) return { ok: false, error: 'Write a message or add a photo first.' }
  if (trimmed.length > 5000) return { ok: false, error: 'That message is a little long — keep it under 5,000 characters.' }

  try {
    await sendMessageFromPatient(ctx.organizationId, ctx.patientId, trimmed, clean)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidatePath('/patient/messages')
  return { ok: true }
}

/**
 * Refer-a-friend: mint (or fetch) the signed-in patient's share link. Called
 * lazily from the dashboard share card's "Copy my link" button so a link row
 * only exists for patients who actually went to share.
 */
export async function getMyReferralLinkAction(): Promise<
  { ok: true; shareUrl: string } | { ok: false; error: string }
> {
  const ctx = await requirePatient()
  try {
    const { getOrCreateReferralLink } = await import('@/lib/services/patient-referrals')
    const link = await getOrCreateReferralLink(ctx.organizationId, ctx.patientId)
    return { ok: true, shareUrl: link.shareUrl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

/** Loyalty: trade points for a single-use shop discount code (the service
 *  re-checks the balance + program state — the card is just the messenger). */
export async function redeemMyPointsAction(): Promise<
  { ok: true; couponCode: string; valueCents: number } | { ok: false; error: string }
> {
  const ctx = await requirePatient()
  try {
    const { redeemLoyaltyPoints } = await import('@/lib/services/loyalty')
    const r = await redeemLoyaltyPoints(ctx.organizationId, ctx.patientId)
    if (!r.ok) return r
    revalidatePath('/patient/dashboard')
    return { ok: true, couponCode: r.couponCode, valueCents: r.valueCents }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}
