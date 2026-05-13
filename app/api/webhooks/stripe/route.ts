import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret || !sig) {
    return NextResponse.json({ error: 'Missing webhook secret or signature' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  const obj = event.data?.object ?? {}

  switch (event.type as string) {
    case 'checkout.session.completed':
      if (obj.customer) {
        console.log('[Stripe] Checkout complete. Customer ID:', obj.customer)
        console.log('[Stripe] Add STRIPE_CUSTOMER_ID =', obj.customer, 'to your Vercel env vars.')
      }
      break

    case 'customer.subscription.updated':
      console.log('[Stripe] Subscription updated:', obj.id, 'status:', obj.status)
      break

    case 'customer.subscription.deleted':
      console.log('[Stripe] Subscription cancelled:', obj.id)
      break

    case 'invoice.payment_succeeded':
      console.log('[Stripe] Payment succeeded:', obj.id, 'amount:', obj.amount_paid)
      break

    case 'invoice.payment_failed':
      console.log('[Stripe] Payment failed:', obj.id)
      break

    default:
      break
  }

  return NextResponse.json({ received: true })
}
