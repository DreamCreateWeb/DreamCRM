import Stripe from 'stripe'

// Under `moduleResolution: bundler` (Next 16.2+) the stripe ESM types expose
// the client class as the default export itself — `Stripe.Stripe` no longer
// exists, and referencing it silently degrades every downstream call to any.
type StripeInstance = Stripe

let cached: StripeInstance | null = null

function getStripe(): StripeInstance {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  cached = new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
  })
  return cached
}

// Proxy so importing `stripe` doesn't throw at module-eval time.
export const stripe = new Proxy({} as StripeInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe() as any, prop, receiver)
  },
})

/**
 * Read a subscription's current-period-end (unix seconds) regardless of API
 * version. Stripe REMOVED `current_period_end` from the Subscription object in
 * API version 2025-03-31.basil and moved it onto each subscription ITEM. We pin
 * a newer version (`2026-04-22.dahlia`), so the top-level field is `undefined`
 * — reading it silently yielded null renewal dates everywhere. Prefer the first
 * item's value; fall back to the legacy top-level field for older responses.
 */
export function subscriptionPeriodEnd(sub: unknown): number | null {
  const s = sub as {
    current_period_end?: number | null
    items?: { data?: Array<{ current_period_end?: number | null }> }
  }
  return s?.items?.data?.[0]?.current_period_end ?? s?.current_period_end ?? null
}
