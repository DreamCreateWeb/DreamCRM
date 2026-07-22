import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { authEmailShell, deliver } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { insertAppointmentIfSlotFree } from '@/lib/services/booking'
import { queueAppointmentStatusWriteBack, queueCommLogWriteBack } from '@/lib/services/pms'
import { DEFAULT_VISIT_TYPES } from '@/lib/types/visit-types'

/**
 * Fast-pass waitlist (ASAP list) — patients who want an EARLIER opening.
 *
 * Loop: staff (or the patient, from the portal) put a patient on the list →
 * a cancellation frees a slot → matching entries get a one-click claim email
 * (clinic sender, clinic wall-clock; SMS-ready later) → FIRST claim wins the
 * slot through the same advisory-lock insert the public widget uses → the
 * claimer's old visit (if linked) is released and its slot re-offered to the
 * rest of the list. Sibling offers flip to 'lost'.
 *
 * Every mechanic here is the table-stakes version of NexHealth's Waitlist /
 * Lighthouse's Fill-in — see docs/COMPETITIVE-GAPS.md §1.
 */

/** Don't offer slots starting sooner than this — nobody can make it. */
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000
/** Cap the blast per freed slot (first-click-wins makes more pointless). */
const MAX_OFFERS_PER_SLOT = 20

export interface WaitlistEntryView {
  id: string
  patientId: string
  patientName: string
  patientEmail: string | null
  visitType: string | null
  visitTypeLabel: string
  providerId: string | null
  providerName: string | null
  /** The linked visit they'd move up from (null = wants any opening). */
  currentVisitAt: Date | null
  source: string
  createdAt: Date
  /** Pending offers currently out for this entry. */
  pendingOffers: number
}

const TYPE_LABELS = new Map(DEFAULT_VISIT_TYPES.map((v) => [v.id, v.label]))

function visitTypeLabel(t: string | null): string {
  if (!t) return 'Any visit'
  return TYPE_LABELS.get(t) ?? t.replace(/_/g, ' ')
}

/** Active fast-pass entries for the org, soonest-added first. */
export async function listWaitlist(organizationId: string): Promise<WaitlistEntryView[]> {
  const rows = await db
    .select({
      id: schema.appointmentWaitlist.id,
      patientId: schema.appointmentWaitlist.patientId,
      visitType: schema.appointmentWaitlist.visitType,
      providerId: schema.appointmentWaitlist.providerId,
      appointmentId: schema.appointmentWaitlist.appointmentId,
      source: schema.appointmentWaitlist.source,
      createdAt: schema.appointmentWaitlist.createdAt,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      providerName: schema.clinicProvider.displayName,
      currentVisitAt: schema.appointment.startTime,
    })
    .from(schema.appointmentWaitlist)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointmentWaitlist.patientId))
    .leftJoin(schema.clinicProvider, eq(schema.clinicProvider.id, schema.appointmentWaitlist.providerId))
    .leftJoin(schema.appointment, eq(schema.appointment.id, schema.appointmentWaitlist.appointmentId))
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.status, 'active'),
      ),
    )
    .orderBy(asc(schema.appointmentWaitlist.createdAt))

  const ids = rows.map((r) => r.id)
  const pendingByEntry = new Map<string, number>()
  if (ids.length > 0) {
    const offers = await db
      .select({ waitlistId: schema.appointmentWaitlistOffer.waitlistId })
      .from(schema.appointmentWaitlistOffer)
      .where(
        and(
          eq(schema.appointmentWaitlistOffer.organizationId, organizationId),
          inArray(schema.appointmentWaitlistOffer.waitlistId, ids),
          eq(schema.appointmentWaitlistOffer.status, 'pending'),
        ),
      )
    for (const o of offers) pendingByEntry.set(o.waitlistId, (pendingByEntry.get(o.waitlistId) ?? 0) + 1)
  }

  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.firstName} ${r.lastName}`.trim(),
    patientEmail: r.email,
    visitType: r.visitType,
    visitTypeLabel: visitTypeLabel(r.visitType),
    providerId: r.providerId,
    providerName: r.providerName ?? null,
    currentVisitAt: (r.currentVisitAt as Date | null) ?? null,
    source: r.source,
    createdAt: r.createdAt as Date,
    pendingOffers: pendingByEntry.get(r.id) ?? 0,
  }))
}

/** Count of active entries (agenda header chip). */
export async function countWaitlist(organizationId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.appointmentWaitlist.id })
    .from(schema.appointmentWaitlist)
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.status, 'active'),
      ),
    )
  return rows.length
}

/**
 * Add a patient to the fast-pass list. One ACTIVE entry per patient — a
 * second add updates the existing entry (type/provider/linked visit) instead
 * of stacking duplicates.
 */
export async function addToWaitlist(
  organizationId: string,
  input: {
    patientId: string
    visitType?: string | null
    providerId?: string | null
    appointmentId?: string | null
    source?: 'staff' | 'portal'
  },
): Promise<{ id: string; updated: boolean }> {
  // Patient must belong to the org (tenant scoping).
  const [p] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, input.patientId)))
    .limit(1)
  if (!p) throw new Error('Patient not found.')

  const [existing] = await db
    .select({ id: schema.appointmentWaitlist.id })
    .from(schema.appointmentWaitlist)
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.patientId, input.patientId),
        eq(schema.appointmentWaitlist.status, 'active'),
      ),
    )
    .limit(1)

  if (existing) {
    await db
      .update(schema.appointmentWaitlist)
      .set({
        visitType: input.visitType ?? null,
        providerId: input.providerId ?? null,
        appointmentId: input.appointmentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.appointmentWaitlist.id, existing.id))
    return { id: existing.id, updated: true }
  }

  const id = newId('wait')
  await db.insert(schema.appointmentWaitlist).values({
    id,
    organizationId,
    patientId: input.patientId,
    visitType: input.visitType ?? null,
    providerId: input.providerId ?? null,
    appointmentId: input.appointmentId ?? null,
    source: input.source ?? 'staff',
  })
  return { id, updated: false }
}

/** Remove an entry (staff action, or the patient changed their mind). */
export async function removeFromWaitlist(organizationId: string, waitlistId: string): Promise<void> {
  await db
    .update(schema.appointmentWaitlist)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.id, waitlistId),
      ),
    )
}

/** True when this patient already has an active entry (drives the portal CTA). */
export async function hasActiveWaitlistEntry(organizationId: string, patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.appointmentWaitlist.id })
    .from(schema.appointmentWaitlist)
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.patientId, patientId),
        eq(schema.appointmentWaitlist.status, 'active'),
      ),
    )
    .limit(1)
  return !!row
}

/**
 * A cancellation freed a slot — offer it to matching fast-pass entries.
 * Matching: visit type equal (or entry says "any"), provider equal (or entry
 * says "anyone" / the slot has none), never the patient who just cancelled,
 * and — when the entry is linked to an existing visit — only slots EARLIER
 * than that visit (a fast pass moves you up, never later).
 *
 * Best-effort by design: callers fire-and-forget; a failure never blocks the
 * cancellation. Demo orgs create NO offers (the seeded showcase stands in;
 * we never email personas). Returns how many offers went out (staff toast).
 */
export async function offerFreedSlot(
  organizationId: string,
  slot: {
    start: Date
    end: Date | null
    providerId: string | null
    visitType: string
    freedByAppointmentId: string
    /** The patient whose cancellation freed the slot — never offered back. */
    excludePatientId: string | null
  },
): Promise<number> {
  const now = new Date()
  if (slot.start.getTime() - now.getTime() < MIN_NOTICE_MS) return 0

  // Demo orgs: never send (personas aren't real inboxes) — the seeded
  // showcase covers the UI states.
  const [org] = await db
    .select({ isDemo: schema.organization.isDemo })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  if (org?.isDemo) return 0

  const entries = await db
    .select({
      id: schema.appointmentWaitlist.id,
      patientId: schema.appointmentWaitlist.patientId,
      appointmentId: schema.appointmentWaitlist.appointmentId,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
      currentVisitAt: schema.appointment.startTime,
    })
    .from(schema.appointmentWaitlist)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointmentWaitlist.patientId))
    .leftJoin(schema.appointment, eq(schema.appointment.id, schema.appointmentWaitlist.appointmentId))
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, organizationId),
        eq(schema.appointmentWaitlist.status, 'active'),
        // Type: entry wants this type, or any.
        or(
          isNull(schema.appointmentWaitlist.visitType),
          eq(schema.appointmentWaitlist.visitType, slot.visitType),
        ),
        // Provider: entry is happy with anyone, or the slot's provider matches.
        // (A slot with no provider matches everyone.)
        slot.providerId
          ? or(
              isNull(schema.appointmentWaitlist.providerId),
              eq(schema.appointmentWaitlist.providerId, slot.providerId),
            )
          : undefined,
        slot.excludePatientId
          ? ne(schema.appointmentWaitlist.patientId, slot.excludePatientId)
          : undefined,
      ),
    )
    .orderBy(asc(schema.appointmentWaitlist.createdAt))

  const candidates = entries.filter((e) => {
    if (!e.email) return false // email is the only channel today (SMS later)
    // Linked visit → the slot must actually be EARLIER (fast pass moves you
    // up, never later).
    const current = (e.currentVisitAt as Date | null) ?? null
    if (current && slot.start.getTime() >= current.getTime()) return false
    return true
  })
  if (candidates.length === 0) return 0

  const sender = await getClinicSenderIdentity(organizationId)
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'
  const when = formatClinicDayTime(slot.start, sender.timeZone)
  const typeLabel = visitTypeLabel(slot.visitType)

  let sent = 0
  for (const e of candidates.slice(0, MAX_OFFERS_PER_SLOT)) {
    const token = `wo_${randomBytes(18).toString('base64url')}`
    await db.insert(schema.appointmentWaitlistOffer).values({
      id: newId('woff'),
      organizationId,
      waitlistId: e.id,
      patientId: e.patientId,
      slotStart: slot.start,
      slotEnd: slot.end,
      providerId: slot.providerId,
      visitType: slot.visitType,
      freedByAppointmentId: slot.freedByAppointmentId,
      token,
      status: 'pending',
      sentAt: new Date(),
    })
    try {
      await deliver({
        to: e.email!,
        from: sender.from,
        replyTo: sender.replyTo,
        gmail: sender.gmail,
        subject: `An earlier opening at ${sender.name} — ${when}`,
        html: authEmailShell({
          heading: 'An earlier time just opened up',
          introHtml: `Hi ${e.firstName},<br><br>You asked us to keep an eye out — a <strong>${typeLabel.toLowerCase()}</strong> slot on <strong>${when}</strong> just opened at ${sender.name}. First come, first served: tap below and it's yours${
            e.currentVisitAt ? ' (we’ll move your existing visit automatically)' : ''
          }.`,
          buttonUrl: `${base}/w/${token}`,
          buttonLabel: 'Claim this time',
          footnoteHtml:
            'If the time doesn’t work, just ignore this — your spot on the list is safe and we’ll keep looking.',
        }),
      })
      sent++
    } catch (err) {
      console.warn('[waitlist] offer email failed', { organizationId, waitlistId: e.id, err })
    }
  }
  return sent
}

// ── One-click claim (public, token-auth) ────────────────────────────────────

export interface OfferView {
  status: 'pending' | 'claimed' | 'lost' | 'expired'
  clinicName: string
  brandColor: string | null
  logoUrl: string | null
  clinicPhone: string | null
  slug: string | null
  patientFirstName: string
  slotStart: Date
  visitTypeLabel: string
  providerName: string | null
  timeZone: string
}

/** Load an offer for the public claim page. Null = unknown token (404). */
export async function getOfferByToken(token: string): Promise<OfferView | null> {
  const [row] = await db
    .select({
      id: schema.appointmentWaitlistOffer.id,
      organizationId: schema.appointmentWaitlistOffer.organizationId,
      status: schema.appointmentWaitlistOffer.status,
      slotStart: schema.appointmentWaitlistOffer.slotStart,
      visitType: schema.appointmentWaitlistOffer.visitType,
      providerName: schema.clinicProvider.displayName,
      firstName: schema.patient.firstName,
    })
    .from(schema.appointmentWaitlistOffer)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointmentWaitlistOffer.patientId))
    .leftJoin(schema.clinicProvider, eq(schema.clinicProvider.id, schema.appointmentWaitlistOffer.providerId))
    .where(eq(schema.appointmentWaitlistOffer.token, token))
    .limit(1)
  if (!row) return null

  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
      phone: schema.clinicProfile.phone,
      timezone: schema.clinicProfile.timezone,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, row.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, row.organizationId))
    .limit(1)

  // A pending offer whose slot already started is expired in practice.
  const status =
    row.status === 'pending' && (row.slotStart as Date).getTime() < Date.now()
      ? 'expired'
      : (row.status as OfferView['status'])

  return {
    status,
    clinicName: profile?.displayName || org?.name || 'Your clinic',
    brandColor: profile?.brandColor ?? null,
    logoUrl: profile?.logoUrl ?? null,
    clinicPhone: profile?.phone ?? null,
    slug: org?.slug ?? null,
    patientFirstName: row.firstName,
    slotStart: row.slotStart as Date,
    visitTypeLabel: visitTypeLabel(row.visitType),
    providerName: row.providerName ?? null,
    timeZone: profile?.timezone?.trim() || 'America/New_York',
  }
}

/**
 * First-click-wins claim. Books the slot through the same advisory-lock
 * insert the public widget uses (double-booking impossible), releases the
 * claimer's old linked visit (and re-offers ITS slot to the rest of the
 * list), marks sibling offers lost, and confirms to patient + staff.
 */
export async function claimOffer(
  token: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'taken' | 'expired' }> {
  const [offer] = await db
    .select()
    .from(schema.appointmentWaitlistOffer)
    .where(eq(schema.appointmentWaitlistOffer.token, token))
    .limit(1)
  if (!offer) return { ok: false, reason: 'not_found' }
  if (offer.status === 'claimed') return { ok: true } // idempotent re-click
  if (offer.status !== 'pending') return { ok: false, reason: 'taken' }
  const slotStart = offer.slotStart as Date
  if (slotStart.getTime() < Date.now()) {
    await db
      .update(schema.appointmentWaitlistOffer)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(schema.appointmentWaitlistOffer.id, offer.id))
    return { ok: false, reason: 'expired' }
  }

  const [entry] = await db
    .select()
    .from(schema.appointmentWaitlist)
    .where(eq(schema.appointmentWaitlist.id, offer.waitlistId))
    .limit(1)

  const slotEnd = (offer.slotEnd as Date | null) ?? new Date(slotStart.getTime() + 30 * 60 * 1000)
  const durationMinutes = Math.max(15, Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000))

  const newApptId = newId('appt')
  const booked = await insertAppointmentIfSlotFree(offer.organizationId, slotStart, durationMinutes, {
    id: newApptId,
    organizationId: offer.organizationId,
    patientId: offer.patientId,
    providerId: offer.providerId,
    title: visitTypeLabel(offer.visitType),
    startTime: slotStart,
    endTime: slotEnd,
    type: offer.visitType,
    status: 'confirmed', // they just actively claimed it — that IS a confirmation
    confirmedAt: new Date(),
    confirmedVia: 'email',
    source: 'waitlist',
    rescheduledFromAppointmentId: entry?.appointmentId ?? null,
  })
  if (!booked) {
    await db
      .update(schema.appointmentWaitlistOffer)
      .set({ status: 'lost', updatedAt: new Date() })
      .where(eq(schema.appointmentWaitlistOffer.id, offer.id))
    return { ok: false, reason: 'taken' }
  }

  // Mark this offer claimed + the entry fulfilled.
  await db
    .update(schema.appointmentWaitlistOffer)
    .set({ status: 'claimed', claimedAt: new Date(), claimedAppointmentId: newApptId, updatedAt: new Date() })
    .where(eq(schema.appointmentWaitlistOffer.id, offer.id))
  await db
    .update(schema.appointmentWaitlist)
    .set({ status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.appointmentWaitlist.id, offer.waitlistId))

  // Sibling offers for the SAME freed slot → lost (someone was faster).
  if (offer.freedByAppointmentId) {
    await db
      .update(schema.appointmentWaitlistOffer)
      .set({ status: 'lost', updatedAt: new Date() })
      .where(
        and(
          eq(schema.appointmentWaitlistOffer.organizationId, offer.organizationId),
          eq(schema.appointmentWaitlistOffer.freedByAppointmentId, offer.freedByAppointmentId),
          eq(schema.appointmentWaitlistOffer.status, 'pending'),
        ),
      )
  }

  // PMS: the claim is a new booking.
  try {
    const { queueAppointmentWriteBack } = await import('@/lib/services/pms')
    await queueAppointmentWriteBack(offer.organizationId, newApptId)
  } catch (err) {
    console.warn('[waitlist] PMS write-back failed', err)
  }

  // Release the old linked visit (their vacated slot goes back to the list —
  // WITHOUT the usual "your visit was cancelled" patient email; the claim
  // confirmation covers the story).
  const oldApptId = entry?.appointmentId ?? null
  if (oldApptId) {
    const [oldAppt] = await db
      .select({
        startTime: schema.appointment.startTime,
        endTime: schema.appointment.endTime,
        providerId: schema.appointment.providerId,
        type: schema.appointment.type,
        status: schema.appointment.status,
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, offer.organizationId),
          eq(schema.appointment.id, oldApptId),
        ),
      )
      .limit(1)
    if (oldAppt && (oldAppt.status === 'scheduled' || oldAppt.status === 'confirmed')) {
      await db
        .update(schema.appointment)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancelledVia: 'waitlist_claim', updatedAt: new Date() })
        .where(eq(schema.appointment.id, oldApptId))
      await queueAppointmentStatusWriteBack(offer.organizationId, oldApptId, 'cancelled').catch(() => {})
      // Their vacated slot is now free — offer it onward (excluding them).
      offerFreedSlot(offer.organizationId, {
        start: oldAppt.startTime as Date,
        end: (oldAppt.endTime as Date | null) ?? null,
        providerId: oldAppt.providerId ?? null,
        visitType: oldAppt.type,
        freedByAppointmentId: oldApptId,
        excludePatientId: offer.patientId,
      }).catch(() => {})
    }
  }

  // Confirmation email + comm-log (the shared booking-confirmation path).
  try {
    const { sendBookingConfirmation } = await import('@/lib/services/booking-confirmation')
    await sendBookingConfirmation({
      organizationId: offer.organizationId,
      patientId: offer.patientId,
      appointmentType: offer.visitType,
      startTime: slotStart,
    })
  } catch (err) {
    console.warn('[waitlist] claim confirmation failed', err)
  }
  // Staff heads-up.
  try {
    const [p] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(eq(schema.patient.id, offer.patientId))
      .limit(1)
    const name = p ? `${p.firstName} ${p.lastName}`.trim() : 'A patient'
    const sender = await getClinicSenderIdentity(offer.organizationId)
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      offer.organizationId,
      {
        bucket: 'comments',
        type: 'waitlist_claimed',
        title: `Fast-pass filled — ${name}`,
        body: `${name} claimed the open ${visitTypeLabel(offer.visitType).toLowerCase()} slot on ${formatClinicDayTime(slotStart, sender.timeZone)}.`,
        linkPath: `/appointments?appt=${newApptId}`,
        meta: { appointmentId: newApptId, patientId: offer.patientId },
      },
      // The claiming patient never gets the staff alert about their own claim.
      { roles: ['owner', 'admin'], excludeEmail: p?.email ?? null },
    )
  } catch (err) {
    console.warn('[waitlist] staff notification failed', err)
  }
  // Mirror into the PMS comm log.
  queueCommLogWriteBack(offer.organizationId, offer.patientId, {
    note: `Fast-pass: claimed the freed ${visitTypeLabel(offer.visitType).toLowerCase()} slot — booked + confirmed via one-click email link.`,
    mode: 'Email',
  }).catch(() => {})

  return { ok: true }
}
