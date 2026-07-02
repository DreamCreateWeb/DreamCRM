import 'server-only'
import { and, desc, eq, ne } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { notifyOrgMembers } from './notifications'
import { queueCommLogWriteBack } from './pms'
import { toCsv, csvDollars } from '@/lib/csv'

/**
 * Booking deposits — a card deposit collected at PUBLIC online booking,
 * configured per visit type (`depositCents` in visit_type_settings; 0 = off,
 * the default — most clinics don't charge one). Money moves through the
 * clinic's connected Stripe account (direct charge — the balance-payments
 * rails exactly) and is credited toward the visit: the front desk posts it to
 * the PMS ledger from the reconciliation list; we never mutate the PMS
 * balance.
 *
 * Flow: the appointment books FIRST (the slot is what the patient came for —
 * a payments hiccup must never cost them the time), then the widget redirects
 * to Stripe Checkout. Finalization is idempotent (compare-and-swap pending →
 * paid) and fires from both the booking return page and the Connect webhook,
 * whichever lands first. A paid deposit auto-CONFIRMS the appointment —
 * putting money down is the strongest confirmation signal there is.
 */

function newDepositId(): string {
  return `bd_${randomBytes(10).toString('hex')}`
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

/** Clinic can collect deposits: Connect account active + charges enabled. */
export async function canTakeBookingDeposits(organizationId: string): Promise<boolean> {
  const cfg = await connectedAccount(organizationId)
  return Boolean(cfg?.accountId && cfg.status === 'active' && cfg.charges === 1)
}

/**
 * Create the pending deposit + Stripe Checkout session for a just-booked
 * appointment. Returns null (never throws) when the clinic can't take
 * payments or Stripe balks — the booking already exists and must stand;
 * callers treat null as "no deposit step".
 */
export async function createBookingDepositSession(input: {
  organizationId: string
  appointmentId: string
  patientId: string
  visitType: string
  visitTypeLabel: string
  amountCents: number
  patientEmail: string | null
  clinicName: string
  /** Absolute public /book URL of the clinic site (no trailing slash). */
  bookUrl: string
}): Promise<{ url: string } | null> {
  try {
    if (!Number.isInteger(input.amountCents) || input.amountCents < 100) return null
    const cfg = await connectedAccount(input.organizationId)
    if (!cfg?.accountId || cfg.status !== 'active' || cfg.charges !== 1) return null

    const depositId = newDepositId()
    await db.insert(schema.bookingDeposit).values({
      id: depositId,
      organizationId: input.organizationId,
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      visitType: input.visitType,
      amountCents: input.amountCents,
      status: 'pending',
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
              product_data: {
                name: `Booking deposit — ${input.visitTypeLabel} at ${input.clinicName}`,
                description: 'Credited toward your visit.',
              },
            },
          },
        ],
        ...(input.patientEmail ? { customer_email: input.patientEmail } : {}),
        success_url: `${input.bookUrl}?deposit_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.bookUrl}?deposit=later`,
        metadata: { kind: 'booking_deposit', depositId, organizationId: input.organizationId },
        payment_intent_data: {
          metadata: { kind: 'booking_deposit', depositId, organizationId: input.organizationId },
        },
      } as never,
      { stripeAccount: cfg.accountId },
    )

    await db
      .update(schema.bookingDeposit)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(schema.bookingDeposit.id, depositId))

    if (!session.url) return null
    return { url: session.url }
  } catch (err) {
    console.warn('[booking-deposits] session create failed — booking proceeds deposit-free', err)
    return null
  }
}

export interface DepositReceipt {
  amountCents: number
  visitType: string
  appointmentId: string | null
  patientFirstName: string
  status: string
}

/**
 * Idempotently mark a deposit paid once Stripe confirms, then auto-confirm
 * the appointment (scheduled → confirmed) — the race winner also notifies
 * the front desk to post it to the PMS. Safe from both the booking return
 * page and the Connect webhook. Returns the receipt for the return page
 * (null = unknown session).
 */
export async function finalizeBookingDepositFromSession(
  organizationId: string,
  sessionId: string,
): Promise<DepositReceipt | null> {
  const [deposit] = await db
    .select()
    .from(schema.bookingDeposit)
    .where(
      and(
        eq(schema.bookingDeposit.organizationId, organizationId),
        eq(schema.bookingDeposit.stripeCheckoutSessionId, sessionId),
      ),
    )
    .limit(1)
  if (!deposit) return null

  const [pat] = await db
    .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(eq(schema.patient.id, deposit.patientId))
    .limit(1)
  const receipt: DepositReceipt = {
    amountCents: deposit.amountCents,
    visitType: deposit.visitType,
    appointmentId: deposit.appointmentId,
    patientFirstName: pat?.firstName ?? 'there',
    status: 'paid',
  }
  if (deposit.status === 'paid') return receipt

  const cfg = await connectedAccount(organizationId)
  if (!cfg?.accountId) return null

  const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, {
    stripeAccount: cfg.accountId,
  })
  if (session.payment_status !== 'paid') return { ...receipt, status: deposit.status }

  const claimed = await db
    .update(schema.bookingDeposit)
    .set({
      status: 'paid',
      paidAt: new Date(),
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })
    .where(and(eq(schema.bookingDeposit.id, deposit.id), ne(schema.bookingDeposit.status, 'paid')))
    .returning({ id: schema.bookingDeposit.id })

  if (claimed.length > 0) {
    // Money down = confirmed. Only lift scheduled → confirmed; never touch a
    // visit the front desk has since cancelled/completed.
    if (deposit.appointmentId) {
      await db
        .update(schema.appointment)
        .set({ status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'deposit', updatedAt: new Date() })
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.id, deposit.appointmentId),
            eq(schema.appointment.status, 'scheduled'),
          ),
        )
    }
    const who = pat ? `${pat.firstName} ${pat.lastName ?? ''}`.trim() : 'A patient'
    const amount = `$${(deposit.amountCents / 100).toFixed(2)}`
    try {
      await notifyOrgMembers(
        organizationId,
        {
          bucket: 'comments',
          type: 'booking_deposit_paid',
          title: `Booking deposit — ${amount}`,
          body: `${who} paid a ${amount} deposit with their online booking. It's credited toward their visit — post it to your PMS ledger when you get a chance.`,
          linkPath: '/shop/payments',
        },
        { roles: ['owner', 'admin'] },
      )
    } catch (err) {
      console.warn('[booking-deposits] notify failed', err)
    }
    queueCommLogWriteBack(organizationId, deposit.patientId, {
      note: `Booking deposit of ${amount} collected online (credited toward the ${deposit.visitType.replace(/_/g, ' ')} visit).`,
      mode: 'Email',
    }).catch(() => {})
  }
  return receipt
}

/** Deposit status for one appointment (drawer pill). Null = no deposit. */
export async function depositForAppointment(
  organizationId: string,
  appointmentId: string,
): Promise<{ amountCents: number; status: string } | null> {
  const [row] = await db
    .select({ amountCents: schema.bookingDeposit.amountCents, status: schema.bookingDeposit.status })
    .from(schema.bookingDeposit)
    .where(
      and(
        eq(schema.bookingDeposit.organizationId, organizationId),
        eq(schema.bookingDeposit.appointmentId, appointmentId),
      ),
    )
    .orderBy(desc(schema.bookingDeposit.createdAt))
    .limit(1)
  return row ?? null
}

export interface BookingDepositRow {
  id: string
  patientId: string
  patientName: string
  visitType: string
  amountCents: number
  status: string
  paidAt: Date | null
  createdAt: Date
}

/** Clinic-side reconciliation list (paid deposits, most-recent first). */
export async function listRecentBookingDeposits(
  organizationId: string,
  limit = 50,
): Promise<BookingDepositRow[]> {
  const rows = await db
    .select({
      id: schema.bookingDeposit.id,
      patientId: schema.bookingDeposit.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      visitType: schema.bookingDeposit.visitType,
      amountCents: schema.bookingDeposit.amountCents,
      status: schema.bookingDeposit.status,
      paidAt: schema.bookingDeposit.paidAt,
      createdAt: schema.bookingDeposit.createdAt,
    })
    .from(schema.bookingDeposit)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.bookingDeposit.patientId))
    .where(
      and(
        eq(schema.bookingDeposit.organizationId, organizationId),
        eq(schema.bookingDeposit.status, 'paid'),
      ),
    )
    .orderBy(desc(schema.bookingDeposit.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.firstName} ${r.lastName ?? ''}`.trim(),
    visitType: r.visitType,
    amountCents: r.amountCents,
    status: r.status,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
  }))
}

/** Collected deposits as CSV for clinic bookkeeping. */
export async function exportBookingDepositsCsv(organizationId: string): Promise<string> {
  const rows = await listRecentBookingDeposits(organizationId, 100_000)
  const headers = ['Deposit ID', 'Date', 'Patient', 'Visit type', 'Amount', 'Status', 'Paid at']
  const csvRows = rows.map((r) => [
    r.id,
    r.createdAt.toISOString(),
    r.patientName,
    r.visitType.replace(/_/g, ' '),
    csvDollars(r.amountCents),
    r.status,
    r.paidAt ? r.paidAt.toISOString() : '',
  ])
  return toCsv(headers, csvRows)
}
