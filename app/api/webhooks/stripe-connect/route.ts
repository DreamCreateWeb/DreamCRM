import { NextResponse } from 'next/server'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'
import { finalizeBalancePaymentFromSession } from '@/lib/services/balance-payments'
import { finalizeMembershipFromSession, handleSubscriptionEvent } from '@/lib/services/membership'

/**
 * Webhook for CONNECTED-ACCOUNT events (registered separately in Stripe for
 * "Connect" events). The reliable backstop for finalizing shop orders — the
 * success page also finalizes, and both call the idempotent finalizer, so
 * whichever fires first wins. Needs STRIPE_CONNECT_WEBHOOK_SECRET.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
        // metadata.kind — portal balance payments vs shop orders.
        if (session.mode === 'subscription') await finalizeMembershipFromSession(orgId, session.id as string)
        else if (session.metadata?.kind === 'balance_payment')
          await finalizeBalancePaymentFromSession(orgId, session.id as string)
        else await finalizeOrderFromSession(orgId, session.id as string)
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const orgId = sub.metadata?.organizationId as string | undefined
      if (orgId && sub.id) {
        await handleSubscriptionEvent(orgId, sub.id as string, sub.status as string, subscriptionPeriodEnd(sub))
      }
    }
  } catch (err) {
    console.error('[stripe-connect webhook] handler error', err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
