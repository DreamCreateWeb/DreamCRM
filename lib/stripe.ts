import Stripe from 'stripe'

type StripeInstance = Stripe.Stripe

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
