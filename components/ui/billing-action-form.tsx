'use client'

import { useActionState, type ReactNode } from 'react'
import type { BillingInterval, PlanId } from '@/lib/stripe-config'
import type { BillingActionState } from '@/lib/services/billing-action-error'
import { startStripeCheckoutFormAction } from '@/app/(default)/settings/actions'
import { startActivationCheckoutFormAction } from '@/app/(default)/billing/activate/actions'

/**
 * The `<form>` halves of the billing actions that a clinic reaches through a
 * plain form submit rather than a click handler — the trial-ended wall and the
 * managed-activation page.
 *
 * Why they exist at all: both surfaces used a bare
 * `<form action={someServerAction}>`, which has nowhere to put a result. The
 * action's refusal ("Only an owner or admin can change billing.", "Stripe is
 * unreachable") went into the void, and the button — on the LAST screen a
 * clinic sees before it loses access — simply did nothing when pressed. A dead
 * purchase button on the screen where a dead purchase button costs the most.
 *
 * `useActionState` gives each form somewhere to land. The actions return
 * `BillingActionState` and only ever RESOLVE on failure (the success path
 * redirects to Stripe), so a non-null `error` here is always a real refusal and
 * never a stale success.
 *
 * The button is the caller's, passed as children, because the two surfaces
 * style it differently and neither should have to inherit the other's look.
 */

/** The shared refusal slot. Same one-string ink/surface pair the Settings →
 *  Billing panel already uses for this exact message, so the two read alike. */
export function BillingActionError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p
      role="alert"
      className="mt-3 rounded-[var(--r-sm)] bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
    >
      {error}
    </p>
  )
}

/** Self-serve plan purchase — one form per plan, so each plan's refusal shows
 *  under the plan the clinic actually pressed. */
export function PlanCheckoutForm({
  planId,
  interval,
  className,
  children,
}: {
  planId: PlanId
  interval: BillingInterval
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState<BillingActionState, FormData>(
    startStripeCheckoutFormAction.bind(null, planId, interval),
    { error: null },
  )
  return (
    <form action={formAction} className={className}>
      {children}
      <BillingActionError error={state.error} />
    </form>
  )
}

/** Managed-clinic activation — the coupon-pre-applied checkout for a plan
 *  reserved at an agreed price. Same dead-button defect, same fix. */
export function ActivationCheckoutForm({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState<BillingActionState, FormData>(
    startActivationCheckoutFormAction,
    { error: null },
  )
  return (
    <form action={formAction} className={className}>
      {children}
      <BillingActionError error={state.error} />
    </form>
  )
}
