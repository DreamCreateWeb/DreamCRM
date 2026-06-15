'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { buySocialAddonAction, cancelSocialAddonAction } from '../actions'

/**
 * Settings → Billing "Social connections" card. Shows the clinic's current
 * social-connection entitlement (Google Business is always free + separate, plus
 * N social connections from the plan + optional add-on), and the add-on state:
 *  - Active → "Cancel add-on"
 *  - Available → "Add for $X/mo"
 *  - Basic → "Upgrade to Pro to add social connections" (no add-on on Basic)
 *  - Price env unset → disabled "coming soon"
 *  - Comped/managed (no Stripe sub) → "managed billing — contact us"
 *
 * The buy/cancel actions are self-gated server-side (owner/admin); this is just
 * the surface. DESIGN-SYSTEM v2.
 */
export interface SocialConnectionsCardProps {
  planName: string
  /** Social (non-GBP) connections included now (plan base or +add-on). */
  socialLimit: number
  /** Whether the add-on is currently active. */
  addonActive: boolean
  /** Whether the plan can buy the add-on at all (false on Basic). */
  addonAvailable: boolean
  /** Add-on monthly price in dollars (null when unavailable). */
  addonPriceDollars: number | null
  /** With the add-on, the cap it would raise to (for the "Add for …" copy). */
  addonRaisesTo: number
  /** Whether the Stripe add-on prices are configured (env present). */
  addonConfigured: boolean
  /** True when the clinic has no Stripe subscription (comped/managed). */
  managedBilling: boolean
}

export default function SocialConnectionsCard({
  planName,
  socialLimit,
  addonActive,
  addonAvailable,
  addonPriceDollars,
  addonRaisesTo,
  addonConfigured,
  managedBilling,
}: SocialConnectionsCardProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function buy() {
    setError(null)
    start(async () => {
      const r = await buySocialAddonAction()
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  function cancel() {
    setError(null)
    start(async () => {
      const r = await cancelSocialAddonAction()
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  const totalIncludingGbp = socialLimit + 1

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Social connections</h3>
        {addonActive && <StatusPill tone="ok" label="Add-on active" />}
      </div>

      <div className="v2-card p-5">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Your <strong className="font-medium">{planName}</strong> plan includes{' '}
          <strong className="font-medium">Google Business</strong> plus{' '}
          <strong className="font-medium font-mono-num">{socialLimit}</strong>{' '}
          {socialLimit === 1 ? 'social connection' : 'social connections'}{' '}
          <span className="text-gray-500 dark:text-gray-400">
            ({totalIncludingGbp} total including Google Business)
          </span>
          .
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Google Business is free on every plan and doesn’t count toward your social limit. Social channels
          (Instagram, Facebook, and more) arrive with the social module.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {addonActive ? (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                You have the add-on — {socialLimit} social connections.
              </span>
              <ActionButton variant="danger" size="sm" onClick={cancel} disabled={pending}>
                {pending ? 'Working…' : 'Cancel add-on'}
              </ActionButton>
            </>
          ) : !addonAvailable ? (
            // Basic — no add-on; upgrade to Pro.
            <>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Social connections start on the Pro plan.
              </span>
              <Link
                href="/settings/plans"
                className="inline-flex items-center text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
              >
                Upgrade to Pro →
              </Link>
            </>
          ) : managedBilling ? (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Your plan is on managed billing — contact us to add social connections.
            </span>
          ) : !addonConfigured ? (
            <ActionButton variant="secondary" size="sm" disabled>
              Add-on coming soon
            </ActionButton>
          ) : (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Add more for{' '}
                <strong className="font-medium tabular-nums">${addonPriceDollars}/mo</strong> — raises your limit to{' '}
                <strong className="font-medium font-mono-num">{addonRaisesTo}</strong> social connections.
              </span>
              <ActionButton variant="primary" size="sm" onClick={buy} disabled={pending}>
                {pending ? 'Working…' : `Add for $${addonPriceDollars}/mo`}
              </ActionButton>
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
