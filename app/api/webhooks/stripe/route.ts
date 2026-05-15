import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { clearSubscription, syncSubscriptionFromStripe } from '@/lib/services/billing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, { status: 500 })
  }

  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 })

  const body = await request.text()
  let event: { type: string; data: { object: Record<string, any> } }
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret) as any
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { subscription?: string | null }
        if (session.subscription && typeof session.subscription === 'string') {
          await syncSubscriptionFromStripe(session.subscription)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as { id: string }
        await syncSubscriptionFromStripe(sub.id)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string }
        await clearSubscription(sub.id)
        break
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as { subscription?: string | null }
        if (typeof invoice.subscription === 'string') {
          await syncSubscriptionFromStripe(invoice.subscription)
        }
        break
      }
      default:
        if (process.env.NODE_ENV !== 'production') {
          console.log('[stripe webhook] ignored event:', event.type)
        }
    }
  } catch (err) {
    console.error('[stripe webhook] handler error for', event.type, err)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
