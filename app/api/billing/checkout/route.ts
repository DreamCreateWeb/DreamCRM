import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { PLANS, type PlanId } from '@/lib/stripe-config'

export async function POST(req: NextRequest) {
  try {
    const { planId }: { planId: PlanId } = await req.json()

    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    if (!plan.priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for ${planId}` },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const customerId = process.env.STRIPE_CUSTOMER_ID

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?success=true`,
      cancel_url: `${appUrl}/settings/plans`,
      ...(customerId
        ? { customer: customerId }
        : { customer_email: 'contact@dreamcreateweb.com' }),
      subscription_data: {
        metadata: { planId },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
