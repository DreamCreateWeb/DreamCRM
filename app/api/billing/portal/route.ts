import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getClinicBillingContext } from '@/lib/billing/context'

export async function POST() {
  try {
    const ctx = await getClinicBillingContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: ctx.customerId,
      return_url: `${appUrl}/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
