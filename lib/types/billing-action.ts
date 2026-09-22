// Client-safe half of the staff billing-action result shape. The server-side
// helper and the full reasoning live in `lib/services/billing-action-error.ts`;
// these two sentences are HERE because the client call sites need them too —
// the Settings panel has to say something when a billing action rejects at the
// transport layer, and a `server-only` module cannot be imported there.

/** The state a billing form action carries. `null` means "nothing has failed" —
 *  either nothing has been attempted yet, or the attempt navigated away. */
export type BillingActionState = { error: string | null }

/**
 * The generic failure. Note the money claim in it: "nothing has been charged"
 * is TRUE of every leg that returns this one — opening a Checkout session, a
 * Customer Portal session, an activation checkout — because none of them has
 * moved money by the time they can fail.
 *
 * It is deliberately NOT used for the in-place plan swap; see below.
 */
export const BILLING_UNAVAILABLE_MESSAGE =
  'We couldn’t start that just now, and nothing has been charged. Please try again in a few minutes — if it keeps happening, contact support and we’ll sort it out.'

/**
 * The plan-swap leg's own sentence, and the reason it exists (Sentinel's N1 on
 * #663). `updateSubscriptionPlan` calls `stripe.subscriptions.update(…,
 * proration_behavior: 'create_prorations')` and THEN syncs the result back. If
 * the sync half throws — a Stripe retrieve blips, the DB write fails — the
 * subscription is already on the new price with prorations queued onto the
 * next invoice, so telling that clinic "nothing has been charged" is a false
 * statement about their money.
 *
 * It does not promise the change failed either, because we do not know: a
 * retry re-enters `updateSubscriptionPlan`, finds the item already on the new
 * price, skips the swap and only re-runs the sync — so it is safe to try
 * again, and it is safe to go and look.
 */
export const PLAN_CHANGE_UNCONFIRMED_MESSAGE =
  'We couldn’t confirm that plan change. Open Settings → Billing to see which plan you’re on before trying again — and if it still looks wrong, contact support.'
