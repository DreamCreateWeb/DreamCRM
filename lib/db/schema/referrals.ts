import { pgTable, text, integer, timestamp, serial } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

// ─────────────────────────────────────────────────────────────────────────────
// Referral partner program
//
// The platform owner has partners (e.g. an MSP helpdesk) who refer clinics.
// Each partner earns a commission — a percentage of every PAID subscription
// invoice from the clinics they referred, accrued automatically off the
// platform Stripe webhook, and paid out via Stripe Connect EXPRESS accounts on
// the platform's OWN Stripe account (subscription money already landed there).
//
// Partner tenancy follows the patient-portal precedent: a `referral_partner.
// user_id` linkage (NOT new org machinery). getTenantContext derives a
// 'partner' tenantType when the session user matches an active partner row and
// no platform/clinic membership takes precedence.
// ─────────────────────────────────────────────────────────────────────────────

export const referralPartner = pgTable('referral_partner', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  company: text('company'),
  // Lowercased + unique. The partner accepts their invite + (later) signs in
  // with this address.
  email: text('email').notNull().unique(),
  // 'invited' (created, not yet accepted) | 'active' | 'suspended'
  status: text('status').notNull().default('invited'),
  // Default commission rate in basis points (1000 = 10%). Copied onto a clinic
  // assignment when no per-clinic override is supplied. Editable; changes apply
  // to FUTURE accruals + new assignments only.
  defaultPercentBps: integer('default_percent_bps').notNull().default(1000),
  // Default term length in months from a clinic's referral_started_at. Null =
  // forever (accrue for the life of the subscription).
  defaultTermMonths: integer('default_term_months'),
  // Free-text terms note (visible to the partner, read-only, on their portal).
  termsNote: text('terms_note'),
  // Stripe Connect Express account id (acct_...). Null until they set up payouts.
  stripeConnectAccountId: text('stripe_connect_account_id'),
  // Cached `payouts_enabled` from the Connect account (0/1). Refreshed on portal
  // load (the shop-connect pattern); the source of truth is always Stripe.
  payoutsEnabled: integer('payouts_enabled').notNull().default(0),
  // Crypto-random invite token + when it was sent. Cleared once accepted.
  inviteToken: text('invite_token'),
  inviteSentAt: timestamp('invite_sent_at'),
  // When the invite token stops being acceptable (14 days from issue, matching
  // staff/patient invites). Null = no expiry recorded (legacy rows pre-0060 —
  // treated as still valid so an in-flight invite isn't broken by the
  // migration). Re-sending the invite refreshes this.
  inviteExpiresAt: timestamp('invite_expires_at'),
  // The better-auth user this partner signs in as. Set on accept. onDelete
  // 'set null' so deleting a user doesn't orphan the commission ledger.
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  // Demo partner (seeded with the Acme demo). Excluded from real payouts /
  // metrics the same way isDemo orgs are.
  isDemo: integer('is_demo').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// referral_commission — the accrual ledger. One row per PAID subscription
// invoice from a referred clinic, written idempotently from the platform Stripe
// webhook (UNIQUE stripe_invoice_id). amount_cents = invoice_total_cents ×
// percent_bps / 10000 (rounded DOWN). A payout sweeps 'accrued' → 'paid' and
// stamps payout_id.
export const referralCommission = pgTable('referral_commission', {
  id: serial('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => referralPartner.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  // Idempotency key — Stripe's invoice id. UNIQUE so a webhook retry can't
  // double-accrue (ON CONFLICT DO NOTHING).
  stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
  // The invoice's amount_paid in cents — the basis the commission is computed
  // from (audit trail).
  invoiceTotalCents: integer('invoice_total_cents').notNull(),
  // The rate this row was accrued at (snapshotted, so later rate changes don't
  // rewrite history).
  percentBps: integer('percent_bps').notNull(),
  amountCents: integer('amount_cents').notNull(),
  // 'accrued' (owed, unpaid) | 'paid' (swept into a payout) | 'reversed'
  status: text('status').notNull().default('accrued'),
  accruedAt: timestamp('accrued_at').notNull().defaultNow(),
  // The referral_payout that paid this row. Null while accrued.
  payoutId: integer('payout_id'),
})

// referral_payout — one row per money movement to a partner (a Stripe transfer
// from the platform balance to the partner's Connect account).
export const referralPayout = pgTable('referral_payout', {
  id: serial('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => referralPartner.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  // Stripe transfer id (tr_...). Null on a failed payout row.
  stripeTransferId: text('stripe_transfer_id'),
  // 'paid' | 'failed'
  status: text('status').notNull().default('paid'),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ReferralPartner = typeof referralPartner.$inferSelect
export type NewReferralPartner = typeof referralPartner.$inferInsert
export type ReferralCommission = typeof referralCommission.$inferSelect
export type ReferralPayout = typeof referralPayout.$inferSelect
