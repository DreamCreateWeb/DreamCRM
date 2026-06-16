import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'
import { trialDaysLeft, trialDaysLeftLabel } from '@/lib/trial'

/**
 * Slim countdown strip for a clinic on its no-card free trial — full access,
 * no card on file, with a CTA to set up billing before it ends. Renders nothing
 * for paid/comped clinics, platform, patients, and partners. Goes amber in the
 * last two days. The CTA routes a managed (reserved-plan) clinic to the
 * coupon-pre-applied activation flow, and a self-serve clinic to the plan picker.
 *
 * Owner/admin only get the CTA — a non-billing staffer sees the countdown
 * without a dead-end button (they can't set up billing).
 */
export default function TrialBanner({ ctx }: { ctx: TenantContext }) {
  if (!ctx.onTrial || ctx.tenantType !== 'clinic') return null

  const days = trialDaysLeft(ctx.trialEndsAt ?? null)
  const urgent = days != null && days <= 2
  const canManageBilling = ctx.role === 'owner' || ctx.role === 'admin'
  const href = ctx.hasReservedPlan ? '/billing/activate' : '/settings/plans'

  const tone = urgent
    ? 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200'
    : 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200'
  const dot = urgent ? 'bg-amber-500' : 'bg-violet-500'
  const btn = urgent ? 'bg-amber-500 hover:bg-amber-600' : 'bg-violet-500 hover:bg-violet-600'

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-4 py-1.5 text-sm sm:px-6 lg:px-8 ${tone}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="truncate font-medium">
          {trialDaysLeftLabel(days)} — full access, no card on file.
          {canManageBilling ? ' Set up billing to keep it.' : ''}
        </span>
      </span>
      {canManageBilling && (
        <Link href={href} className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold text-white ${btn}`}>
          Set up billing →
        </Link>
      )}
    </div>
  )
}
