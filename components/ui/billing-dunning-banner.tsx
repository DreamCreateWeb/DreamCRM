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
  // v2 slim chip-row: amber = needs our action / still recoverable; rose =
  // problem now. A single-line tinted strip, not a full-bleed band.
  const isUrgent = meta.severity === 'urgent'
  const barClass = isUrgent
    ? 'border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-200'
    : 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200'
  const dotClass = isUrgent ? 'bg-rose-500' : 'bg-amber-500'
  const btnClass = isUrgent
    ? 'bg-rose-600 text-white hover:bg-rose-700'
    : 'bg-amber-500 text-white hover:bg-amber-600'

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
      className={`flex items-center justify-between gap-3 border-b px-4 py-1.5 text-sm sm:px-6 lg:px-8 ${barClass}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="truncate font-medium">
          Payment didn&apos;t go through — update your card to keep {planName} features.
        </span>
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold disabled:opacity-60 ${btnClass}`}
      >
        {pending ? 'Opening…' : 'Update payment →'}
      </button>
    </div>
  )
}
