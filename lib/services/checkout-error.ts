import 'server-only'

/**
 * What a patient is told when checkout can't start.
 *
 * Every checkout service raises TWO different kinds of failure and they must
 * not be shown the same way:
 *
 *  - Something the patient can act on — "that promo code has already been
 *    used", "only 2 left", "the minimum online payment is $1". Those messages
 *    are written FOR them, and hiding one behind a generic sentence would make
 *    a fixable cart look broken. They throw `CheckoutError`.
 *
 *  - Anything else — Stripe unreachable, the database down, a bug. The patient
 *    can do nothing with the underlying text, and on a PUBLIC clinic page it
 *    is at best confusing ("An error occurred with our connection to Stripe.
 *    Request was retried 1 times.") and at worst leaks internals. Those surface
 *    as CHECKOUT_UNAVAILABLE_MESSAGE and get logged server-side instead.
 *
 * A plain `throw` out of a server action is not a third option: Next.js
 * replaces the message with an opaque digest in production, so `err.message` on
 * the client renders "An error occurred in the Server Components render" — the
 * raw error a patient saw during an outage. Public checkout entry points return
 * `CheckoutStart` rather than throwing.
 */
export const CHECKOUT_UNAVAILABLE_MESSAGE =
  'We couldn’t start checkout just now, and nothing has been charged. Please try again in a few minutes — or give the office a call and we’ll take payment over the phone.'

/** An error whose message was written for the patient and is safe to show. */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutError'
  }
}

/** The shape every public "start a checkout" entry point returns. */
export type CheckoutStart = { ok: true; url: string } | { ok: false; error: string }

/**
 * Turn a thrown checkout failure into the public result shape. `scope` is the
 * log prefix ('shop-checkout', 'membership', …) — it is never shown to anyone.
 */
export function checkoutFailure(scope: string, err: unknown): { ok: false; error: string } {
  if (err instanceof CheckoutError) return { ok: false, error: err.message }
  // Not a message we wrote — log the real thing where staff can find it and
  // tell the patient something true and actionable instead.
  console.error(`[${scope}] checkout could not start`, err)
  return { ok: false, error: CHECKOUT_UNAVAILABLE_MESSAGE }
}
