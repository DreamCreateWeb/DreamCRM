import 'server-only'

import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { authEmailShell, deliver } from '@/lib/email'

/**
 * Referral partner program — partner CRUD, clinic attribution, and automatic
 * commission accrual from PAID subscription invoices.
 *
 * Money flow:
 *   1. A clinic is assigned to a partner (`assignClinicReferral`) → sets
 *      `clinic_profile.referral_partner_id`, persists the rate/term ONLY when
 *      it's an explicit per-clinic override (else NULL → live-resolve the
 *      partner default), and stamps `referral_started_at` (the term clock).
 *   2. The platform Stripe webhook fires `invoice.payment_succeeded` for that
 *      clinic → `accrueCommissionForInvoice` resolves the effective rate
 *      (per-clinic override, else the partner's CURRENT default at accrual
 *      time) and writes a `referral_commission` row (idempotent on
 *      `stripe_invoice_id`), but only while inside the clinic's referral term
 *      + the partner is active (suspended/archived no-op).
 *   3. A payout (`lib/services/referral-payouts.ts`) sweeps accrued rows →
 *      `paid` and moves money to the partner's Stripe Connect Express account.
 *
 * PERCENT/TERM RESOLUTION (the binding rule):
 *   `clinic_profile.referral_percent_bps` / `referral_term_months` hold a value
 *   ONLY for an explicit per-clinic override. NULL means "live-resolve the
 *   partner's CURRENT default" — so raising/lowering a partner's default %
 *   immediately flows to every non-overridden clinic's FUTURE accruals + every
 *   display surface. The accrual ledger snapshots `percent_bps` at accrual time,
 *   so already-earned rows never change. A submitted override equal to the
 *   partner's current default is treated as "use default" and persisted NULL.
 *
 * LIFECYCLE: suspend (accrual no-op, portal payouts blocked, admin pay-now ok),
 * archive (status='archived', accrual no-op, portal shows a closed screen,
 * clinics keep historical attribution, ledger/payouts preserved), and a
 * conditional delete (hard-delete only with zero money history; otherwise the
 * flow becomes archive with a balance-resolution step). See `deletePartner` /
 * `archivePartner` / `reactivatePartner`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Falls back to the PRODUCTION origin — a missing env var must never ship
// dead localhost links in partner invite emails.
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

/** Partner invite token lifetime — 14 days, matching staff/patient invites. */
const PARTNER_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

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

  // The unique-email constraint conflicts with ANY existing row (incl.
  // archived). A hard-deleted partner frees the address (its row is gone), but
  // an ARCHIVED partner still holds it — surface a specific message so the
  // admin reactivates that one or uses a different email, rather than the
  // generic "already exists".
  const [dupe] = await db
    .select({ id: schema.referralPartner.id, status: schema.referralPartner.status })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.email, email))
    .limit(1)
  if (dupe) {
    if (dupe.status === 'archived') {
      throw new Error('That email belongs to an archived partner — reactivate them, or use another email')
    }
    throw new Error('A partner with this email already exists')
  }

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
    inviteExpiresAt: new Date(Date.now() + PARTNER_INVITE_TTL_MS),
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
    .set({
      inviteToken: token,
      inviteSentAt: new Date(),
      // Re-sending refreshes the 14-day clock so a re-armed invite is usable.
      inviteExpiresAt: new Date(Date.now() + PARTNER_INVITE_TTL_MS),
      status: 'invited',
      updatedAt: new Date(),
    })
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

/** Update a partner's default rate / term / note. Applies to FUTURE accruals of
 *  every NON-overridden clinic (their override is NULL → live-resolve this new
 *  default) + new clinic assignments. Never rewrites already-accrued ledger
 *  rows (they snapshot the rate at accrual) or clinics carrying an explicit
 *  per-clinic override. */
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

/** Suspend / reactivate a partner. Suspend halts future accrual (the accrual
 *  guard no-ops on a suspended partner) and blocks self-serve portal payouts;
 *  reactivate resumes everything. Archived partners are reactivated via
 *  {@link reactivatePartner} (which validates the email is still free), not
 *  here — pass only 'active' | 'suspended'. */
export async function setPartnerStatus(partnerId: string, status: 'active' | 'suspended'): Promise<void> {
  await db
    .update(schema.referralPartner)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle — delete / archive / reactivate (with money resolution)
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerLifecycleInfo {
  /** True when the partner has ANY commission or payout rows (money history). */
  hasMoneyHistory: boolean
  /** Sum of accrued-unpaid commission cents (the outstanding balance). */
  accruedCents: number
  /** Which path a delete request will take, given the money history + balance. */
  disposition: import('@/lib/types/referrals').PartnerDeleteDisposition
}

/**
 * Compute the delete disposition + numbers for a partner. The disposition is
 * the contract the UI confirm modal renders + the delete action enforces:
 *   - 'clean'   → zero commission + payout rows → safe hard delete.
 *   - 'archive' → money history, no outstanding balance → archive.
 *   - 'resolve' → money history AND an accrued balance → must pay or void first.
 */
export async function getPartnerLifecycleInfo(partnerId: string): Promise<PartnerLifecycleInfo> {
  const [commCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.referralCommission)
    .where(eq(schema.referralCommission.partnerId, partnerId))
  const [payoutCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.referralPayout)
    .where(eq(schema.referralPayout.partnerId, partnerId))

  const [accruedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.referralCommission.amountCents}), 0)::bigint` })
    .from(schema.referralCommission)
    .where(
      and(
        eq(schema.referralCommission.partnerId, partnerId),
        eq(schema.referralCommission.status, 'accrued'),
      ),
    )

  const hasMoneyHistory = Number(commCount?.n ?? 0) > 0 || Number(payoutCount?.n ?? 0) > 0
  const accruedCents = Number(accruedRow?.total ?? 0)
  const disposition: PartnerLifecycleInfo['disposition'] = !hasMoneyHistory
    ? 'clean'
    : accruedCents > 0
      ? 'resolve'
      : 'archive'
  return { hasMoneyHistory, accruedCents, disposition }
}

export interface DeletePartnerResult {
  /** What actually happened. 'deleted' = row removed; 'refused' = blocked. */
  outcome: 'deleted' | 'refused'
  /** When refused, why — so the caller can route to the archive flow. */
  reason?: 'has_history'
  disposition: import('@/lib/types/referrals').PartnerDeleteDisposition
}

/**
 * Conditional delete. HARD-deletes the partner row ONLY when there is zero
 * money history (no commission + no payout rows) — the clinic attributions
 * detach automatically via the `clinic_profile.referral_partner_id` FK
 * (ON DELETE set null) and the linked better-auth user is left untouched
 * (user_id is just a column on the partner; deleting the partner doesn't
 * cascade to the user). When money history EXISTS, hard delete is REFUSED
 * (a cascade would wipe the audit trail) and the caller must use the archive
 * flow instead — surfaced via `outcome: 'refused', reason: 'has_history'`.
 *
 * Re-creating a partner with a previously-used email then works, because the
 * unique-email constraint only conflicts with live rows — a hard delete frees
 * the address.
 */
export async function deletePartner(partnerId: string): Promise<DeletePartnerResult> {
  const info = await getPartnerLifecycleInfo(partnerId)
  if (info.hasMoneyHistory) {
    return { outcome: 'refused', reason: 'has_history', disposition: info.disposition }
  }
  await db.delete(schema.referralPartner).where(eq(schema.referralPartner.id, partnerId))
  return { outcome: 'deleted', disposition: 'clean' }
}

/**
 * Void (reverse) a partner's accrued-unpaid commission — flips every 'accrued'
 * row to 'reversed' with an audit note. Paid rows are untouched (already paid
 * out). Used by the archive-with-balance "void the balance" resolution; no
 * money moves, the balance simply zeroes out for audit. Returns the cents
 * voided. */
export async function voidAccruedCommission(partnerId: string, note: string): Promise<{ voidedCents: number }> {
  const accrued = await db
    .select({ amountCents: schema.referralCommission.amountCents })
    .from(schema.referralCommission)
    .where(
      and(
        eq(schema.referralCommission.partnerId, partnerId),
        eq(schema.referralCommission.status, 'accrued'),
      ),
    )
  const voidedCents = accrued.reduce((s, r) => s + r.amountCents, 0)
  if (voidedCents > 0) {
    await db
      .update(schema.referralCommission)
      .set({ status: 'reversed' })
      .where(
        and(
          eq(schema.referralCommission.partnerId, partnerId),
          eq(schema.referralCommission.status, 'accrued'),
        ),
      )
    // The reversed rows ARE the audit trail (preserved + labeled "Reversed" in
    // the ledger — no silent money deletion). `referral_commission` has no
    // per-row note column (the migration is data-only), so the reason is logged
    // to the server audit log alongside the row reversal.
    console.info('[referral] void accrued commission', { partnerId, voidedCents, note })
  }
  return { voidedCents }
}

export interface ArchivePartnerResult {
  outcome: 'archived' | 'refused'
  /** When refused, why — the balance must be resolved first. */
  reason?: 'outstanding_balance'
  accruedCents?: number
}

/**
 * Archive a partner (status='archived'). Accrual stops, the partner's portal
 * shows a closed screen (requirePartner treats archived as inactive), they're
 * hidden from the active list, but their clinics KEEP their historical
 * attribution rows and the commission ledger + payouts are preserved for audit.
 *
 * REFUSES when there's an outstanding accrued balance — no silent money
 * deletion. The caller resolves it first via one of two explicit paths and
 * passes the matching `resolve` option:
 *   - 'pay'  → run `payoutPartner` (requires payouts_enabled) BEFORE archiving.
 *   - 'void' → flip the accrued rows to 'reversed' (no money moves).
 * With `resolve: undefined` and a balance present, returns
 * `outcome: 'refused', reason: 'outstanding_balance'`.
 */
export async function archivePartner(
  partnerId: string,
  opts: { resolve?: 'pay' | 'void'; initiatedBy: string } = { initiatedBy: 'system' },
): Promise<ArchivePartnerResult> {
  const info = await getPartnerLifecycleInfo(partnerId)

  if (info.accruedCents > 0) {
    if (opts.resolve === 'pay') {
      const { payoutPartner } = await import('@/lib/services/referral-payouts')
      const r = await payoutPartner(partnerId, { initiatedBy: opts.initiatedBy })
      if (!r.ok) {
        // Couldn't settle up — surface as still-outstanding so the UI can show
        // the payout error; the partner is NOT archived (no silent loss).
        return { outcome: 'refused', reason: 'outstanding_balance', accruedCents: info.accruedCents }
      }
    } else if (opts.resolve === 'void') {
      await voidAccruedCommission(partnerId, 'Balance voided on partner archive')
    } else {
      return { outcome: 'refused', reason: 'outstanding_balance', accruedCents: info.accruedCents }
    }
  }

  await db
    .update(schema.referralPartner)
    .set({ status: 'archived', inviteToken: null, updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))
  return { outcome: 'archived' }
}

export interface ReactivatePartnerResult {
  outcome: 'reactivated' | 'refused'
  reason?: 'email_taken' | 'not_archived'
}

/**
 * Reactivate an archived partner → back to 'active'. Refuses if a DIFFERENT
 * live (non-archived) partner now holds the same email (the address was reused
 * after this one was archived) — the admin must resolve the conflict first.
 * Their clinics, ledger, and payouts are all still attached, so reactivating
 * resumes accrual immediately.
 */
export async function reactivatePartner(partnerId: string): Promise<ReactivatePartnerResult> {
  const [p] = await db
    .select({ id: schema.referralPartner.id, email: schema.referralPartner.email, status: schema.referralPartner.status })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p) return { outcome: 'refused', reason: 'not_archived' }
  if (p.status !== 'archived') return { outcome: 'refused', reason: 'not_archived' }

  // A live partner with the same email blocks reactivation (unique-email).
  const conflict = await db
    .select({ id: schema.referralPartner.id })
    .from(schema.referralPartner)
    .where(and(eq(schema.referralPartner.email, p.email), ne(schema.referralPartner.status, 'archived')))
    .limit(1)
  if (conflict.length > 0) return { outcome: 'refused', reason: 'email_taken' }

  await db
    .update(schema.referralPartner)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))
  return { outcome: 'reactivated' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic attribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve what to PERSIST for a per-clinic override field, applying the binding
 * "use default" rule: a submission of `undefined` or `null` means "use the
 * partner default" → persist NULL; a submitted value EQUAL to the partner's
 * current default is also "use default" → persist NULL; only a value that
 * differs from the partner default is a real override → persist that value.
 *
 * Keeping the override NULL (rather than copying the default in) is what lets
 * the accrual fallback + every display surface live-resolve the partner's
 * CURRENT default — so changing the default flows to non-overridden clinics.
 */
function persistedOverride<T extends number | null>(submitted: T | undefined, partnerDefault: T): T | null {
  if (submitted === undefined || submitted === null) return null
  if (submitted === partnerDefault) return null
  return submitted
}

/**
 * Attribute a clinic to a partner. Persists the per-clinic rate/term ONLY when
 * the caller passes an explicit override that DIFFERS from the partner's
 * current default — otherwise NULL, so accrual + display live-resolve the
 * partner default at invoice time (raising/lowering the default then flows to
 * this clinic automatically). Stamps `referral_started_at` (the term clock) —
 * unless the clinic is ALREADY assigned to the same partner, in which case we
 * keep the original start so re-saving doesn't reset the term.
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
      // NULL unless it's an explicit override that differs from the default.
      // NULL → live-resolve the partner's current default at accrual time.
      referralPercentBps: persistedOverride(percentBps, partner.defaultPercentBps),
      referralTermMonths: persistedOverride(termMonths, partner.defaultTermMonths),
      referralStartedAt: startedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/** Update just the per-clinic rate/term override on an already-assigned clinic
 *  (the clinic-detail "Referral" card). Keeps partner + start date intact.
 *  A submitted value equal to the partner's current default persists NULL
 *  ("use default") so the clinic resumes live-resolving the partner default. */
export async function updateClinicReferralTerms(
  organizationId: string,
  percentBps: number | null,
  termMonths: number | null,
): Promise<void> {
  if (percentBps != null && (!Number.isInteger(percentBps) || percentBps < 0 || percentBps > 10000)) {
    throw new Error('Percentage must be between 0 and 100')
  }

  // Resolve the clinic's current partner so an override == default collapses to
  // NULL (use-default). No partner assigned → store the raw values as given.
  const [profile] = await db
    .select({ partnerId: schema.clinicProfile.referralPartnerId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)

  let pctToStore = percentBps
  let termToStore = termMonths
  if (profile?.partnerId) {
    const [partner] = await db
      .select({
        defaultPercentBps: schema.referralPartner.defaultPercentBps,
        defaultTermMonths: schema.referralPartner.defaultTermMonths,
      })
      .from(schema.referralPartner)
      .where(eq(schema.referralPartner.id, profile.partnerId))
      .limit(1)
    if (partner) {
      pctToStore = persistedOverride(percentBps, partner.defaultPercentBps)
      termToStore = persistedOverride(termMonths, partner.defaultTermMonths)
    }
  }

  await db
    .update(schema.clinicProfile)
    .set({ referralPercentBps: pctToStore, referralTermMonths: termToStore, updatedAt: new Date() })
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
  reason?: 'no_partner' | 'suspended' | 'archived' | 'out_of_term' | 'zero_amount' | 'duplicate' | 'no_profile'
  amountCents?: number
}

/**
 * Accrue commission for one PAID subscription invoice. Idempotent (ON CONFLICT
 * DO NOTHING on the unique stripe_invoice_id), and a no-op when:
 *   - the clinic has no referral partner,
 *   - the partner is suspended OR archived (a closed account stops earning),
 *   - the invoice falls outside the clinic's referral term,
 *   - amount is zero/negative.
 *
 * The effective rate is the per-clinic override when set, else the partner's
 * CURRENT default at accrual time (so a default change flows to non-overridden
 * clinics). The ledger row snapshots that rate, so already-earned rows never
 * change when the default later moves.
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
  if (partner.status === 'archived') return { accrued: false, reason: 'archived' }

  // Per-clinic override wins; else the partner's CURRENT default at accrual
  // time (a NULL override means "use the default", so a later default change
  // flows here automatically). The row below snapshots whichever rate applies.
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
  status: import('@/lib/types/referrals').PartnerStatus
  defaultPercentBps: number
  defaultTermMonths: number | null
  hasConnectAccount: boolean
  payoutsEnabled: boolean
  clinicCount: number
  unpaidCents: number
  lifetimePaidCents: number
  isDemo: boolean
}

/** Platform admin list — one row per partner (incl. archived; the UI filters
 *  by status) with rollup counts. */
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
    status: p.status as import('@/lib/types/referrals').PartnerStatus,
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

/** Lightweight assignable-partner list for the attribution pickers (add-clinic
 *  modal + clinic-detail Referral card). You can't attribute a clinic to a
 *  suspended or archived partner; 'invited' is allowed (a clinic can be
 *  attributed before the partner finishes setting up their portal/payouts). */
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
  return rows
    .filter((r) => r.status !== 'suspended' && r.status !== 'archived')
    .map(({ status: _status, ...r }) => r)
}

export interface ClinicReferralInfo {
  partnerId: string
  partnerName: string
  /** Effective rate (per-clinic override, else the partner's CURRENT default
   *  resolved live), in bps. */
  percentBps: number
  /** Effective term (per-clinic override, else the partner default), months or
   *  null. */
  termMonths: number | null
  /** True when the clinic carries an explicit per-clinic % override (vs.
   *  live-resolving the partner default). */
  hasPercentOverride: boolean
  /** True when the clinic carries an explicit per-clinic term override. */
  hasTermOverride: boolean
  /** The partner's current default rate — shown in the "Uses partner default —
   *  currently X%" helper text on the override input. */
  partnerDefaultPercentBps: number
  /** The partner's current default term (months or null = ongoing). */
  partnerDefaultTermMonths: number | null
  /** True when the attributed partner is archived (closed) — the card shows
   *  "(archived)" + the clinic stays reassignable. */
  partnerArchived: boolean
  startedAt: Date | null
}

/** The current referral attribution for one clinic, or null. Drives the
 *  clinic-detail "Referral" card. The effective rate/term live-resolves the
 *  partner's CURRENT default when the clinic has no override (NULL). */
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
      status: schema.referralPartner.status,
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
    hasTermOverride: profile.termMonths !== null,
    partnerDefaultPercentBps: partner.defaultPercentBps,
    partnerDefaultTermMonths: partner.defaultTermMonths,
    partnerArchived: partner.status === 'archived',
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
  /** Effective rate (per-clinic override, else the partner's CURRENT default
   *  resolved live), in bps. */
  percentBps: number
  termMonths: number | null
  /** True when this row's rate is an explicit per-clinic override (vs. the
   *  partner default) — drives the "10% · override" / "10% · default"
   *  provenance label on the partner-detail clinics table. */
  hasPercentOverride: boolean
  /** True when this row's term is an explicit per-clinic override. */
  hasTermOverride: boolean
  startedAt: Date | null
  lifetimeCommissionCents: number
}

/**
 * Clinics referred by a partner, each with its effective rate/term + lifetime
 * commission earned (accrued + paid). The effective rate falls back to the
 * partner's CURRENT default when the per-clinic override is null, and each row
 * carries `hasPercentOverride`/`hasTermOverride` so the UI can label provenance.
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
    hasPercentOverride: c.percentBps !== null,
    hasTermOverride: c.termMonths !== null,
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
  /** True when this partner row is already linked to a user (the invite was
   *  already accepted). The accept page treats this as "sign in" rather than
   *  "create account". */
  alreadyLinked: boolean
  /** True when the invite token has passed its expiry. The accept page shows a
   *  clean "ask for a fresh invite" message instead of a generic error. */
  expired: boolean
  /**
   * Account state for the invite email — drives which affordance the accept
   * page renders (create / password sign-in / magic-link sign-in). Resolved
   * via the shared `resolveAccountState` so partner accepts handle the
   * one-email-one-user reality (Bug 2). 'none' for a brand-new email.
   */
  accountState: import('@/lib/auth/account-state').AccountState
}

/** Resolve an invite token → partner details for the accept page. Null when
 *  the token is invalid (no such token). Expiry is reported as a flag (not a
 *  null) so the page can show "this invite expired — ask for a fresh one"
 *  rather than the generic "invalid or already used" copy. */
export async function getPartnerInviteByToken(token: string): Promise<PartnerInviteDetails | null> {
  if (!token) return null
  const [p] = await db
    .select()
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.inviteToken, token))
    .limit(1)
  if (!p) return null

  // Resolve the invite email's account state so the accept page can offer the
  // right path (create / password / magic-link) instead of blindly showing a
  // create-account form that would fail for an existing user.
  const { resolveAccountState } = await import('@/lib/auth/account-state')
  const { state: accountState } = await resolveAccountState(p.email)

  // Legacy rows (pre-0060) have a null inviteExpiresAt — treat as not expired
  // so an invite already in flight isn't broken by the migration.
  const expired = Boolean(p.inviteExpiresAt && new Date() > p.inviteExpiresAt)

  return {
    partnerId: p.id,
    name: p.name,
    email: p.email,
    alreadyLinked: Boolean(p.userId),
    expired,
    accountState,
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
  // Outlook-safe shell (VML button + copy-paste URL fallback) — partners are
  // B2B recipients (Outlook-desktop likely) and this link is their only way in.
  await deliver({
    to: args.to,
    subject: 'You’re invited to the Dream Create partner program',
    html: authEmailShell({
      heading: `Hi ${firstName},`,
      introHtml: `You've been added as a referral partner for <strong>Dream Create</strong>.
        Set up your partner account to see the clinics you refer, track your
        commission as it accrues, and connect a payout method to get paid.`,
      buttonUrl: url,
      buttonLabel: 'Set up my partner account',
      accent: '#1F6E7E',
      footnoteHtml: "If you weren't expecting this, you can safely ignore this email.",
    }),
  })
}
