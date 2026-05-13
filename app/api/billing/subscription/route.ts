import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getPlanByPriceId } from '@/lib/stripe-config'

export async function GET() {
  try {
    const customerId = process.env.STRIPE_CUSTOMER_ID
    if (!customerId) {
      return NextResponse.json({ subscription: null })
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
      expand: ['data.default_payment_method', 'data.items.data.price'],
    })

    if (!subscriptions.data.length) {
      return NextResponse.json({ subscription: null })
    }

    const sub = subscriptions.data[0]
    const item = sub.items.data[0]
    const priceId = item?.price.id ?? ''
    const plan = getPlanByPriceId(priceId)
    const interval = item?.price.recurring?.interval ?? 'month'

    const pm = sub.default_payment_method
    const card =
      pm && typeof pm !== 'string' && pm.card
        ? { brand: pm.card.brand, last4: pm.card.last4 }
        : null

    return NextResponse.json({
      subscription: {
        id: sub.id,
        status: sub.status,
        planId: plan?.id ?? null,
        planName: plan?.name ?? 'Unknown',
        interval,
        currentPeriodEnd: item?.current_period_end ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        card,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
