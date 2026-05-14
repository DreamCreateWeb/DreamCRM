import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { PLANS, type PlanId } from '@/lib/stripe-config'
import { getClinicBillingContext } from '@/lib/billing/context'

export async function POST(req: NextRequest) {
  try {
    const ctx = await getClinicBillingContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { planId, successPath, cancelPath }: { planId: PlanId; successPath?: string; cancelPath?: string } = await req.json()

    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    if (!plan.priceId) {
      return NextResponse.json({ error: `Price ID not configured for ${planId}` }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer: ctx.customerId,
      success_url: `${appUrl}${successPath ?? '/settings/billing?success=true'}`,
      cancel_url: `${appUrl}${cancelPath ?? '/settings/plans'}`,
      subscription_data: {
        metadata: { organizationId: ctx.organizationId, planId },
      },
      metadata: { organizationId: ctx.organizationId, planId },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
