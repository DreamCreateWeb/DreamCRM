import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db, schema } from '@/lib/db'
import {
  claimStripeEvent,
  clearSubscription,
  releaseStripeEvent,
  syncSubscriptionFromStripe,
} from '@/lib/services/billing'
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
  total_excluding_tax?: number | null
  tax?: number | null
}): Promise<void> {
  if (!invoice.id || !invoice.customer || !invoice.amount_paid) return
  // Accrue commission on the PRE-TAX amount. Stripe Tax is on every checkout, so
  // amount_paid includes sales tax the platform remits to the state — paying a
  // partner a cut of that is a revenue leak. Prefer total_excluding_tax; fall
  // back to amount_paid minus the collected tax.
  const netCents = invoice.total_excluding_tax ?? invoice.amount_paid - (invoice.tax ?? 0)
  if (!Number.isFinite(netCents) || netCents <= 0) return
  const [profile] = await db
    .select({ organizationId: schema.clinicProfile.organizationId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.stripeCustomerId, invoice.customer))
    .limit(1)
  if (!profile) return
  await accrueCommissionForInvoice({
    organizationId: profile.organizationId,
    stripeInvoiceId: invoice.id,
    amountPaidCents: Math.round(netCents),
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
  let event: { id: string; type: string; data: { object: Record<string, any> } }
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret) as any
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // Idempotency: claim the event id BEFORE handling. A retried/duplicate
  // delivery (Stripe retries on timeout, App Runner restarts mid-process) is a
  // no-op so it can't double-notify or re-run side effects. Best-effort — if the
  // ledger itself errors we fall through and process rather than drop the event.
  try {
    const claimed = await claimStripeEvent(event.id, event.type)
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch (err) {
    console.warn('[stripe webhook] idempotency claim failed; processing anyway', err)
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
          total_excluding_tax?: number | null
          tax?: number | null
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
      // A clinic that pays and is then refunded (or charges back) never
      // produced that revenue — an accrued referral commission on it is money
      // the platform would simply lose. Reverse it. Best-effort + idempotent:
      // this must never break billing sync, and a replayed event is a no-op.
      case 'charge.refunded':
      case 'charge.dispute.created': {
        try {
          let invoiceId: string | null = null
          if (event.type === 'charge.refunded') {
            const charge = event.data.object as { invoice?: string | null }
            invoiceId = typeof charge.invoice === 'string' ? charge.invoice : null
          } else {
            // A dispute carries the charge id, not the invoice — resolve it.
            const dispute = event.data.object as { charge?: string | null }
            if (typeof dispute.charge === 'string') {
              const charge = (await stripe.charges.retrieve(dispute.charge)) as unknown as {
                invoice?: string | null
              }
              invoiceId = typeof charge.invoice === 'string' ? charge.invoice : null
            }
          }
          if (invoiceId) {
            const { reverseCommissionForInvoice } = await import('@/lib/services/referrals')
            await reverseCommissionForInvoice(
              invoiceId,
              event.type === 'charge.refunded' ? 'refund' : 'dispute',
            )
          }
        } catch (err) {
          console.warn('[stripe webhook] commission reversal failed (non-fatal)', err)
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
    // Free the idempotency claim so Stripe's automatic retry re-processes this
    // event instead of it being permanently marked done.
    try {
      await releaseStripeEvent(event.id)
    } catch (releaseErr) {
      console.warn('[stripe webhook] failed to release event claim', releaseErr)
    }
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
