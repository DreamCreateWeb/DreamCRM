import 'server-only'
import { BILLING_UNAVAILABLE_MESSAGE, type BillingActionState } from '@/lib/types/billing-action'

/**
 * What a clinic's owner or admin is told when a BILLING action can't start.
 *
 * The staff-side sibling of `lib/services/checkout-error.ts` (patient checkout)
 * and `lib/services/public-form-error.ts` (public forms). Same reasoning, same
 * reason it exists at all: a plain `throw` out of a server action does not
 * reach the person who clicked. Next.js replaces a thrown server-action message
 * with an opaque digest in production, so every carefully worded refusal —
 * "Only an owner or admin can change billing." — arrived on screen as "An error
 * occurred in the Server Components render", or, on a bare `<form action={…}>`
 * with nothing reading a result, as nothing at all.
 *
 * The result SHAPE and the two user-facing sentences live in
 * `lib/types/billing-action.ts`, because the client call sites need them and
 * this module is `server-only`. What lives here is the classifier.
 *
 * Two lanes, as in both siblings, but decided by POSITION rather than by an
 * error class, and deliberately so:
 *
 *  - A REFUSAL we wrote — wrong tenant type, wrong role, a plan that is not
 *    self-serve. Those sentences are written for the reader and are returned
 *    directly by the action, before anything is attempted. No classification
 *    step can mis-assign them because there is no throw to classify.
 *
 *  - Anything the Stripe/DB leg raises — an unconfigured price id, Stripe
 *    unreachable, a bug. `Stripe price for Premium (annual) is not configured`
 *    is a sentence about OUR deployment, not about anything a clinic can do;
 *    it gets logged where staff can find it and the reader is told something
 *    true and actionable instead. That leg is the only code inside the try.
 *
 * Which is why `message` is a parameter rather than a constant: the two legs of
 * `startStripeCheckout` have different things to say about money. Opening a
 * Checkout session has charged nothing; the in-place plan swap may already have
 * committed a proration by the time its sync throws (`PLAN_CHANGE_UNCONFIRMED_
 * MESSAGE`). One try per leg, one sentence per try.
 *
 * Why this is NOT the `{ ok: true } | { ok: false; error }` shape its two
 * siblings use: every action here ends in `redirect()` on success, which throws
 * NEXT_REDIRECT, so the success value is unreachable — a resolved result from
 * one of these actions is ALWAYS a failure. A `{ ok: true }` arm would be a
 * branch no caller can ever take, and an initial `useActionState` value would
 * have to claim a success that has not happened. `{ error }` says exactly what
 * the type can actually hold. The corollary, and the thing to keep in mind when
 * editing one of these actions: the `redirect()` call must stay OUTSIDE the
 * try, or the try swallows the navigation instead of performing it.
 */

/**
 * Turn a thrown billing failure into the staff result shape. `scope` is the log
 * prefix ('settings.checkout', 'settings.portal', …) — it is never shown to
 * anyone. `message` defaults to the "nothing has been charged" line; pass one
 * when that claim would not be true of the leg that failed.
 */
export function billingActionFailure(
  scope: string,
  err: unknown,
  message: string = BILLING_UNAVAILABLE_MESSAGE,
): BillingActionState {
  console.error(`[${scope}] billing action failed`, err)
  return { error: message }
}

export {
  BILLING_UNAVAILABLE_MESSAGE,
  PLAN_CHANGE_UNCONFIRMED_MESSAGE,
  type BillingActionState,
} from '@/lib/types/billing-action'
