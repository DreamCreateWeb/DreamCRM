import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST() {
  try {
    const customerId = process.env.STRIPE_CUSTOMER_ID
    if (!customerId) {
      return NextResponse.json(
        { error: 'No Stripe customer configured' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
