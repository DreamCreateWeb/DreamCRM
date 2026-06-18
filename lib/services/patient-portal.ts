import 'server-only'
import { and, eq, desc, gte, inArray, ne, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  patient,
  appointment,
  clinicProvider,
  shopOrder,
  shopOrderItem,
  membership,
  membershipPlan,
  formSubmission,
  formTemplate,
  patientBalancePayment,
} from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  findPatientThread,
  listMessagesInThread,
  recordInboundMessage,
  type ThreadMessage,
} from '@/lib/services/patient-messaging'
import { derivePatientRecallStatus, type RecallStatus } from '@/lib/services/recall-status'

export async function getMyPatientRecord(patientId: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function getMyUpcomingAppointments(patientId: string, organizationId: string) {
  return db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.patientId, patientId),
        eq(appointment.organizationId, organizationId),
        gte(appointment.startTime, new Date()),
        // A future-dated appointment that's cancelled or a no-show isn't
        // "upcoming" — don't show it on the dashboard as if the visit stands.
        ne(appointment.status, 'cancelled'),
        ne(appointment.status, 'no_show'),
      ),
    )
    .orderBy(appointment.startTime)
    .limit(10)
}

export async function getMyPastAppointments(patientId: string, organizationId: string) {
  return db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.patientId, patientId),
        eq(appointment.organizationId, organizationId),
      ),
    )
    .orderBy(desc(appointment.startTime))
    .limit(50)
}

// ── Bills ────────────────────────────────────────────────────────────
//
// The patient's view of "what they owe and what they bought":
//   • Dental balance — comes from the PMS (Open Dental) via
//     patient.pmsBalanceCents. DreamCRM is a CRM, NOT a billing system
//     for dental treatment — the source of truth lives in the PMS. We
//     surface the number as info; payment happens through the clinic's
//     existing flow (the clinic phones the patient or sends a statement
//     through OD). Hidden when no PMS connection has populated it.
//   • Active membership — from the `membership` table (shop module).
//     One per patient; we render plan name, benefits, and Stripe
//     Customer Portal link.
//   • Shop orders — purchase history from the storefront (whitening
//     kits, branded merch, etc). Includes line items + status.

export interface BillsMembership {
  id: string
  planName: string
  planBillingInterval: 'monthly' | 'annual' | string
  priceCents: number
  status: 'pending' | 'active' | 'past_due' | 'cancelled' | string
  currentPeriodEnd: Date | null
  benefits: Array<{ label: string; qty?: number }>
  benefitsUsed: Record<string, number>
}

export interface BillsOrderItem {
  productName: string
  variantName: string | null
  quantity: number
  unitPriceCents: number
}

export interface BillsOrder {
  id: string
  status: string
  fulfillmentStatus: string
  fulfillmentType: string
  totalCents: number
  trackingNumber: string | null
  createdAt: Date
  paidAt: Date | null
  items: BillsOrderItem[]
}

export interface PatientBills {
  pmsBalanceCents: number | null
  pmsBalanceUpdatedAt: Date | null
  membership: BillsMembership | null
  orders: BillsOrder[]
}

export async function getMyBills(
  patientId: string,
  organizationId: string,
): Promise<PatientBills> {
  const [patientRow] = await db
    .select({
      pmsBalanceCents: patient.pmsBalanceCents,
      pmsBalanceUpdatedAt: patient.pmsBalanceUpdatedAt,
    })
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, organizationId)))
    .limit(1)

  const [activeMembership] = await db
    .select({
      id: membership.id,
      planName: membershipPlan.name,
      planBillingInterval: membershipPlan.billingInterval,
      priceCents: membershipPlan.priceCents,
      status: membership.status,
      currentPeriodEnd: membership.currentPeriodEnd,
      benefits: membershipPlan.benefits,
      benefitsUsed: membership.benefitsUsed,
    })
    .from(membership)
    .innerJoin(membershipPlan, eq(membership.planId, membershipPlan.id))
    .where(
      and(
        eq(membership.patientId, patientId),
        eq(membership.organizationId, organizationId),
        ne(membership.status, 'cancelled'),
      ),
    )
    .orderBy(desc(membership.createdAt))
    .limit(1)

  const orderRows = await db
    .select({
      id: shopOrder.id,
      status: shopOrder.status,
      fulfillmentStatus: shopOrder.fulfillmentStatus,
      fulfillmentType: shopOrder.fulfillmentType,
      totalCents: shopOrder.totalCents,
      trackingNumber: shopOrder.trackingNumber,
      createdAt: shopOrder.createdAt,
      paidAt: shopOrder.paidAt,
    })
    .from(shopOrder)
    .where(
      and(
        eq(shopOrder.patientId, patientId),
        eq(shopOrder.organizationId, organizationId),
      ),
    )
    .orderBy(desc(shopOrder.createdAt))
    .limit(50)

  const itemsByOrder = new Map<string, BillsOrderItem[]>()
  if (orderRows.length > 0) {
    const items = await db
      .select({
        orderId: shopOrderItem.orderId,
        productName: shopOrderItem.productName,
        variantName: shopOrderItem.variantName,
        quantity: shopOrderItem.quantity,
        unitPriceCents: shopOrderItem.unitPriceCents,
      })
      .from(shopOrderItem)
      .where(inArray(shopOrderItem.orderId, orderRows.map((o) => o.id)))
    for (const it of items) {
      const arr = itemsByOrder.get(it.orderId) ?? []
      arr.push({
        productName: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
      })
      itemsByOrder.set(it.orderId, arr)
    }
  }

  return {
    pmsBalanceCents: patientRow?.pmsBalanceCents ?? null,
    pmsBalanceUpdatedAt: patientRow?.pmsBalanceUpdatedAt ?? null,
    membership: activeMembership
      ? {
          id: activeMembership.id,
          planName: activeMembership.planName,
          planBillingInterval: activeMembership.planBillingInterval,
          priceCents: activeMembership.priceCents,
          status: activeMembership.status,
          currentPeriodEnd: activeMembership.currentPeriodEnd,
          benefits: activeMembership.benefits ?? [],
          benefitsUsed: activeMembership.benefitsUsed ?? {},
        }
      : null,
    orders: orderRows.map((o) => ({
      id: o.id,
      status: o.status,
      fulfillmentStatus: o.fulfillmentStatus,
      fulfillmentType: o.fulfillmentType,
      totalCents: o.totalCents,
      trackingNumber: o.trackingNumber,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      items: itemsByOrder.get(o.id) ?? [],
    })),
  }
}

// ── Records ──────────────────────────────────────────────────────────
//
// What's on file at the clinic from a CRM perspective — what's in their
// chart at OD is OD's problem (we don't read or render dental records,
// charting, perio, claims, Rx, etc per DESIGN.md). What we DO have:
//   • Personal + insurance + contact + DOB — the identity block staff
//     keep on each patient row.
//   • Form submissions — every intake/medical-history/HIPAA form the
//     patient has filled out, with submitted timestamp and form title.
//   • Completed-visit history — appointment rows with status='completed'.

export interface MyPatientRecord {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  insuranceGroupNumber: string | null
}

export interface MyFormOnFile {
  submissionId: string
  formTitle: string
  submittedAt: Date
}

export interface MyVisitHistoryRow {
  id: string
  type: string
  startTime: Date
  notes: string | null
}

export interface MyRecords {
  patient: MyPatientRecord
  forms: MyFormOnFile[]
  visits: MyVisitHistoryRow[]
}

export async function getMyRecords(
  patientId: string,
  organizationId: string,
): Promise<MyRecords | null> {
  const [patientRow] = await db
    .select({
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
      addressLine1: patient.addressLine1,
      city: patient.city,
      state: patient.state,
      postalCode: patient.postalCode,
      insuranceProvider: patient.insuranceProvider,
      insurancePolicyNumber: patient.insurancePolicyNumber,
      insuranceGroupNumber: patient.insuranceGroupNumber,
    })
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, organizationId)))
    .limit(1)
  if (!patientRow) return null

  const [formRows, visitRows] = await Promise.all([
    db
      .select({
        submissionId: formSubmission.id,
        formTitle: formTemplate.title,
        submittedAt: formSubmission.submittedAt,
      })
      .from(formSubmission)
      .innerJoin(formTemplate, eq(formSubmission.formTemplateId, formTemplate.id))
      .where(
        and(
          eq(formSubmission.patientId, patientId),
          eq(formSubmission.organizationId, organizationId),
        ),
      )
      .orderBy(desc(formSubmission.submittedAt)),
    db
      .select({
        id: appointment.id,
        type: appointment.type,
        startTime: appointment.startTime,
        notes: appointment.notes,
      })
      .from(appointment)
      .where(
        and(
          eq(appointment.patientId, patientId),
          eq(appointment.organizationId, organizationId),
          eq(appointment.status, 'completed'),
        ),
      )
      .orderBy(desc(appointment.startTime))
      .limit(50),
  ])

  return {
    patient: patientRow,
    forms: formRows.map((f) => ({
      submissionId: f.submissionId,
      formTitle: f.formTitle,
      submittedAt: f.submittedAt,
    })),
    visits: visitRows.map((v) => ({
      id: v.id,
      type: v.type,
      startTime: v.startTime,
      notes: v.notes,
    })),
  }
}

// ── Messages ─────────────────────────────────────────────────────────
//
// Patient-side view of the same unified conversation the clinic sees in
// `/messages`. Reuses the clinic-side service: the thread is created
// lazily if it doesn't exist yet, and the message stream merges both
// patient_message rows and patient-linked email_message rows so a
// portal-side reply slots into the same history Gmail-ingested
// messages live in.

export interface MyThreadView {
  /** Null until the patient sends their first message (lazy create). */
  threadId: string | null
  messages: ThreadMessage[]
}

export async function getMyThread(
  organizationId: string,
  patientId: string,
): Promise<MyThreadView> {
  // Read-only lookup: visiting the portal shouldn't write a thread row.
  // The thread is materialized on first patient send via
  // sendMessageFromPatient → recordInboundMessage → getOrCreatePatientThread.
  const threadId = await findPatientThread(organizationId, patientId)
  if (!threadId) return { threadId: null, messages: [] }
  const messages = await listMessagesInThread(organizationId, threadId)
  return { threadId, messages }
}

/**
 * Send a message from the patient → clinic, in-app channel. Increments
 * the clinic-side unread counter and flips the thread to 'open' so it
 * surfaces on the front desk's queue. Caller (server action) gates on
 * tenant + patient identity; this function takes both at face value.
 */
export async function sendMessageFromPatient(
  organizationId: string,
  patientId: string,
  body: string,
): Promise<{ threadId: string; messageId: string }> {
  return recordInboundMessage({
    organizationId,
    patientId,
    body,
    channel: 'in_app',
  })
}

export async function getMyClinicHeader(organizationId: string) {
  const [row] = await db
    .select({
      displayName: clinicProfile.displayName,
      phone: clinicProfile.phone,
      email: clinicProfile.email,
      logoUrl: clinicProfile.logoUrl,
      brandColor: clinicProfile.brandColor,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

// ── Portal v2 ────────────────────────────────────────────────────────
//
// Everything below powers the redesigned clinic-branded portal: richer
// clinic info for the chrome, provider-joined visits for the cards,
// family/dependent access, the recall nudge, pre-visit form tasks, and
// online balance payments.

export interface PortalClinicInfo {
  organizationSlug: string
  displayName: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
  brandColor: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  hours: Record<string, { open?: string | null; close?: string | null; closed?: boolean } | undefined> | null
  timezone: string | null
  cancellationPolicy: string | null
  /** Public/portal online self-scheduling. false = the portal offers a
   *  request-an-appointment form (→ inbox message) instead of the live slot
   *  picker, mirroring the public website. */
  selfBookingEnabled: boolean
}

/** Clinic identity + practical info for the portal chrome (header / footer / contact cards). */
export async function getPortalClinicInfo(organizationId: string): Promise<PortalClinicInfo | null> {
  const [row] = await db
    .select({
      organizationSlug: organization.slug,
      displayName: clinicProfile.displayName,
      phone: clinicProfile.phone,
      email: clinicProfile.email,
      logoUrl: clinicProfile.logoUrl,
      brandColor: clinicProfile.brandColor,
      addressLine1: clinicProfile.addressLine1,
      addressLine2: clinicProfile.addressLine2,
      city: clinicProfile.city,
      state: clinicProfile.state,
      postalCode: clinicProfile.postalCode,
      hours: clinicProfile.hours,
      timezone: clinicProfile.timezone,
      cancellationPolicy: clinicProfile.cancellationPolicy,
      selfBookingEnabled: clinicProfile.selfBookingEnabled,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!row) return null
  return {
    ...row,
    hours: (row.hours ?? null) as PortalClinicInfo['hours'],
    // null/undefined → enabled, matching the not-null default(true) column.
    selfBookingEnabled: row.selfBookingEnabled !== false,
  }
}

export interface PortalVisit {
  id: string
  patientId: string
  type: string
  status: string
  startTime: Date
  endTime: Date | null
  notes: string | null
  confirmedAt: Date | null
  providerName: string | null
  providerRole: string | null
  providerPhotoUrl: string | null
  /** Set when this row is a dependent's visit rendered in a guardian's portal. */
  patientFirstName: string
}

const visitSelection = {
  id: appointment.id,
  patientId: appointment.patientId,
  type: appointment.type,
  status: appointment.status,
  startTime: appointment.startTime,
  endTime: appointment.endTime,
  notes: appointment.notes,
  confirmedAt: appointment.confirmedAt,
  providerName: clinicProvider.displayName,
  providerRole: clinicProvider.role,
  providerPhotoUrl: clinicProvider.photoUrl,
  patientFirstName: patient.firstName,
}

/**
 * Upcoming (not cancelled / no-show) visits for one or more patients —
 * the guardian portal passes [self, ...dependents]. Provider label joined
 * in so cards can show a real face.
 */
export async function getUpcomingVisits(
  patientIds: string[],
  organizationId: string,
): Promise<PortalVisit[]> {
  if (patientIds.length === 0) return []
  return db
    .select(visitSelection)
    .from(appointment)
    .leftJoin(clinicProvider, eq(appointment.providerId, clinicProvider.id))
    .innerJoin(patient, eq(appointment.patientId, patient.id))
    .where(
      and(
        inArray(appointment.patientId, patientIds),
        eq(appointment.organizationId, organizationId),
        gte(appointment.startTime, new Date()),
        ne(appointment.status, 'cancelled'),
        ne(appointment.status, 'no_show'),
      ),
    )
    .orderBy(appointment.startTime)
    .limit(25)
}

/** Past visits (everything before now, any terminal status) for the visits page history. */
export async function getPastVisits(
  patientIds: string[],
  organizationId: string,
): Promise<PortalVisit[]> {
  if (patientIds.length === 0) return []
  return db
    .select(visitSelection)
    .from(appointment)
    .leftJoin(clinicProvider, eq(appointment.providerId, clinicProvider.id))
    .innerJoin(patient, eq(appointment.patientId, patient.id))
    .where(
      and(
        inArray(appointment.patientId, patientIds),
        eq(appointment.organizationId, organizationId),
        lt(appointment.startTime, new Date()),
      ),
    )
    .orderBy(desc(appointment.startTime))
    .limit(50)
}

/** Single visit, scoped to the allowed patient set (self + dependents). */
export async function getVisitForPatients(
  visitId: string,
  patientIds: string[],
  organizationId: string,
): Promise<PortalVisit | null> {
  if (patientIds.length === 0) return null
  const [row] = await db
    .select(visitSelection)
    .from(appointment)
    .leftJoin(clinicProvider, eq(appointment.providerId, clinicProvider.id))
    .innerJoin(patient, eq(appointment.patientId, patient.id))
    .where(
      and(
        eq(appointment.id, visitId),
        inArray(appointment.patientId, patientIds),
        eq(appointment.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row ?? null
}

export interface PortalDependent {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
}

/**
 * Active patients who list this patient as their guardian. Powers family
 * access — the guardian sees these alongside their own record.
 */
export async function getMyDependents(
  patientId: string,
  organizationId: string,
): Promise<PortalDependent[]> {
  return db
    .select({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
    })
    .from(patient)
    .where(
      and(
        eq(patient.guardianPatientId, patientId),
        eq(patient.organizationId, organizationId),
        eq(patient.isActive, 1),
      ),
    )
    .orderBy(patient.firstName)
}

/**
 * Recall status for the home-screen nudge ("Time for your next cleaning").
 * Reuses the shared derivation so the patient sees exactly what the front
 * desk sees on the patients list.
 */
export async function getMyRecallStatus(
  patientId: string,
  organizationId: string,
): Promise<RecallStatus> {
  const now = new Date()
  const [patientRow] = await db
    .select({ pmsRecallDueAt: patient.pmsRecallDueAt })
    .from(patient)
    .where(and(eq(patient.id, patientId), eq(patient.organizationId, organizationId)))
    .limit(1)
  if (!patientRow) return 'na'

  const rows = await db
    .select({ startTime: appointment.startTime, status: appointment.status })
    .from(appointment)
    .where(and(eq(appointment.patientId, patientId), eq(appointment.organizationId, organizationId)))

  let lastVisitAt: Date | null = null
  let hasAnyFutureAppt = false
  for (const r of rows) {
    const active = r.status !== 'cancelled' && r.status !== 'no_show'
    if (r.startTime > now) {
      if (active) hasAnyFutureAppt = true
    } else if (r.status === 'completed') {
      if (!lastVisitAt || r.startTime > lastVisitAt) lastVisitAt = r.startTime
    }
  }

  return derivePatientRecallStatus({
    pmsRecallDueAt: patientRow.pmsRecallDueAt,
    hasUpcomingAppt: hasAnyFutureAppt,
    hasAnyFutureAppt,
    lastVisitAt,
    now,
  })
}

export interface PortalPendingForm {
  templateId: string
  title: string
  slug: string
  description: string | null
  isDefault: boolean
}

/**
 * Active form templates this patient hasn't submitted yet. The home screen
 * surfaces the default one as a pre-visit task when a visit is coming up;
 * the Forms page lists them all.
 */
export async function getMyPendingForms(
  patientId: string,
  organizationId: string,
): Promise<PortalPendingForm[]> {
  const templates = await db
    .select({
      templateId: formTemplate.id,
      title: formTemplate.title,
      slug: formTemplate.slug,
      description: formTemplate.description,
      isDefault: formTemplate.isDefault,
    })
    .from(formTemplate)
    .where(and(eq(formTemplate.organizationId, organizationId), isNull(formTemplate.archivedAt)))
    .orderBy(desc(formTemplate.isDefault), formTemplate.title)
  if (templates.length === 0) return []

  const submitted = await db
    .select({ formTemplateId: formSubmission.formTemplateId })
    .from(formSubmission)
    .where(
      and(
        eq(formSubmission.patientId, patientId),
        eq(formSubmission.organizationId, organizationId),
      ),
    )
  const submittedIds = new Set(submitted.map((s) => s.formTemplateId))

  return templates
    .filter((t) => !submittedIds.has(t.templateId))
    .map((t) => ({ ...t, isDefault: t.isDefault === 1 }))
}

export interface PortalBalancePaymentRow {
  id: string
  amountCents: number
  status: string
  createdAt: Date
  paidAt: Date | null
}

/** Past online balance payments (paid + pending) for the billing history list. */
export async function getMyBalancePayments(
  patientId: string,
  organizationId: string,
): Promise<PortalBalancePaymentRow[]> {
  return db
    .select({
      id: patientBalancePayment.id,
      amountCents: patientBalancePayment.amountCents,
      status: patientBalancePayment.status,
      createdAt: patientBalancePayment.createdAt,
      paidAt: patientBalancePayment.paidAt,
    })
    .from(patientBalancePayment)
    .where(
      and(
        eq(patientBalancePayment.patientId, patientId),
        eq(patientBalancePayment.organizationId, organizationId),
        ne(patientBalancePayment.status, 'failed'),
      ),
    )
    .orderBy(desc(patientBalancePayment.createdAt))
    .limit(50)
}

/**
 * The patient ids this signed-in patient may act for: themselves plus
 * (when family access is enabled) their active dependents. Every portal
 * read/mutation scopes to this set.
 */
export async function getAccessiblePatientIds(
  patientId: string,
  organizationId: string,
  familyEnabled: boolean,
): Promise<string[]> {
  if (!familyEnabled) return [patientId]
  const dependents = await getMyDependents(patientId, organizationId)
  return [patientId, ...dependents.map((d) => d.id)]
}
