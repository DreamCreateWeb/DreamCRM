import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'

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
      if (orgId && session.id) await finalizeOrderFromSession(orgId, session.id as string)
    }
  } catch (err) {
    console.error('[stripe-connect webhook] handler error', err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
