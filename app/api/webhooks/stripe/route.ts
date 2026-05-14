import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { getPlanByPriceId } from '@/lib/stripe-config'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'

interface StripeEvent {
  type: string
  data: { object: Record<string, unknown> }
}

async function resolveOrgId(customerId: string | null, fallback?: string | null): Promise<string | null> {
  if (fallback) return fallback
  if (!customerId) return null
  const customer = await stripe.customers.retrieve(customerId)
  if ((customer as { deleted?: boolean }).deleted) return null
  const orgId = ((customer as { metadata?: Record<string, string> }).metadata)?.organizationId
  return orgId ?? null
}

function planTierFromPriceId(priceId: string | undefined): string | null {
  if (!priceId) return null
  const plan = getPlanByPriceId(priceId)
  return plan?.id ?? null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret || !sig) {
    return NextResponse.json({ error: 'Missing webhook secret or signature' }, { status: 400 })
  }

  let event: StripeEvent
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret) as unknown as StripeEvent
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  const obj = event.data.object

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const customerId = asString(obj.customer)
        const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
        const orgId = await resolveOrgId(customerId, metadata.organizationId)
        if (orgId && customerId) {
          await db
            .update(clinicProfile)
            .set({ stripeCustomerId: customerId, updatedAt: new Date() })
            .where(eq(clinicProfile.organizationId, orgId))
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const customerId = asString(obj.customer)
        if (!customerId) break
        const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
        const orgId = await resolveOrgId(customerId, metadata.organizationId)
        if (!orgId) break

        const items = (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? []
        const priceId = items[0]?.price?.id
        const planTier = planTierFromPriceId(priceId)
        const status = asString(obj.status)
        const subId = asString(obj.id)

        await db
          .update(clinicProfile)
          .set({
            stripeCustomerId: customerId,
            ...(subId ? { stripeSubscriptionId: subId } : {}),
            ...(status ? { subscriptionStatus: status } : {}),
            ...(planTier ? { planTier } : {}),
            updatedAt: new Date(),
          })
          .where(eq(clinicProfile.organizationId, orgId))
        break
      }

      case 'customer.subscription.deleted': {
        const customerId = asString(obj.customer)
        if (!customerId) break
        const metadata = (obj.metadata as Record<string, string> | undefined) ?? {}
        const orgId = await resolveOrgId(customerId, metadata.organizationId)
        if (!orgId) break

        await db
          .update(clinicProfile)
          .set({
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
            updatedAt: new Date(),
          })
          .where(eq(clinicProfile.organizationId, orgId))
        break
      }

      case 'invoice.payment_failed': {
        const customerId = asString(obj.customer)
        if (!customerId) break
        const orgId = await resolveOrgId(customerId)
        if (!orgId) break

        await db
          .update(clinicProfile)
          .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
          .where(eq(clinicProfile.organizationId, orgId))
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[Stripe webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
