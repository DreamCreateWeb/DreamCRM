'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { formatMoney, formatShortDate } from '@/lib/utils'
import {
  cancelSubscriptionAction,
  openBillingPortal,
  reactivateSubscriptionAction,
  startStripeCheckout,
} from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { Toggle } from '@/components/ui/toggle'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { subscriptionStatusMeta } from '@/lib/billing-status'
import { trialDaysLeft, trialUrgency, type TrialUrgency } from '@/lib/trial'

/**
 * One subscription surface — the merge of the old Settings → Plan and
 * Settings → Billing pages, which each showed "you're on the X plan" with no
 * cross-link (the audit's split). Now a single page answers, top to bottom:
 * what you have (+ when it renews) → change it (the plan grid) → past invoices.
 * `/settings/plans` redirects here.
 */

/**
 * Trial-countdown tone → design-system semantic tone. Escalates as the window
 * closes: calm (violet, low pressure) → soon (amber = needs our action) →
 * urgent/final (rose = act now). Mirrors `trialUrgency` in lib/trial.ts so the
 * countdown here and the dashboard banner can't drift.
 */
const TRIAL_TONE: Record<TrialUrgency, 'special' | 'warn' | 'urgent'> = {
  calm: 'special',
  soon: 'warn',
  urgent: 'urgent',
  final: 'urgent',
}

/** Plain-language "N days left" label from the ceil'd days-remaining. */
function trialCountdownLabel(daysLeft: number | null): string {
  if (daysLeft == null) return ''
  if (daysLeft <= 0) return 'Ends today'
  if (daysLeft === 1) return '1 day left'
  return `${daysLeft} days left`
}

interface OrgInvoice {
  id: string
  number: string | null
  amountPaidCents: number
  currency: string
  status: string | null
  createdAt: string
  hostedInvoiceUrl: string | null
}

interface Props {
  planTier: PlanId
  subscriptionStatus: string | null
  /** The current subscription's billing period — anchors the "you're on the X plan" summary. */
  interval: BillingInterval | null
  /** The plan-grid toggle default, read from `?interval=` so a reload keeps the choice. */
  initialInterval: BillingInterval | null
  renewsAt: string | null
  cancelAtPeriodEnd: boolean
  /** Default card on file (brand + last4 + expiry), when one is set. */
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null
  /** True next-charge amount from Stripe's upcoming invoice. */
  nextChargeCents: number | null
  nextChargeCurrency: string | null
  /** A real Stripe subscription exists (not comped/managed-no-sub) → can cancel/resume. */
  hasSubscription: boolean
  /** No-card free trial — full access, no PAID plan yet, so every plan is choosable. */
  onTrial: boolean
  /** The trial's real end instant (ISO) from clinic_profile via the tenant ctx — drives the countdown. */
  trialEndsAt: string | null
  /** When arriving via requirePlan's redirect, the gated module's label. */
  upgradeModuleLabel: string | null
  invoices: OrgInvoice[]
}

export default function SubscriptionPanel({
  planTier,
  subscriptionStatus,
  interval: currentInterval,
  initialInterval,
  renewsAt,
  cancelAtPeriodEnd,
  card,
  nextChargeCents,
  nextChargeCurrency,
  hasSubscription,
  onTrial,
  trialEndsAt,
  upgradeModuleLabel,
  invoices,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const askConfirm = useConfirm()
  // The plan-grid toggle. Seeds from `?interval=` (a reload keeps the choice),
  // then falls back to the current subscription's period, then monthly.
  // Setter is named setIntervalState (not setInterval) to avoid shadowing the
  // global window.setInterval.
  const [interval, setIntervalState] = useState<BillingInterval>(
    initialInterval ?? currentInterval ?? 'monthly',
  )
  const [pending, startTransition] = useTransition()

  // Persist the toggle in the URL so a reload / back-forward keeps the choice
  // (presentation-only — no Stripe call; the checkout still passes `interval`).
  const setBillingInterval = useCallback(
    (next: BillingInterval) => {
      setIntervalState(next)
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      params.set('interval', next)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)
  // Separate channel for the subscription-card actions (cancel / resume) so
  // their result shows next to the card, not down in the plan-grid error slot.
  const [subFeedback, setSubFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const plan = PLANS.find((p) => p.id === planTier)
  const status = subscriptionStatusMeta(subscriptionStatus)
  // A subscription that isn't active/trialing means a switch should go through
  // the portal (fix the card first), not start a fresh checkout.
  const billingBroken = status.severity === 'urgent' || status.severity === 'warn'

  // Trial countdown — sourced from the REAL clinic_profile trial-end via ctx.
  // `trialDaysLeft` is ceil + never-negative; `trialUrgency` escalates the tone
  // as the window shrinks (calm → soon → urgent/final) so it reads warmer early
  // and more insistent near the wall. Compute once on the client after mount so
  // "days left" reflects the viewer's clock (a server-rendered day can be stale).
  const trialEnd = onTrial && trialEndsAt ? new Date(trialEndsAt) : null
  const [trialDays, setTrialDays] = useState<number | null>(() =>
    trialEnd ? trialDaysLeft(trialEnd) : null,
  )
  useEffect(() => {
    setTrialDays(trialEnd ? trialDaysLeft(trialEnd) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialEndsAt, onTrial])
  const trialTone = TRIAL_TONE[trialUrgency(trialDays)]
  const summaryPrice = plan ? (currentInterval === 'annual' ? plan.annualPrice : plan.price) : null
  const priceLabel = summaryPrice != null ? `$${summaryPrice}/${currentInterval === 'annual' ? 'yr' : 'mo'}` : null

  function handleSelect(planId: PlanId) {
    if ((!onTrial && planId === planTier) || pending) return
    setPendingPlan(planId)
    setFeedback(null)
    startTransition(async () => {
      try {
        await startStripeCheckout(planId, interval)
      } catch (err) {
        setFeedback({ error: (err as Error).message })
        setPendingPlan(null)
      }
    })
  }

  function handlePortal() {
    setFeedback(null)
    startTransition(async () => {
      try {
        await openBillingPortal()
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function handleCancel() {
    setSubFeedback(null)
    void (async () => {
      const ok = await askConfirm({
        title: 'Cancel your subscription?',
        message:
          "You'll keep full access until the end of your current billing period, then your plan ends. You can resume anytime before then.",
        confirmLabel: 'Cancel subscription',
        danger: true,
      })
      if (!ok) return
      startTransition(async () => {
        const r = await cancelSubscriptionAction()
        if (r.ok) {
          setSubFeedback({ ok: 'Your plan will end at the end of this billing period. You can resume anytime before then.' })
          router.refresh()
        } else {
          setSubFeedback({ error: r.error })
        }
      })
    })()
  }

  function handleResume() {
    setSubFeedback(null)
    startTransition(async () => {
      const r = await reactivateSubscriptionAction()
      if (r.ok) {
        setSubFeedback({ ok: 'Your subscription will continue — no break in access.' })
        router.refresh()
      } else {
        setSubFeedback({ error: r.error })
      }
    })
  }

  function priceFor(p: (typeof PLANS)[number]) {
    return interval === 'annual' ? p.annualPrice : p.price
  }

  const cardLabel = card
    ? `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} •••• ${card.last4}`
    : null
  const nextChargeLabel =
    nextChargeCents != null
      ? formatMoney(nextChargeCents, (nextChargeCurrency ?? 'usd').toUpperCase())
      : null

  return (
    <div className="grow space-y-7 p-6">
      {upgradeModuleLabel && (
        <div className="rounded-[var(--r-sm)] bg-indigo-500/10 px-4 py-3 text-sm text-indigo-900 ring-1 ring-inset ring-indigo-500/30 dark:text-indigo-200">
          <span className="font-semibold">{upgradeModuleLabel} is on a higher plan.</span>{' '}
          Pick a plan below to turn it on — your current data stays exactly as it is.
        </div>
      )}

      {/* ── Your subscription ───────────────────────────────────────── */}
      <section className="v2-card p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Your subscription
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              {onTrial ? (
                <span>
                  You&apos;re on a <strong className="font-medium text-gray-800 dark:text-gray-100">free trial</strong>{' '}
                  with full access — choose a plan below to keep going. No card on file yet.
                </span>
              ) : (
                <span>
                  You&apos;re on the{' '}
                  <strong className="font-medium text-gray-800 dark:text-gray-100">{plan?.name ?? planTier}</strong> plan
                  {priceLabel && <span className="tabular-nums"> · {priceLabel}</span>}.
                </span>
              )}
              {onTrial && trialDays != null ? (
                <StatusPill
                  tone={trialTone}
                  title="Your free trial — choose a plan below before it ends to keep full access."
                >
                  <span className="font-mono-num tabular-nums">{trialCountdownLabel(trialDays)}</span>
                  <span className="ml-1">in your trial</span>
                </StatusPill>
              ) : (
                status.label && <StatusPill tone={status.tone} label={status.label} title={status.description} />
              )}
            </div>
            {onTrial && trialEnd && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Your trial ends on{' '}
                <strong className="font-medium text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">
                  {formatShortDate(trialEnd)}
                </strong>
                .
              </div>
            )}
            {!onTrial && renewsAt && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                <strong className="font-medium text-gray-700 dark:text-gray-200">{formatShortDate(renewsAt)}</strong>.
              </div>
            )}
            {!onTrial && (cardLabel || nextChargeLabel) && (
              <div className="mt-1 space-y-0.5 text-sm text-gray-500 dark:text-gray-400">
                {cardLabel && (
                  <div>
                    Card on file:{' '}
                    <strong className="font-medium text-gray-700 dark:text-gray-200 tabular-nums">{cardLabel}</strong>
                    {card && card.expMonth > 0 && (
                      <span className="tabular-nums">
                        {' '}· exp {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                      </span>
                    )}
                  </div>
                )}
                {!cancelAtPeriodEnd && nextChargeLabel && renewsAt && (
                  <div>
                    Next charge:{' '}
                    <strong className="font-medium text-gray-700 dark:text-gray-200 tabular-nums">{nextChargeLabel}</strong>{' '}
                    on <strong className="font-medium text-gray-700 dark:text-gray-200">{formatShortDate(renewsAt)}</strong>.
                  </div>
                )}
              </div>
            )}
            {billingBroken && (
              <div className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                {status.description} Update your card to keep your features.
              </div>
            )}
          </div>
          <ActionButton variant="secondary" size="sm" onClick={handlePortal} disabled={pending}>
            {pending ? 'Opening…' : 'Manage billing in Stripe →'}
          </ActionButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Update your card, download receipts, or manage everything in the secure Stripe billing portal.
          </p>
          {hasSubscription &&
            !onTrial &&
            (cancelAtPeriodEnd ? (
              <ActionButton variant="primary" size="sm" onClick={handleResume} disabled={pending}>
                Resume subscription
              </ActionButton>
            ) : !billingBroken ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="shrink-0 text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 disabled:opacity-50"
              >
                Cancel subscription
              </button>
            ) : null)}
        </div>
        {subFeedback?.ok && (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{subFeedback.ok}</p>
        )}
        {subFeedback?.error && (
          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{subFeedback.error}</p>
        )}
      </section>

      {/* ── Choose / change your plan ──────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {onTrial ? 'Choose your plan' : 'Change your plan'}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly</span>
            <Toggle
              checked={interval === 'annual'}
              onChange={(v) => setBillingInterval(v ? 'annual' : 'monthly')}
              srLabel="Pay annually"
            />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Annually <span className="text-emerald-600 dark:text-emerald-400">(2 months free)</span>
            </span>
          </div>
        </div>

        {feedback?.error && (
          <div className="mb-4 rounded-[var(--r-sm)] bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {feedback.error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {PLANS.map((p) => {
            const isCurrent = !onTrial && p.id === planTier
            const isPending = pendingPlan === p.id
            const displayed = priceFor(p)
            const monthlyEquivalent = interval === 'annual' ? Math.round(p.annualPrice / 12) : p.price
            return (
              <div
                key={p.id}
                className={`relative col-span-full v2-card rounded-[var(--r-md)] sm:col-span-6 xl:col-span-4 ${
                  isCurrent
                    ? 'shadow-[inset_0_0_0_2px_var(--color-teal-500)] dark:shadow-[inset_0_0_0_2px_var(--color-teal-400)]'
                    : ''
                }`}
              >
                <div className={`absolute left-0 right-0 top-0 h-0.5 rounded-t-[var(--r-md)] bg-${p.color}-500`} aria-hidden="true" />
                <div className="border-b border-gray-200 px-5 pb-6 pt-5 dark:border-gray-700/60">
                  <header className="mb-2 flex items-center gap-3">
                    <div className={`h-6 w-6 shrink-0 rounded-full bg-${p.color}-500`} aria-hidden="true" />
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{p.name}</h4>
                    {isCurrent && (
                      <span
                        className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-[color:var(--color-hairline-strong)] dark:text-teal-300"
                        title="The plan your subscription is on right now"
                      >
                        Current plan
                      </span>
                    )}
                  </header>
                  <div className="mb-1 font-mono-num font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    <span className="text-2xl">$</span>
                    <span className="text-3xl">{displayed}</span>
                    <span className="font-sans text-sm font-medium text-gray-500 dark:text-gray-400">
                      /{interval === 'annual' ? 'yr' : 'mo'}
                    </span>
                  </div>
                  {interval === 'annual' && (
                    <div className="mb-3 font-mono-num text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      ${monthlyEquivalent}/mo billed annually
                    </div>
                  )}
                  {isCurrent ? (
                    <div className="btn mt-3 w-full cursor-default bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      Current plan
                    </div>
                  ) : billingBroken ? (
                    <ActionButton variant="primary" onClick={handlePortal} disabled={pending} className="mt-3 w-full justify-center">
                      Fix billing to switch
                    </ActionButton>
                  ) : (
                    <ActionButton
                      variant="primary"
                      onClick={() => handleSelect(p.id)}
                      disabled={pending}
                      className="mt-3 w-full justify-center"
                    >
                      {isPending ? 'Redirecting…' : onTrial ? `Choose ${p.name}` : `Switch to ${p.name}`}
                    </ActionButton>
                  )}
                </div>
                <div className="px-5 pb-5 pt-4">
                  <div className="mb-4 text-xs font-semibold uppercase text-gray-800 dark:text-gray-100">What&apos;s included</div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center py-1">
                        <svg className="mr-2 h-3 w-3 shrink-0 fill-current text-emerald-500" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-200">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Invoices ───────────────────────────────────────────────── */}
      <section className="v2-card p-5">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-100">Recent invoices</h3>
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            body="Once your first payment clears, your receipts appear here. Your full history always lives in the Stripe portal."
            action={
              <ActionButton variant="secondary" size="sm" onClick={handlePortal} disabled={pending}>
                Open billing portal →
              </ActionButton>
            }
          />
        ) : (
          <table className="w-full table-auto dark:text-gray-400">
            <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Invoice</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Amount</th>
                <th className="py-2 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {invoices.map((inv) => {
                const paid = inv.status === 'paid'
                return (
                  <tr key={inv.id} className="border-b border-gray-200 dark:border-gray-700/60">
                    <td className="whitespace-nowrap py-2 font-medium tabular-nums text-gray-800 dark:text-gray-100">
                      {formatShortDate(inv.createdAt)}
                    </td>
                    <td className="py-2">{inv.number ?? '—'}</td>
                    <td className="py-2">
                      <StatusPill
                        tone={paid ? 'ok' : inv.status === 'open' ? 'warn' : 'neutral'}
                        label={inv.status ? inv.status.replace(/_/g, ' ') : 'unknown'}
                      />
                    </td>
                    <td className="py-2 font-medium tabular-nums">{formatMoney(inv.amountPaidCents, inv.currency)}</td>
                    <td className="py-2 text-right">
                      {inv.hostedInvoiceUrl ? (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-600 hover:underline dark:text-teal-400"
                        >
                          View →
                        </a>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
