import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * One-time admin endpoint for setup actions that need runtime envs.
 * Removed in a follow-up commit immediately after the operations succeed.
 *
 * Actions:
 *   POST /api/admin/bootstrap
 *   Authorization: Bearer <ADMIN_BOOTSTRAP_TOKEN>
 *   { "action": "stripe-setup", "url": "https://your.domain" }
 *     creates webhook, returns whsec
 *   { "action": "stripe-verify-prices" }
 *     looks up the 6 STRIPE_PRICE_* envs against Stripe
 *   { "action": "stripe-list-webhooks" }
 *     lists existing webhook endpoints
 *   { "action": "stripe-delete-webhook", "id": "we_..." }
 *     deletes a webhook endpoint by id
 */

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function checkAuth(request: Request): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return false
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const

export async function POST(request: Request) {
  if (!checkAuth(request)) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    url?: string
    id?: string
  }
  const action = body.action

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia', typescript: true })

  if (action === 'stripe-setup') {
    const url = body.url
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

    // Find or delete any existing webhook pointing at the same URL so we
    // don't end up with duplicates after re-runs.
    const existing = await stripe.webhookEndpoints.list({ limit: 100 })
    const dupes = existing.data.filter((w: any) => w.url === url)
    for (const dupe of dupes) {
      await stripe.webhookEndpoints.del(dupe.id)
    }

    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: [...WEBHOOK_EVENTS] as any,
      description: 'DreamCRM subscription + invoice sync',
    })

    return NextResponse.json({
      ok: true,
      created: {
        id: created.id,
        url: created.url,
        events: created.enabled_events,
      },
      removedDuplicates: dupes.map((d: any) => d.id),
      // SECRET — caller must paste into Vercel env STRIPE_WEBHOOK_SECRET
      secret: created.secret,
    })
  }

  if (action === 'stripe-verify-prices') {
    const ids = {
      starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
      professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
      professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
      enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      enterprise_annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    }
    const results: Record<string, unknown> = {}
    for (const [key, priceId] of Object.entries(ids)) {
      if (!priceId) {
        results[key] = { configured: false }
        continue
      }
      try {
        const p = await stripe.prices.retrieve(priceId, { expand: ['product'] })
        const product = typeof p.product === 'object' && !('deleted' in p.product) ? p.product : null
        results[key] = {
          configured: true,
          id: p.id,
          product: product?.name,
          unit_amount: p.unit_amount,
          currency: p.currency,
          interval: p.recurring?.interval,
          active: p.active,
        }
      } catch (err) {
        results[key] = { configured: true, id: priceId, error: (err as Error).message }
      }
    }
    return NextResponse.json({ ok: true, prices: results })
  }

  if (action === 'stripe-list-webhooks') {
    const list = await stripe.webhookEndpoints.list({ limit: 100 })
    return NextResponse.json({
      ok: true,
      webhooks: list.data.map((w: any) => ({
        id: w.id,
        url: w.url,
        status: w.status,
        events: w.enabled_events,
        description: w.description,
      })),
    })
  }

  if (action === 'stripe-delete-webhook') {
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const result = await stripe.webhookEndpoints.del(body.id)
    return NextResponse.json({ ok: true, deleted: result.id })
  }

  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
}
