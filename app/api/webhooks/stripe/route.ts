import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db, schema } from '@/lib/db'
import { clearSubscription, syncSubscriptionFromStripe } from '@/lib/services/billing'
import { notifyOrgMembers } from '@/lib/services/notifications'

/**
 * Find the platform organization id (Dream Create) so we can ping its
 * owners + admins about subscription events. Cached implicitly per request.
 */
async function platformOrgId(): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.type, 'platform'))
    .limit(1)
  return row?.id ?? null
}

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
        const session = event.data.object as {
          subscription?: string | null
          customer_details?: { email?: string; name?: string }
        }
        if (session.subscription && typeof session.subscription === 'string') {
          await syncSubscriptionFromStripe(session.subscription)
        }
        const orgId = await platformOrgId()
        if (orgId) {
          const who = session.customer_details?.name || session.customer_details?.email || 'a new clinic'
          await notifyOrgMembers(
            orgId,
            {
              bucket: 'comments',
              type: 'clinic_signup',
              title: `New clinic signed up`,
              body: `${who} just completed checkout and is provisioned on DreamCRM.`,
              linkPath: '/ecommerce/customers',
            },
            { roles: ['owner', 'admin'] },
          )
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
        const sub = event.data.object as { id: string; customer?: string }
        await clearSubscription(sub.id)
        const orgId = await platformOrgId()
        if (orgId) {
          await notifyOrgMembers(
            orgId,
            {
              bucket: 'comments',
              type: 'subscription_cancelled',
              title: `Clinic cancelled subscription`,
              body: `A clinic just cancelled. Check the Subscriptions module for context.`,
              linkPath: '/ecommerce/invoices',
              meta: { subscriptionId: sub.id, customerId: sub.customer },
            },
            { roles: ['owner', 'admin'] },
          )
        }
        break
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as {
          subscription?: string | null
          customer_email?: string
          amount_due?: number
          currency?: string
        }
        if (typeof invoice.subscription === 'string') {
          await syncSubscriptionFromStripe(invoice.subscription)
        }
        if (event.type === 'invoice.payment_failed') {
          const orgId = await platformOrgId()
          if (orgId) {
            const amount = invoice.amount_due
              ? `$${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency ?? 'usd').toUpperCase()}`
              : 'a payment'
            await notifyOrgMembers(
              orgId,
              {
                bucket: 'comments',
                type: 'payment_failed',
                title: `Payment failed`,
                body: `${invoice.customer_email ?? 'A clinic'} failed to pay ${amount}. Stripe will retry automatically; reach out if it stays unpaid.`,
                linkPath: '/ecommerce/invoices',
                meta: { subscriptionId: invoice.subscription ?? null },
              },
              { roles: ['owner', 'admin'] },
            )
          }
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
