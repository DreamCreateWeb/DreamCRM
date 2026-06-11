import 'server-only'

import { createHash } from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PAYOUT_MIN_CENTS } from '@/lib/types/referrals'

/**
 * Partner payouts via Stripe Connect EXPRESS accounts on the platform's OWN
 * Stripe account. The subscription money already landed in the platform
 * balance, so a payout is a `transfers.create` from that balance to the
 * partner's connected account — no card processing, no per-clinic Connect.
 *
 * We never store bank/debit data: KYC + the payout method are collected by
 * Stripe's hosted onboarding (account links). Status (`payouts_enabled`) is
 * read from the account and cached on the partner row, refreshed on portal
 * load (the shop-connect refresh pattern).
 */

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000'

/**
 * Ensure the partner has a Stripe Connect Express account. Creates one on
 * first call (capabilities: transfers requested), persists the id, returns it.
 */
export async function ensureExpressAccount(partnerId: string): Promise<string> {
  const [p] = await db
    .select({
      id: schema.referralPartner.id,
      email: schema.referralPartner.email,
      name: schema.referralPartner.name,
      accountId: schema.referralPartner.stripeConnectAccountId,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p) throw new Error('Partner not found')
  if (p.accountId) return p.accountId

  const account = await stripe.accounts.create({
    type: 'express',
    email: p.email,
    capabilities: { transfers: { requested: true } },
    business_type: 'individual',
    metadata: { referralPartnerId: p.id },
  })

  await db
    .update(schema.referralPartner)
    .set({ stripeConnectAccountId: account.id, updatedAt: new Date() })
    .where(eq(schema.referralPartner.id, partnerId))

  return account.id
}

/**
 * Hosted-onboarding link for the partner to add their payout method + complete
 * KYC. Refresh/return both land back on the portal with `?connect=refresh|done`
 * so we re-pull status on return.
 */
export async function createOnboardingLink(partnerId: string): Promise<{ url: string }> {
  const accountId = await ensureExpressAccount(partnerId)
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl()}/partner?connect=refresh`,
    return_url: `${appUrl()}/partner?connect=done`,
    type: 'account_onboarding',
  })
  return { url: link.url }
}

/**
 * Re-pull `payouts_enabled` from Stripe and cache it on the partner row.
 * No-op (returns the cached value) when there's no account. Fails open — a
 * Stripe blip leaves the cached flag as-is.
 */
export async function refreshPayoutStatus(partnerId: string): Promise<boolean> {
  const [p] = await db
    .select({
      accountId: schema.referralPartner.stripeConnectAccountId,
      cached: schema.referralPartner.payoutsEnabled,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p?.accountId) return false
  try {
    const acct = await stripe.accounts.retrieve(p.accountId)
    const enabled = acct.payouts_enabled ?? false
    if ((enabled ? 1 : 0) !== p.cached) {
      await db
        .update(schema.referralPartner)
        .set({ payoutsEnabled: enabled ? 1 : 0, updatedAt: new Date() })
        .where(eq(schema.referralPartner.id, partnerId))
    }
    return enabled
  } catch {
    return p.cached === 1
  }
}

/** Optional: a cheap "ending in 1234 · Bank" label for the portal, when Stripe
 *  returns an external account trivially. Returns null when not available —
 *  the UI just shows "Payouts active" without it. */
export async function getPayoutMethodLabel(partnerId: string): Promise<string | null> {
  const [p] = await db
    .select({ accountId: schema.referralPartner.stripeConnectAccountId })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p?.accountId) return null
  try {
    const acct = await stripe.accounts.retrieve(p.accountId)
    const ext = (acct.external_accounts?.data ?? [])[0] as
      | { object?: string; bank_name?: string | null; brand?: string | null; last4?: string | null }
      | undefined
    if (!ext?.last4) return null
    const name = ext.bank_name || ext.brand || (ext.object === 'card' ? 'Card' : 'Bank')
    return `${name} ···· ${ext.last4}`
  } catch {
    return null
  }
}

export interface PayoutResult {
  ok: boolean
  error?: string
  amountCents?: number
  payoutId?: number
}

/**
 * Pay a partner their accrued balance. Guards: payouts must be enabled and the
 * balance must be ≥ $25.00. Then:
 *   1. snapshot the accrued commission row ids + their summed cents,
 *   2. create the Stripe transfer FIRST (idempotency key derived from the
 *      claimed row set, so a retry can't double-pay),
 *   3. on transfer success, write the ledger in a transaction (insert the
 *      payout row + flip the claimed rows to 'paid' with the payout id).
 *
 * If the transfer throws, NO ledger write happens — the rows stay 'accrued',
 * safe to retry. If the ledger write fails AFTER a successful transfer, we log
 * loudly (money moved, ledger lagging — recoverable by hand) and record a
 * failed payout row so the discrepancy is visible.
 */
export async function payoutPartner(
  partnerId: string,
  opts: { initiatedBy: string },
): Promise<PayoutResult> {
  const [p] = await db
    .select({
      id: schema.referralPartner.id,
      accountId: schema.referralPartner.stripeConnectAccountId,
      payoutsEnabled: schema.referralPartner.payoutsEnabled,
      status: schema.referralPartner.status,
    })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.id, partnerId))
    .limit(1)
  if (!p) return { ok: false, error: 'Partner not found' }
  if (p.status === 'suspended') return { ok: false, error: 'This partner account is suspended' }
  if (!p.accountId || p.payoutsEnabled !== 1) {
    return { ok: false, error: 'Payout method not ready — set up payouts first' }
  }

  // Snapshot the accrued rows to pay.
  const accrued = await db
    .select({ id: schema.referralCommission.id, amountCents: schema.referralCommission.amountCents })
    .from(schema.referralCommission)
    .where(
      and(
        eq(schema.referralCommission.partnerId, partnerId),
        eq(schema.referralCommission.status, 'accrued'),
      ),
    )
  const totalCents = accrued.reduce((sum, r) => sum + r.amountCents, 0)
  if (totalCents < PAYOUT_MIN_CENTS) {
    return { ok: false, error: `Balance under $${(PAYOUT_MIN_CENTS / 100).toFixed(0)} minimum` }
  }
  const claimedIds = accrued.map((r) => r.id)

  // Idempotency key over the exact claimed row set — a retry with the same
  // accrued rows reuses the same transfer instead of paying twice.
  const idempotencyKey =
    'rpo_' +
    createHash('sha256')
      .update(`${partnerId}:${claimedIds.join(',')}`)
      .digest('hex')
      .slice(0, 40)

  let transferId: string
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: totalCents,
        currency: 'usd',
        destination: p.accountId,
        metadata: { referralPartnerId: partnerId, initiatedBy: opts.initiatedBy },
      },
      { idempotencyKey },
    )
    transferId = transfer.id
  } catch (err) {
    // Transfer failed — nothing claimed, rows stay accrued. Surface a clean
    // message; record a failed payout row for visibility.
    const msg = err instanceof Error ? err.message : 'Stripe transfer failed'
    console.warn('[referral-payout] transfer failed', partnerId, msg)
    try {
      await db.insert(schema.referralPayout).values({
        partnerId,
        amountCents: totalCents,
        status: 'failed',
        note: msg.slice(0, 500),
      })
    } catch {
      /* best-effort audit row */
    }
    return { ok: false, error: 'The payout could not be sent. Please try again.' }
  }

  // Transfer succeeded — finalize the ledger.
  try {
    let payoutId = 0
    await db.transaction(async (tx) => {
      const [payout] = await tx
        .insert(schema.referralPayout)
        .values({ partnerId, amountCents: totalCents, stripeTransferId: transferId, status: 'paid' })
        .returning({ id: schema.referralPayout.id })
      payoutId = payout.id
      await tx
        .update(schema.referralCommission)
        .set({ status: 'paid', payoutId })
        .where(inArray(schema.referralCommission.id, claimedIds))
    })
    return { ok: true, amountCents: totalCents, payoutId }
  } catch (err) {
    // Money moved but the ledger write failed. Loud log + a paid payout row so
    // the transfer isn't lost; the accrued rows can be reconciled by hand.
    console.error(
      '[referral-payout] CRITICAL: transfer',
      transferId,
      'succeeded but ledger update failed for partner',
      partnerId,
      err,
    )
    try {
      await db.insert(schema.referralPayout).values({
        partnerId,
        amountCents: totalCents,
        stripeTransferId: transferId,
        status: 'paid',
        note: 'Transfer sent; ledger reconciliation needed (commission rows not flipped).',
      })
    } catch {
      /* best-effort */
    }
    return { ok: true, amountCents: totalCents }
  }
}
