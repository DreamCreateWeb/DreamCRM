import 'server-only'
import { and, eq, ne } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'

/**
 * Online balance payments from the patient portal. Money moves through the
 * clinic's connected Stripe account (direct charge — same rails as the
 * shop), so payouts land in the clinic's bank. The PMS keeps owning the
 * clinical ledger: we record the payment for history + reconciliation and
 * NEVER mutate patient.pmsBalanceCents — the next PMS sync is the truth.
 *
 * Finalization is idempotent (compare-and-swap pending → paid) and fired
 * from both the portal return page and the Connect webhook, whichever
 * lands first — the shop-order pattern exactly.
 */

const MIN_PAYMENT_CENTS = 100 // Stripe's floor is 50¢; $1 keeps fees sane.

function newPaymentId(): string {
  return `bp_${randomBytes(10).toString('hex')}`
}

async function connectedAccount(organizationId: string) {
  const [row] = await db
    .select({
      accountId: schema.shopConfig.stripeAccountId,
      status: schema.shopConfig.stripeAccountStatus,
      charges: schema.shopConfig.chargesEnabled,
      currency: schema.shopConfig.currency,
    })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

/** Clinic can take online payments: Connect account active + charges enabled. */
export async function canTakeBalancePayments(organizationId: string): Promise<boolean> {
  const cfg = await connectedAccount(organizationId)
  return Boolean(cfg?.accountId && cfg.status === 'active' && cfg.charges === 1)
}

export async function createBalancePaymentSession(input: {
  organizationId: string
  patientId: string
  amountCents: number
  patientEmail: string | null
  clinicName: string
  baseUrl: string
}): Promise<{ url: string }> {
  const cfg = await connectedAccount(input.organizationId)
  if (!cfg?.accountId || cfg.status !== 'active' || cfg.charges !== 1) {
    throw new Error('Online payment isn’t available right now — give us a call and we’ll take it over the phone.')
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_PAYMENT_CENTS) {
    throw new Error('The minimum online payment is $1.')
  }

  // What the patient saw at pay time — reconciliation aid when the PMS
  // balance has moved by the time the front desk posts it.
  const [patientRow] = await db
    .select({ pmsBalanceCents: schema.patient.pmsBalanceCents })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.id, input.patientId),
        eq(schema.patient.organizationId, input.organizationId),
      ),
    )
    .limit(1)
  if (!patientRow) throw new Error('Patient not found')
  const balance = patientRow.pmsBalanceCents
  if (balance != null && input.amountCents > balance) {
    throw new Error('That’s more than your current balance — pay up to the balance shown.')
  }

  const paymentId = newPaymentId()
  await db.insert(schema.patientBalancePayment).values({
    id: paymentId,
    organizationId: input.organizationId,
    patientId: input.patientId,
    amountCents: input.amountCents,
    status: 'pending',
    balanceCentsAtPayment: balance,
  })

  const currency = cfg.currency || 'usd'
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: input.amountCents,
            product_data: { name: `Account balance payment — ${input.clinicName}` },
          },
        },
      ],
      ...(input.patientEmail ? { customer_email: input.patientEmail } : {}),
      success_url: `${input.baseUrl}/patient/invoices?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.baseUrl}/patient/invoices`,
      metadata: { kind: 'balance_payment', paymentId, organizationId: input.organizationId },
      payment_intent_data: {
        metadata: { kind: 'balance_payment', paymentId, organizationId: input.organizationId },
      },
    } as never,
    { stripeAccount: cfg.accountId },
  )

  await db
    .update(schema.patientBalancePayment)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(schema.patientBalancePayment.id, paymentId))

  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return { url: session.url }
}

/**
 * Idempotently mark a balance payment paid once Stripe confirms. Safe from
 * both the portal return page and the Connect webhook.
 */
export async function finalizeBalancePaymentFromSession(
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const [payment] = await db
    .select()
    .from(schema.patientBalancePayment)
    .where(
      and(
        eq(schema.patientBalancePayment.organizationId, organizationId),
        eq(schema.patientBalancePayment.stripeCheckoutSessionId, sessionId),
      ),
    )
    .limit(1)
  if (!payment || payment.status === 'paid') return

  const cfg = await connectedAccount(organizationId)
  if (!cfg?.accountId) return

  const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, {
    stripeAccount: cfg.accountId,
  })
  if (session.payment_status !== 'paid') return

  await db
    .update(schema.patientBalancePayment)
    .set({
      status: 'paid',
      paidAt: new Date(),
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })
    .where(
      and(
        eq(schema.patientBalancePayment.id, payment.id),
        ne(schema.patientBalancePayment.status, 'paid'),
      ),
    )
}

export interface PendingBalancePaymentRow {
  id: string
  patientName: string
  amountCents: number
  paidAt: Date | null
  createdAt: Date
  balanceCentsAtPayment: number | null
}

/**
 * Clinic-side reconciliation list: online payments the front desk still
 * needs to post to the PMS ledger. v1 surfaces PAID rows; "posted to PMS"
 * tracking can layer on later without schema change (note column exists).
 */
export async function listRecentBalancePayments(
  organizationId: string,
  limit = 50,
): Promise<PendingBalancePaymentRow[]> {
  return db
    .select({
      id: schema.patientBalancePayment.id,
      patientName: schema.patient.firstName,
      amountCents: schema.patientBalancePayment.amountCents,
      paidAt: schema.patientBalancePayment.paidAt,
      createdAt: schema.patientBalancePayment.createdAt,
      balanceCentsAtPayment: schema.patientBalancePayment.balanceCentsAtPayment,
    })
    .from(schema.patientBalancePayment)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.patientBalancePayment.patientId))
    .where(
      and(
        eq(schema.patientBalancePayment.organizationId, organizationId),
        eq(schema.patientBalancePayment.status, 'paid'),
      ),
    )
    .orderBy(schema.patientBalancePayment.createdAt)
    .limit(limit)
}
