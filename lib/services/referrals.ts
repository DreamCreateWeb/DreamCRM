import 'server-only'

import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { deliver } from '@/lib/email'

/**
 * Referral partner program — partner CRUD, clinic attribution, and automatic
 * commission accrual from PAID subscription invoices.
 *
 * Money flow:
 *   1. A clinic is assigned to a partner (`assignClinicReferral`) → sets
 *      `clinic_profile.referral_partner_id` + snapshots the rate/term +
 *      stamps `referral_started_at` (the term clock).
 *   2. The platform Stripe webhook fires `invoice.payment_succeeded` for that
 *      clinic → `accrueCommissionForInvoice` writes a `referral_commission`
 *      row (idempotent on `stripe_invoice_id`), but only while inside the
 *      clinic's referral term + partner is active.
 *   3. A payout (`lib/services/referral-payouts.ts`) sweeps accrued rows →
 *      `paid` and moves money to the partner's Stripe Connect Express account.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000'

/** Whole months elapsed from `start` to `now`. Used for the term check. A
 *  clinic referred on Jan 15 is "0 months in" until Feb 15. */
export function monthsElapsed(start: Date, now: Date): number {
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (now.getDate() < start.getDate()) months -= 1
  return Math.max(0, months)
}

/**
 * Is an accrual still within the clinic's referral term?
 *   - no term (null) → forever, always true.
 *   - no start date → treat as not yet started → false (defensive; assignment
 *     always sets a start, so this only guards malformed rows).
 *   - else: elapsed months since start must be < termMonths.
 */
export function withinTerm(args: {
  startedAt: Date | null
  termMonths: number | null
  now?: Date
}): boolean {
  if (args.termMonths == null) return true
  if (!args.startedAt) return false
  return monthsElapsed(args.startedAt, args.now ?? new Date()) < args.termMonths
}

/** commission cents = invoice cents × bps / 10000, rounded DOWN. */
export function commissionCents(invoiceCents: number, percentBps: number): number {
  if (invoiceCents <= 0 || percentBps <= 0) return 0
  return Math.floor((invoiceCents * percentBps) / 10000)
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePartnerInput {
  name: string
  company?: string | null
  email: string
  defaultPercentBps: number
  defaultTermMonths?: number | null
  termsNote?: string | null
}

export interface CreatePartnerResult {
  id: string
  email: string
}

/** Create a partner + email them an accept-invite link. Idempotency: a unique
 *  email constraint protects against duplicates (we surface a clean error). */
export async function createPartner(input: CreatePartnerInput): Promise<CreatePartnerResult> {
  const name = input.name.trim()
  if (!name) throw new Error('Partner name is required')
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email')
  if (!Number.isInteger(input.defaultPercentBps) || input.defaultPercentBps < 0 || input.defaultPercentBps > 10000) {
    throw new Error('Percentage must be between 0 and 100')
  }

  const [dupe] = await db
    .select({ id: schema.referralPartner.id })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.email, email))
    .limit(1)
  if (dupe) throw new Error('A partner with this email already exists')

  const id = newId('rp')
  const token = randomBytes(24).toString('hex')
  await db.insert(schema.referralPartner).values({
    id,
    name,
    company: input.company?.trim() || null,
    email,
    status: 'invited',
    defaultPercentBps: input.defaultPercentBps,
    defaultTermMonths: input.defaultTermMonths ?? null,
    termsNote: input.termsNote?.trim() || null,
    inviteToken: token,
    inviteSentAt: new Date(),
  })

  await sendPartnerInviteEmail({ to: email, name, token })
  return { id, email }
}

/** Re-arm + re-send a partner's invite (new token). No-op error if already
 *  accepted (they have a login). */
export async function resendPartnerInvite(partnerId: string): Promise<{ email: string }> {
  const [p] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p) throw new Error('Partner not found')
  if (p.userId) throw new Error('This partner has already set up their account')

  const token = randomBytes(24).toString('hex')
  await db
    .update(schema.referralPartner)
    .set({ inviteToken: token, inviteSentAt: new Date(), status: 'invited', updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))

  await sendPartnerInviteEmail({ to: p.email, name: p.name, token })
  return { email: p.email }
}

export interface UpdatePartnerTermsInput {
  partnerId: string
  defaultPercentBps?: number
  defaultTermMonths?: number | null
  termsNote?: string | null
}

/** Update a partner's default rate / term / note. Applies to FUTURE accruals
 *  + new clinic assignments — never rewrites already-accrued ledger rows or
 *  existing clinic overrides. */
export async function updatePartnerTerms(input: UpdatePartnerTermsInput): Promise<void> {
  const patch: Partial<typeof schema.referralPartner.$inferInsert> = { updatedAt: new Date() }
  if (input.defaultPercentBps != null) {
    if (!Number.isInteger(input.defaultPercentBps) || input.defaultPercentBps < 0 || input.defaultPercentBps > 10000) {
      throw new Error('Percentage must be between 0 and 100')
    }
    patch.defaultPercentBps = input.defaultPercentBps
  }
  if (input.defaultTermMonths !== undefined) patch.defaultTermMonths = input.defaultTermMonths
  if (input.termsNote !== undefined) patch.termsNote = input.termsNote?.trim() || null
  await db.update(schema.referralPartner).set(patch).where(eq(schema.referralPartner.id, input.partnerId))
}

export async function setPartnerStatus(partnerId: string, status: 'active' | 'suspended'): Promise<void> {
  await db
    .update(schema.referralPartner)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic attribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attribute a clinic to a partner. Copies the partner's current defaults when
 * a per-clinic override isn't supplied, and stamps `referral_started_at` (the
 * term clock) — unless the clinic is ALREADY assigned to the same partner, in
 * which case we keep the original start so re-saving doesn't reset the term.
 *
 * Platform-only (caller gates). Throws when the clinic or partner is missing.
 */
export async function assignClinicReferral(
  organizationId: string,
  partnerId: string,
  percentBps?: number | null,
  termMonths?: number | null,
): Promise<void> {
  const [partner] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!partner) throw new Error('Partner not found')

  const [profile] = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      currentPartnerId: schema.clinicProfile.referralPartnerId,
      currentStartedAt: schema.clinicProfile.referralStartedAt,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) throw new Error('Clinic not found')

  const reassigningSamePartner = profile.currentPartnerId === partnerId
  const startedAt = reassigningSamePartner && profile.currentStartedAt ? profile.currentStartedAt : new Date()

  await db
    .update(schema.clinicProfile)
    .set({
      referralPartnerId: partnerId,
      // When an override is explicitly null, store the partner default so the
      // accrual snapshot is stable even if the partner's default changes later.
      referralPercentBps: percentBps ?? partner.defaultPercentBps,
      referralTermMonths: termMonths !== undefined ? termMonths : partner.defaultTermMonths,
      referralStartedAt: startedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/** Update just the per-clinic rate/term override on an already-assigned clinic
 *  (the clinic-detail "Referral" card). Keeps partner + start date intact. */
export async function updateClinicReferralTerms(
  organizationId: string,
  percentBps: number | null,
  termMonths: number | null,
): Promise<void> {
  if (percentBps != null && (!Number.isInteger(percentBps) || percentBps < 0 || percentBps > 10000)) {
    throw new Error('Percentage must be between 0 and 100')
  }
  await db
    .update(schema.clinicProfile)
    .set({ referralPercentBps: percentBps, referralTermMonths: termMonths, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/** Detach a clinic from its partner. Already-accrued commission stays (it was
 *  earned); future invoices stop accruing. */
export async function clearClinicReferral(organizationId: string): Promise<void> {
  await db
    .update(schema.clinicProfile)
    .set({
      referralPartnerId: null,
      referralPercentBps: null,
      referralTermMonths: null,
      referralStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission accrual (called from the platform Stripe webhook)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccrueInput {
  organizationId: string
  stripeInvoiceId: string
  amountPaidCents: number
}

export interface AccrueResult {
  accrued: boolean
  reason?: 'no_partner' | 'suspended' | 'out_of_term' | 'zero_amount' | 'duplicate' | 'no_profile'
  amountCents?: number
}

/**
 * Accrue commission for one PAID subscription invoice. Idempotent (ON CONFLICT
 * DO NOTHING on the unique stripe_invoice_id), and a no-op when:
 *   - the clinic has no referral partner,
 *   - the partner is suspended,
 *   - the invoice falls outside the clinic's referral term,
 *   - amount is zero/negative.
 *
 * Best-effort by contract — the webhook wraps this in try/catch so it can
 * NEVER break billing sync.
 */
export async function accrueCommissionForInvoice(input: AccrueInput): Promise<AccrueResult> {
  if (!input.amountPaidCents || input.amountPaidCents <= 0) return { accrued: false, reason: 'zero_amount' }

  const [profile] = await db
    .select({
      partnerId: schema.clinicProfile.referralPartnerId,
      percentBps: schema.clinicProfile.referralPercentBps,
      termMonths: schema.clinicProfile.referralTermMonths,
      startedAt: schema.clinicProfile.referralStartedAt,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, input.organizationId))
    .limit(1)
  if (!profile) return { accrued: false, reason: 'no_profile' }
  if (!profile.partnerId) return { accrued: false, reason: 'no_partner' }

  const [partner] = await db
    .select({
      status: schema.referralPartner.status,
      defaultPercentBps: schema.referralPartner.defaultPercentBps,
      defaultTermMonths: schema.referralPartner.defaultTermMonths,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, profile.partnerId))
    .limit(1)
  if (!partner) return { accrued: false, reason: 'no_partner' }
  if (partner.status === 'suspended') return { accrued: false, reason: 'suspended' }

  // Per-clinic override wins; else the partner default at accrual time.
  const percentBps = profile.percentBps ?? partner.defaultPercentBps
  const termMonths = profile.termMonths !== null ? profile.termMonths : partner.defaultTermMonths

  if (!withinTerm({ startedAt: profile.startedAt, termMonths })) {
    return { accrued: false, reason: 'out_of_term' }
  }

  const amount = commissionCents(input.amountPaidCents, percentBps)
  if (amount <= 0) return { accrued: false, reason: 'zero_amount' }

  const result = await db
    .insert(schema.referralCommission)
    .values({
      partnerId: profile.partnerId,
      organizationId: input.organizationId,
      stripeInvoiceId: input.stripeInvoiceId,
      invoiceTotalCents: input.amountPaidCents,
      percentBps,
      amountCents: amount,
      status: 'accrued',
    })
    .onConflictDoNothing({ target: schema.referralCommission.stripeInvoiceId })
    .returning({ id: schema.referralCommission.id })

  if (result.length === 0) return { accrued: false, reason: 'duplicate' }
  return { accrued: true, amountCents: amount }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats / listings (platform admin + partner portal)
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerListRow {
  id: string
  name: string
  company: string | null
  email: string
  status: 'invited' | 'active' | 'suspended'
  defaultPercentBps: number
  defaultTermMonths: number | null
  hasConnectAccount: boolean
  payoutsEnabled: boolean
  clinicCount: number
  unpaidCents: number
  lifetimePaidCents: number
  isDemo: boolean
}

/** Platform admin list — one row per partner with rollup counts. */
export async function listPartners(): Promise<PartnerListRow[]> {
  const partners = await db
    .select()
    .from(schema.referralPartner)
    .orderBy(desc(schema.referralPartner.createdAt))
  if (partners.length === 0) return []

  const ids = partners.map((p) => p.id)

  // Clinic counts per partner.
  const clinicCounts = await db
    .select({
      partnerId: schema.clinicProfile.referralPartnerId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.clinicProfile)
    .where(inArray(schema.clinicProfile.referralPartnerId, ids))
    .groupBy(schema.clinicProfile.referralPartnerId)
  const clinicCountBy = new Map(clinicCounts.map((c) => [c.partnerId, Number(c.n)]))

  // Accrued-unpaid + lifetime-paid sums per partner.
  const sums = await db
    .select({
      partnerId: schema.referralCommission.partnerId,
      status: schema.referralCommission.status,
      total: sql<number>`coalesce(sum(${schema.referralCommission.amountCents}), 0)::bigint`,
    })
    .from(schema.referralCommission)
    .where(inArray(schema.referralCommission.partnerId, ids))
    .groupBy(schema.referralCommission.partnerId, schema.referralCommission.status)
  const unpaidBy = new Map<string, number>()
  const paidBy = new Map<string, number>()
  for (const row of sums) {
    if (row.status === 'accrued') unpaidBy.set(row.partnerId, Number(row.total))
    else if (row.status === 'paid') paidBy.set(row.partnerId, Number(row.total))
  }

  return partners.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    email: p.email,
    status: p.status as PartnerListRow['status'],
    defaultPercentBps: p.defaultPercentBps,
    defaultTermMonths: p.defaultTermMonths,
    hasConnectAccount: Boolean(p.stripeConnectAccountId),
    payoutsEnabled: p.payoutsEnabled === 1,
    clinicCount: clinicCountBy.get(p.id) ?? 0,
    unpaidCents: unpaidBy.get(p.id) ?? 0,
    lifetimePaidCents: paidBy.get(p.id) ?? 0,
    isDemo: p.isDemo === 1,
  }))
}

export interface PartnerPickerOption {
  id: string
  name: string
  company: string | null
  defaultPercentBps: number
  defaultTermMonths: number | null
}

/** Lightweight active-partner list for the attribution pickers (add-clinic
 *  modal + clinic-detail Referral card). Active partners only — you can't
 *  attribute a clinic to a suspended/uninvited partner. */
export async function listActivePartners(): Promise<PartnerPickerOption[]> {
  const rows = await db
    .select({
      id: schema.referralPartner.id,
      name: schema.referralPartner.name,
      company: schema.referralPartner.company,
      defaultPercentBps: schema.referralPartner.defaultPercentBps,
      defaultTermMonths: schema.referralPartner.defaultTermMonths,
      status: schema.referralPartner.status,
    })
    .from(schema.referralPartner)
    .orderBy(schema.referralPartner.name)
  // Allow 'invited' too — a clinic can be attributed before the partner has
  // finished setting up their portal/payouts; only 'suspended' is excluded.
  return rows
    .filter((r) => r.status !== 'suspended')
    .map(({ status: _status, ...r }) => r)
}

export interface ClinicReferralInfo {
  partnerId: string
  partnerName: string
  /** Effective rate (per-clinic override or partner default), in bps. */
  percentBps: number
  /** Effective term (per-clinic override or partner default), months or null. */
  termMonths: number | null
  /** True when the clinic carries an explicit per-clinic % override. */
  hasPercentOverride: boolean
  startedAt: Date | null
}

/** The current referral attribution for one clinic, or null. Drives the
 *  clinic-detail "Referral" card. */
export async function getClinicReferral(organizationId: string): Promise<ClinicReferralInfo | null> {
  const [profile] = await db
    .select({
      partnerId: schema.clinicProfile.referralPartnerId,
      percentBps: schema.clinicProfile.referralPercentBps,
      termMonths: schema.clinicProfile.referralTermMonths,
      startedAt: schema.clinicProfile.referralStartedAt,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile?.partnerId) return null
  const [partner] = await db
    .select({
      name: schema.referralPartner.name,
      defaultPercentBps: schema.referralPartner.defaultPercentBps,
      defaultTermMonths: schema.referralPartner.defaultTermMonths,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, profile.partnerId))
    .limit(1)
  if (!partner) return null
  return {
    partnerId: profile.partnerId,
    partnerName: partner.name,
    percentBps: profile.percentBps ?? partner.defaultPercentBps,
    termMonths: profile.termMonths !== null ? profile.termMonths : partner.defaultTermMonths,
    hasPercentOverride: profile.percentBps !== null,
    startedAt: profile.startedAt,
  }
}

export async function getPartner(partnerId: string) {
  const [p] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  return p ?? null
}

export async function getPartnerByUserId(userId: string) {
  const [p] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.userId, userId))
    .limit(1)
  return p ?? null
}

export interface ReferredClinicRow {
  organizationId: string
  name: string
  slug: string
  planTier: string
  subscriptionStatus: string | null
  percentBps: number
  termMonths: number | null
  startedAt: Date | null
  lifetimeCommissionCents: number
}

/**
 * Clinics referred by a partner, each with its effective rate/term + lifetime
 * commission earned (accrued + paid). `effectivePercentBps` falls back to the
 * partner default when the per-clinic override is null.
 */
export async function getReferredClinics(partnerId: string): Promise<ReferredClinicRow[]> {
  const [partner] = await db
    .select({
      defaultPercentBps: schema.referralPartner.defaultPercentBps,
      defaultTermMonths: schema.referralPartner.defaultTermMonths,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!partner) return []

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      name: schema.organization.name,
      slug: schema.organization.slug,
      planTier: schema.clinicProfile.planTier,
      subscriptionStatus: schema.clinicProfile.subscriptionStatus,
      percentBps: schema.clinicProfile.referralPercentBps,
      termMonths: schema.clinicProfile.referralTermMonths,
      startedAt: schema.clinicProfile.referralStartedAt,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))
    .where(eq(schema.clinicProfile.referralPartnerId, partnerId))

  if (clinics.length === 0) return []

  const perClinic = await db
    .select({
      organizationId: schema.referralCommission.organizationId,
      total: sql<number>`coalesce(sum(${schema.referralCommission.amountCents}), 0)::bigint`,
    })
    .from(schema.referralCommission)
    .where(
      and(
        eq(schema.referralCommission.partnerId, partnerId),
        inArray(
          schema.referralCommission.organizationId,
          clinics.map((c) => c.organizationId),
        ),
        inArray(schema.referralCommission.status, ['accrued', 'paid']),
      ),
    )
    .groupBy(schema.referralCommission.organizationId)
  const totalBy = new Map(perClinic.map((r) => [r.organizationId, Number(r.total)]))

  return clinics.map((c) => ({
    organizationId: c.organizationId,
    name: c.name,
    slug: c.slug,
    planTier: c.planTier ?? 'basic',
    subscriptionStatus: c.subscriptionStatus,
    percentBps: c.percentBps ?? partner.defaultPercentBps,
    termMonths: c.termMonths !== null ? c.termMonths : partner.defaultTermMonths,
    startedAt: c.startedAt,
    lifetimeCommissionCents: totalBy.get(c.organizationId) ?? 0,
  }))
}

export interface PartnerBalance {
  accruedCents: number
  lifetimePaidCents: number
}

/** A partner's accrued-unpaid balance + lifetime paid. */
export async function getPartnerBalance(partnerId: string): Promise<PartnerBalance> {
  const rows = await db
    .select({
      status: schema.referralCommission.status,
      total: sql<number>`coalesce(sum(${schema.referralCommission.amountCents}), 0)::bigint`,
    })
    .from(schema.referralCommission)
    .where(eq(schema.referralCommission.partnerId, partnerId))
    .groupBy(schema.referralCommission.status)
  let accrued = 0
  let paid = 0
  for (const r of rows) {
    if (r.status === 'accrued') accrued = Number(r.total)
    else if (r.status === 'paid') paid = Number(r.total)
  }
  return { accruedCents: accrued, lifetimePaidCents: paid }
}

export interface CommissionLedgerRow {
  id: number
  organizationId: string
  clinicName: string
  stripeInvoiceId: string
  invoiceTotalCents: number
  percentBps: number
  amountCents: number
  status: string
  accruedAt: Date
}

/** The commission ledger for a partner (most recent first), with clinic name. */
export async function listCommissions(partnerId: string, limit = 100): Promise<CommissionLedgerRow[]> {
  const rows = await db
    .select({
      id: schema.referralCommission.id,
      organizationId: schema.referralCommission.organizationId,
      clinicName: schema.organization.name,
      stripeInvoiceId: schema.referralCommission.stripeInvoiceId,
      invoiceTotalCents: schema.referralCommission.invoiceTotalCents,
      percentBps: schema.referralCommission.percentBps,
      amountCents: schema.referralCommission.amountCents,
      status: schema.referralCommission.status,
      accruedAt: schema.referralCommission.accruedAt,
    })
    .from(schema.referralCommission)
    .leftJoin(schema.organization, eq(schema.organization.id, schema.referralCommission.organizationId))
    .where(eq(schema.referralCommission.partnerId, partnerId))
    .orderBy(desc(schema.referralCommission.accruedAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, clinicName: r.clinicName ?? 'Unknown clinic' }))
}

export interface PayoutRow {
  id: number
  amountCents: number
  stripeTransferId: string | null
  status: string
  note: string | null
  createdAt: Date
}

export async function listPayouts(partnerId: string, limit = 100): Promise<PayoutRow[]> {
  return db
    .select({
      id: schema.referralPayout.id,
      amountCents: schema.referralPayout.amountCents,
      stripeTransferId: schema.referralPayout.stripeTransferId,
      status: schema.referralPayout.status,
      note: schema.referralPayout.note,
      createdAt: schema.referralPayout.createdAt,
    })
    .from(schema.referralPayout)
    .where(eq(schema.referralPayout.partnerId, partnerId))
    .orderBy(desc(schema.referralPayout.createdAt))
    .limit(limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// Accept-invite token flow
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerInviteDetails {
  partnerId: string
  name: string
  email: string
  /** True when this user account already exists (so the page links instead of
   *  prompting for a new password). */
  alreadyLinked: boolean
}

/** Resolve an invite token → partner details for the accept page. Null when
 *  the token is invalid (or already consumed). */
export async function getPartnerInviteByToken(token: string): Promise<PartnerInviteDetails | null> {
  if (!token) return null
  const [p] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.inviteToken, token))
    .limit(1)
  if (!p) return null
  return {
    partnerId: p.id,
    name: p.name,
    email: p.email,
    alreadyLinked: Boolean(p.userId),
  }
}

/**
 * Link a signed-in user to a partner row (the accept-invite completion step):
 * sets user_id, flips status to 'active', clears the invite token. The caller
 * must have verified the session email matches the partner email.
 */
export async function linkPartnerUser(partnerId: string, userId: string): Promise<void> {
  await db
    .update(schema.referralPartner)
    .set({ userId, status: 'active', inviteToken: null, updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

async function sendPartnerInviteEmail(args: { to: string; name: string; token: string }): Promise<void> {
  const url = `${appUrl()}/partner/accept?token=${args.token}`
  const firstName = args.name.split(' ')[0] || args.name
  await deliver({
    to: args.to,
    subject: 'You’re invited to the Dream Create partner program',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1A2140">
        <h2 style="margin:0 0 16px;font-size:20px">Hi ${escapeHtml(firstName)},</h2>
        <p style="margin:0 0 20px;line-height:1.55;color:#444">
          You've been added as a referral partner for <strong>Dream Create</strong>.
          Set up your partner account to see the clinics you refer, track your
          commission as it accrues, and connect a payout method to get paid.
        </p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#1F6E7E;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
          Set up my partner account
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888;line-height:1.55">
          If you weren't expecting this, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
