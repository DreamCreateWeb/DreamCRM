'use client'

import { useTransition } from 'react'
import { openBillingPortal } from '@/app/(default)/settings/actions'
import { PLANS } from '@/lib/stripe-config'
import { isDunningStatus, subscriptionStatusMeta } from '@/lib/billing-status'
import type { TenantContext } from '@/lib/auth/context'

/**
 * Persistent payment-failure (dunning) banner. Renders only for clinic
 * owners/admins whose subscription is in a payment-broken state (past_due /
 * unpaid / incomplete_expired) — those statuses keep full access today with no
 * persistent nudge, so a clinic could silently lapse. Amber for past_due (still
 * recoverable on the same card), rose for the harder-failure states.
 *
 * Mounted in DashboardShell right beside BillingActivationBanner. The
 * activation banner wins if both somehow apply, so we never double-stack.
 */
export default function BillingDunningBanner({ ctx }: { ctx: TenantContext }) {
  const [pending, startTransition] = useTransition()

  // The managed-clinic activation banner takes precedence — don't double-stack.
  if (ctx.billingActivationPending) return null
  if (ctx.tenantType !== 'clinic') return null
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return null
  if (!isDunningStatus(ctx.subscriptionStatus)) return null

  const meta = subscriptionStatusMeta(ctx.subscriptionStatus)
  const planName = PLANS.find((p) => p.id === ctx.planTier)?.name ?? 'your'
  // amber = needs our action / still recoverable; rose = problem now.
  const isUrgent = meta.severity === 'urgent'
  const barClass = isUrgent
    ? 'bg-rose-600 text-rose-50'
    : 'bg-amber-500 text-amber-950'
  const btnClass = isUrgent
    ? 'bg-rose-50 text-rose-700 hover:bg-white'
    : 'bg-amber-950 text-amber-100 hover:bg-amber-900'

  function handleClick() {
    startTransition(async () => {
      try {
        await openBillingPortal()
      } catch {
        // openBillingPortal redirects on success; a failure just leaves the
        // banner up. Nothing to surface from a non-interactive banner.
      }
    })
  }

  return (
    <div
      role="alert"
      className={`sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm font-medium ${barClass}`}
    >
      <span>
        Your last payment didn&apos;t go through — update your card to keep {planName} features.
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`rounded-full px-3 py-0.5 text-xs font-semibold disabled:opacity-60 ${btnClass}`}
      >
        {pending ? 'Opening…' : 'Update payment →'}
      </button>
    </div>
  )
}
