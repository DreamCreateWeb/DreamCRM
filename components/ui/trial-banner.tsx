import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'
import { trialDaysLeft, trialHeadline, trialUrgency, type TrialUrgency } from '@/lib/trial'
import { TONE_FILL, TONE_FILL_HOVER } from '@/lib/ui/encodings'

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
/**
 * The CTA is A SOLID TONE FILL WITH A LABEL ON IT, so it carries the
 * `TONE_FILL` registry's answer — fill and ink travelling together — rather
 * than a pair picked here.
 *
 * It used to spell `text-white` over the tone's own 500 step. Measured on the
 * calm tier at `a.rounded-full.px-3.py-0\.5`, 12px: **#ffffff on #8470ff =
 * 3.65:1**, which is the single violation axe carried at BOTH `staff: patients
 * list, brand-new empty clinic` and `staff: add-patient dialog, filled in` (a
 * brand-new clinic is on day 7 of its trial, so calm is the tier that renders
 * there). The two tiers the browser suite never reaches were worse — #ffffff
 * on #fe9a00 = 2.13 and on #ff6900 = 2.89 — and only `final` ever passed, at
 * 4.53 on rose-600. One control, four tiers, three of them failing.
 *
 * The registry's direction — one dark ink for all six tones, starting at
 * `TONE_DOT`'s step and going LIGHTER when the fill cannot carry it — puts the
 * worst of the four at 5.31.
 *
 * `urgent` is the one tier hand-spelled, and the reason is worth keeping: the
 * escalation runs violet → amber → orange → rose and ORANGE IS NOT ONE OF THE
 * SIX v3 TONES, so `TONE_FILL` has no entry to point at. It takes the same
 * recipe at the step the registry's own rule would have chosen — `text-gray-900`
 * on orange-500 (5.31), hover one step lighter on orange-400 (6.45). Whether a
 * four-step escalation should borrow a seventh hue at all is a design decision
 * rather than a contrast one, so it is written down in
 * docs/UI-BEST-VERSION.md instead of being settled here.
 */
const TONE: Record<TrialUrgency, { strip: string; dot: string; btn: string }> = {
  calm: {
    strip: 'border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200',
    dot: 'bg-violet-500',
    btn: `${TONE_FILL.info} ${TONE_FILL_HOVER.info}`,
  },
  soon: {
    strip: 'border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200',
    dot: 'bg-amber-500',
    btn: `${TONE_FILL.warn} ${TONE_FILL_HOVER.warn}`,
  },
  urgent: {
    strip: 'border-orange-500/30 bg-orange-500/12 text-orange-800 dark:text-orange-200',
    dot: 'bg-orange-500',
    btn: 'bg-orange-500 text-gray-900 hover:bg-orange-400',
  },
  final: {
    strip: 'border-rose-500/30 bg-rose-500/12 text-rose-800 dark:text-rose-200',
    dot: 'bg-rose-500',
    btn: `${TONE_FILL.urgent} ${TONE_FILL_HOVER.urgent}`,
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
        <Link href={href} className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold ${tone.btn}`}>
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
