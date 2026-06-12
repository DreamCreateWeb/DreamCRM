/**
 * Client-safe types + labels for the referral partner program. No server
 * imports here — the dashboard list page, partner portal, and tests all read
 * from this so labels/tones never drift.
 */

import type { Tone } from '@/lib/ui/encodings'

export type PartnerStatus = 'invited' | 'active' | 'suspended' | 'archived'
export type CommissionStatus = 'accrued' | 'paid' | 'reversed'
export type PayoutStatus = 'paid' | 'failed'

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
}

/** Status → semantic tone. invited = in flight (info/indigo), active = ok,
 *  suspended = neutral (deliberately not urgent — it's a chosen state),
 *  archived = neutral (closed account, preserved for audit — never an alarm
 *  color). */
export const PARTNER_STATUS_TONE: Record<PartnerStatus, Tone> = {
  invited: 'info',
  active: 'ok',
  suspended: 'neutral',
  archived: 'neutral',
}

/**
 * Which lifecycle path a delete request takes, computed from money history.
 * Drives the delete confirm modal's copy + the two-resolution choice.
 *   - 'clean'   → ZERO commission + payout rows → hard delete (row gone,
 *                 clinic attributions FK set-null, the linked user untouched).
 *   - 'archive' → money history exists, no outstanding balance → archive
 *                 (status='archived'; ledger/payouts preserved; clinics keep
 *                 their historical attribution).
 *   - 'resolve' → money history AND an accrued balance → must resolve the
 *                 balance first: pay it out now, or void it, then archive.
 */
export type PartnerDeleteDisposition = 'clean' | 'archive' | 'resolve'

/** Provenance of a clinic's effective referral rate/term: did the clinic carry
 *  an explicit per-clinic override, or is it live-resolving the partner's
 *  current default? Drives the "default"/"override" provenance labels. */
export type ReferralValueSource = 'default' | 'override'

/** Whether the partner's Connect payout method is ready. */
export type PayoutMethodState = 'none' | 'pending' | 'active'

export const PAYOUT_METHOD_LABELS: Record<PayoutMethodState, string> = {
  none: 'Not set up',
  pending: 'Finishing setup',
  active: 'Payouts active',
}

export const PAYOUT_METHOD_TONE: Record<PayoutMethodState, Tone> = {
  none: 'neutral',
  pending: 'warn',
  active: 'ok',
}

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  accrued: 'Accrued',
  paid: 'Paid',
  reversed: 'Reversed',
}

export const COMMISSION_STATUS_TONE: Record<CommissionStatus, Tone> = {
  accrued: 'warn',
  paid: 'ok',
  reversed: 'neutral',
}

/** Minimum accrued balance before a payout can run (Stripe-side minimums +
 *  to keep transfer fees sane). $25.00. */
export const PAYOUT_MIN_CENTS = 2500

/** Resolve the payout-method display state from cached `payoutsEnabled` +
 *  whether a Connect account exists at all. */
export function payoutMethodState(args: {
  hasConnectAccount: boolean
  payoutsEnabled: boolean
}): PayoutMethodState {
  if (!args.hasConnectAccount) return 'none'
  return args.payoutsEnabled ? 'active' : 'pending'
}

/** Format a basis-points rate as a percent string ("1000" → "10%"). Trims
 *  trailing zeros: 1250 → "12.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

/** Human term description from a months value (null = ongoing). */
export function formatTerm(months: number | null | undefined): string {
  if (months == null) return 'Ongoing'
  if (months === 12) return '12 months'
  return `${months} month${months === 1 ? '' : 's'}`
}

/** Whole-dollar money formatter for KPIs / tables (cents → "$1,234"). */
export function moneyFromCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/** Exact money formatter with cents (for the withdraw button / ledger). */
export function moneyExact(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}
