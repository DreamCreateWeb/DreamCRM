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
 * PaymentIntent, how much has come back IN TOTAL, what the charge was worth,
 * and WHEN that reading of the charge was taken.
 *
 * `charge.refunded` carries the first three itself. The refund-object events
 * carry only one refund, so the CHARGE is fetched for the cumulative figure —
 * trusting a single refund's `amount` would understate a second partial refund
 * and mis-read it as "not fully refunded".
 *
 * `observedAt` is Stripe's `event.created`, and it is the ordering key
 * `lib/services/refunds.ts` uses to decide whether a snapshot may lower a
 * recorded total. A fetched charge is at least as fresh as the event that
 * triggered the fetch, so stamping it with the event's time under-claims its
 * freshness rather than over-claiming it — the safe direction, since an
 * un-orderable observation just falls back to the monotonic rule.
 *
 * WHICH REFUND-OBJECT EVENTS REACH THE CHARGE:
 *
 *  - `refund.created` with a terminal non-success status moved no money, so
 *    there is nothing to sync and skipping it saves an API call.
 *  - `charge.refund.updated` is NEVER skipped on status, because the status
 *    transition IS the news. A refund that goes pending → failed makes Stripe
 *    DECREMENT the charge's `amount_refunded`, and recording that decrement is
 *    the entire reason this event type is handled at all.
 */
async function refundFromEvent(
  event: { type: string; created?: number; data: { object: Record<string, any> } },
  stripeAccount: string,
): Promise<{
  paymentIntentId: string
  amountRefundedCents: number
  chargeAmountCents: number
  observedAt: Date | null
} | null> {
  let charge: RefundedCharge | null = null

  if (event.type === 'charge.refunded') {
    charge = event.data.object as RefundedCharge
  } else {
    const refund = event.data.object as {
      charge?: string | { id?: string } | null
      status?: string | null
    }
    if (
      event.type === 'refund.created' &&
      refund.status &&
      refund.status !== 'succeeded' &&
      refund.status !== 'pending'
    ) {
      return null
    }
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
    observedAt: typeof event.created === 'number' ? new Date(event.created * 1000) : null,
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'STRIPE_CONNECT_WEBHOOK_SECRET is not set' }, { status: 500 })

  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 })

  const body = await request.text()
  let event: { type: string; created?: number; data: { object: Record<string, any> } }
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
    } else if (
      event.type === 'charge.refunded' ||
      event.type === 'refund.created' ||
      event.type === 'charge.refund.updated'
    ) {
      // Money that came BACK. Without this the record keeps saying "Paid"
      // after a clinic refunds in the Stripe dashboard, and the front desk
      // reconciles its PMS ledger from a record the bank disagrees with.
      //
      // `charge.refund.updated` is here for money that came back and then
      // DIDN'T: a refund failing at the bank makes Stripe decrement the
      // charge's `amount_refunded`, and this is the only event that says so.
      // Register it in the Stripe dashboard alongside the other two, or a
      // failed refund stays recorded as money returned.
      //
      // Tenant scoping comes from `event.account` — Stripe naming the
      // connected account — not from event metadata, which a dashboard-issued
      // refund does not carry. No account, no org, no write.
      const accountId = (event as { account?: string }).account
      const orgId = accountId ? await orgIdForConnectedAccount(accountId) : null
      if (accountId && orgId) {
        const refund = await refundFromEvent(event, accountId)
        if (refund) {
          const updated = await recordConnectRefund({ organizationId: orgId, ...refund })
          // A refund we could not attach to anything is not an error — a
          // MEMBERSHIP subscription charge on the same connected account has
          // no row in the three tables we own (the membership row tracks the
          // subscription, not its charges), and neither does a charge that has
          // not been finalized yet, since the lookup key is stamped by the
          // finalizer. It is no longer SILENT either way: `recordConnectRefund`
          // writes a `connect_refund` receipt with `attached_to = 'none'`, and
          // the clinic sees it under Payments → Online. The log line stays for
          // us — Stripe gets its 200 and never retries, so a trail worth
          // grepping is still worth having.
          if (updated.length === 0) {
            console.warn('[stripe-connect webhook] refund matched no money record', {
              organizationId: orgId,
              paymentIntentId: refund.paymentIntentId,
              amountRefundedCents: refund.amountRefundedCents,
            })
          }
        }
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
