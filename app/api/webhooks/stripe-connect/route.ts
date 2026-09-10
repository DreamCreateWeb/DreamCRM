import { NextResponse } from 'next/server'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'
import { finalizeBalancePaymentFromSession } from '@/lib/services/balance-payments'
import { finalizeBookingDepositFromSession } from '@/lib/services/booking-deposits'
import { finalizeMembershipFromSession, handleSubscriptionEvent } from '@/lib/services/membership'
import { syncConnectedAccountStatus, orgIdForConnectedAccount } from '@/lib/services/shop-connect'
import { recordConnectRefund } from '@/lib/services/refunds'

/**
 * Webhook for CONNECTED-ACCOUNT events (registered separately in Stripe for
 * "Connect" events). The reliable backstop for finalizing shop orders — the
 * success page also finalizes, and both call the idempotent finalizer, so
 * whichever fires first wins. Needs STRIPE_CONNECT_WEBHOOK_SECRET.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The Stripe Charge fields the refund path reads. */
interface RefundedCharge {
  id?: string
  payment_intent?: string | { id?: string } | null
  amount?: number | null
  amount_refunded?: number | null
}

/**
 * Normalize a refund event into the one shape our records need: which
 * PaymentIntent, how much has come back IN TOTAL, and what the charge was
 * worth. `charge.refunded` already carries all three. `refund.created`
 * carries only the single refund, so the charge is fetched for the
 * cumulative figure — trusting one refund's `amount` would understate a
 * second partial refund and mis-read it as "not fully refunded".
 *
 * Known gap, deliberately not covered: a refund that later FAILS
 * (`charge.refund.updated`, status `failed`) decrements Stripe's
 * `amount_refunded`, and our stored total never walks backwards. Rare, and
 * un-doing it needs an ordering rule this path does not have.
 */
async function refundFromEvent(
  event: { type: string; data: { object: Record<string, any> } },
  stripeAccount: string,
): Promise<{ paymentIntentId: string; amountRefundedCents: number; chargeAmountCents: number } | null> {
  let charge: RefundedCharge | null = null

  if (event.type === 'charge.refunded') {
    charge = event.data.object as RefundedCharge
  } else {
    const refund = event.data.object as {
      charge?: string | { id?: string } | null
      status?: string | null
    }
    // A refund that never succeeded moved no money back.
    if (refund.status && refund.status !== 'succeeded' && refund.status !== 'pending') return null
    const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id
    if (!chargeId) return null
    charge = (await stripe.charges.retrieve(chargeId, undefined, { stripeAccount })) as RefundedCharge
  }

  const paymentIntentId =
    typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id
  if (!paymentIntentId) return null

  return {
    paymentIntentId,
    amountRefundedCents: charge?.amount_refunded ?? 0,
    chargeAmountCents: charge?.amount ?? 0,
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'STRIPE_CONNECT_WEBHOOK_SECRET is not set' }, { status: 500 })

  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 })

  const body = await request.text()
  let event: { type: string; data: { object: Record<string, any> } }
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret) as never
  } catch (err) {
    console.error('[stripe-connect webhook] signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orgId = session.metadata?.organizationId as string | undefined
      if (orgId && session.id) {
        // Subscriptions are membership joins; one-time payments split on
        // metadata.kind — portal balance payments vs booking deposits vs shop orders.
        if (session.mode === 'subscription') await finalizeMembershipFromSession(orgId, session.id as string)
        else if (session.metadata?.kind === 'balance_payment')
          await finalizeBalancePaymentFromSession(orgId, session.id as string)
        else if (session.metadata?.kind === 'booking_deposit')
          await finalizeBookingDepositFromSession(orgId, session.id as string)
        else await finalizeOrderFromSession(orgId, session.id as string)
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const orgId = sub.metadata?.organizationId as string | undefined
      if (orgId && sub.id) {
        await handleSubscriptionEvent(orgId, sub.id as string, sub.status as string, subscriptionPeriodEnd(sub))
      }
    } else if (event.type === 'charge.refunded' || event.type === 'refund.created') {
      // Money that came BACK. Without this the record keeps saying "Paid"
      // after a clinic refunds in the Stripe dashboard, and the front desk
      // reconciles its PMS ledger from a record the bank disagrees with.
      //
      // Tenant scoping comes from `event.account` — Stripe naming the
      // connected account — not from event metadata, which a dashboard-issued
      // refund does not carry. No account, no org, no write.
      const accountId = (event as { account?: string }).account
      const orgId = accountId ? await orgIdForConnectedAccount(accountId) : null
      if (accountId && orgId) {
        const refund = await refundFromEvent(event, accountId)
        if (refund) await recordConnectRefund({ organizationId: orgId, ...refund })
      }
    } else if (event.type === 'account.updated') {
      // Stripe enabled/disabled capabilities on a connected account — keep our
      // stored status honest (a restricted account previously kept showing
      // "active" while its checkout failed).
      const accountId = (event as { account?: string }).account ?? (event.data.object.id as string | undefined)
      if (accountId) await syncConnectedAccountStatus(accountId)
    }
  } catch (err) {
    console.error('[stripe-connect webhook] handler error', err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
