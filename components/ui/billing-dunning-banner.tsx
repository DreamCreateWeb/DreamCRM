'use client'

import { useTransition } from 'react'
import { openBillingPortal } from '@/app/(default)/settings/actions'
import { PLANS } from '@/lib/stripe-config'
import { isDunningStatus, subscriptionStatusMeta } from '@/lib/billing-status'
import type { TenantContext } from '@/lib/auth/context'
import { TONE_FILL, TONE_FILL_HOVER } from '@/lib/ui/encodings'

/**
 * Persistent payment-failure (dunning) banner. Renders only for clinic
 * owners/admins whose subscription is in a payment-broken state (past_due /
 * unpaid / incomplete_expired) — those statuses keep full access today with no
 * persistent nudge, so a clinic could silently lapse. Amber for past_due (still
 * recoverable on the same card), rose for the harder-failure states.
 *
 * Mounted in DashboardShell. The
 * activation banner wins if both somehow apply, so we never double-stack.
 */
export default function BillingDunningBanner({ ctx }: { ctx: TenantContext }) {
  const [pending, startTransition] = useTransition()

  // The managed-clinic activation banner takes precedence — don't double-stack.
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
  // Both arms are the registry's solid tone fill, so the two severities read
  // as one control in two tones. The amber arm was white-on-amber-500 at 2.13.
  const btnClass = isUrgent
    ? `${TONE_FILL.urgent} ${TONE_FILL_HOVER.urgent}`
    : `${TONE_FILL.warn} ${TONE_FILL_HOVER.warn}`

  function handleClick() {
    startTransition(async () => {
      // openBillingPortal redirects on success and RETURNS its refusal on
      // failure (DREAMCRM-97). This banner deliberately swallows that refusal:
      // it is a one-line non-interactive strip with nowhere to put a sentence,
      // and the same button with the same message sits on Settings → Billing,
      // which is where the refusal is shown.
      await openBillingPortal()
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
