import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db, schema } from '@/lib/db'
import { clearSubscription, syncSubscriptionFromStripe } from '@/lib/services/billing'
import { notifyOrgMembers } from '@/lib/services/notifications'
import { accrueCommissionForInvoice } from '@/lib/services/referrals'

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

/**
 * Resolve the clinic org for a paid invoice (via its Stripe customer id) and
 * accrue referral commission for the partner who referred that clinic, if any.
 * No-op when the invoice has no customer or no matching clinic_profile.
 */
async function accrueReferralForInvoice(invoice: {
  id?: string
  customer?: string | null
  amount_paid?: number
}): Promise<void> {
  if (!invoice.id || !invoice.customer || !invoice.amount_paid) return
  const [profile] = await db
    .select({ organizationId: schema.clinicProfile.organizationId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.stripeCustomerId, invoice.customer))
    .limit(1)
  if (!profile) return
  await accrueCommissionForInvoice({
    organizationId: profile.organizationId,
    stripeInvoiceId: invoice.id,
    amountPaidCents: invoice.amount_paid,
  })
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
          id?: string
          subscription?: string | null
          customer?: string | null
          customer_email?: string
          amount_due?: number
          amount_paid?: number
          currency?: string
        }
        if (typeof invoice.subscription === 'string') {
          await syncSubscriptionFromStripe(invoice.subscription)
        }
        // Referral commission accrual — best-effort, AFTER the subscription
        // sync so the clinic_profile (incl. its referral_partner_id) is fresh.
        // Wrapped so it can NEVER break billing sync.
        if (event.type === 'invoice.payment_succeeded') {
          try {
            await accrueReferralForInvoice(invoice)
          } catch (err) {
            console.warn('[stripe webhook] referral accrual failed (non-fatal)', err)
          }
        }
        if (event.type === 'invoice.payment_failed') {
          const amount = invoice.amount_due
            ? `$${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency ?? 'usd').toUpperCase()}`
            : 'a payment'
          const orgId = await platformOrgId()
          if (orgId) {
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
          // Email the CLINIC owner too (the in-app dunning banner only reaches
          // them on next login). Best-effort — never break the webhook.
          if (typeof invoice.customer === 'string') {
            try {
              const { sendPaymentFailedEmailForCustomer } = await import('@/lib/services/billing-notifications')
              await sendPaymentFailedEmailForCustomer(invoice.customer, amount)
            } catch (err) {
              console.warn('[stripe webhook] clinic dunning email failed (non-fatal)', err)
            }
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
