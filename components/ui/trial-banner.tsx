import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'
import { trialDaysLeft, trialHeadline, trialUrgency, type TrialUrgency } from '@/lib/trial'

/**
 * Slim countdown strip for a clinic on its no-card free trial — full access,
 * no card on file, with a CTA to set up billing before it ends. Renders nothing
 * for paid/comped clinics, platform, patients, and partners. Escalates through
 * four tiers as day 7 nears (violet → amber → orange → rose) in both colour AND
 * copy (see `trialUrgency`/`trialHeadline`). The CTA routes a managed
 * (reserved-plan) clinic to the coupon-pre-applied activation flow, and a
 * self-serve clinic to the plan picker.
 *
 * Owner/admin only get the CTA — a non-billing staffer sees the countdown
 * without a dead-end button (they can't set up billing).
 */
const TONE: Record<TrialUrgency, { strip: string; dot: string; btn: string }> = {
  calm: {
    strip: 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200',
    dot: 'bg-violet-500',
    btn: 'bg-violet-500 hover:bg-violet-600',
  },
  soon: {
    strip: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200',
    dot: 'bg-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-600',
  },
  urgent: {
    strip: 'border-orange-500/30 bg-orange-500/12 text-orange-800 dark:text-orange-200',
    dot: 'bg-orange-500',
    btn: 'bg-orange-500 hover:bg-orange-600',
  },
  final: {
    strip: 'border-rose-500/30 bg-rose-500/12 text-rose-800 dark:text-rose-200',
    dot: 'bg-rose-500',
    btn: 'bg-rose-600 hover:bg-rose-700',
  },
}

export default function TrialBanner({ ctx }: { ctx: TenantContext }) {
  if (!ctx.onTrial || ctx.tenantType !== 'clinic') return null

  const days = trialDaysLeft(ctx.trialEndsAt ?? null)
  const urgency = trialUrgency(days)
  const tone = TONE[urgency]
  const canManageBilling = ctx.role === 'owner' || ctx.role === 'admin'
  const href = ctx.hasReservedPlan ? '/billing/activate' : '/settings/billing'
  const ctaLabel = urgency === 'urgent' || urgency === 'final' ? 'Activate now →' : 'Set up billing →'

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-4 py-1.5 text-sm sm:px-6 lg:px-8 ${tone.strip}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <span className="truncate font-medium">
          {trialHeadline(days)} — full access, no card on file.
          {canManageBilling ? ' Set up billing to keep it.' : ''}
        </span>
      </span>
      {canManageBilling && (
        <Link href={href} className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold text-white ${tone.btn}`}>
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
