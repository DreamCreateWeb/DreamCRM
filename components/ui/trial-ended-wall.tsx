'use client'

import { useState } from 'react'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { startStripeCheckout } from '@/app/(default)/settings/actions'
import { startActivationCheckout } from '@/app/(default)/billing/activate/actions'

/**
 * The trial-ended LOCK. DashboardShell renders this IN PLACE of the page content
 * for a clinic whose no-card trial expired without a paid subscription — so every
 * route is gated uniformly with no redirect loop, while the sidebar + header (and
 * thus sign-out) stay reachable.
 *
 * It embeds the EXISTING checkout flows directly (no link to another gated page):
 *   - managed clinic (reserved plan) → the coupon-pre-applied activation checkout
 *   - self-serve → the standard plan picker → Stripe Checkout
 * Both are plain form actions that redirect to Stripe (redirect-safe — no
 * try/catch swallowing the navigation). A non-billing staffer sees a "contact
 * your owner" message instead of a dead-end checkout.
 */
export default function TrialEndedWall({
  orgName,
  managed,
  canManageBilling,
}: {
  orgName: string
  managed: boolean
  canManageBilling: boolean
}) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 w-full">
      <div className="mx-auto max-w-lg v2-panel p-6 sm:p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-4">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your free trial has ended</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Set up billing to keep using <strong>{orgName}</strong>. Your website, patients, and everything you’ve set up
          are safe — access returns the moment you subscribe.
        </p>

        {!canManageBilling ? (
          <p className="mt-6 text-sm text-gray-600 dark:text-gray-300 rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-4 py-3">
            Ask your clinic’s owner or an admin to set up billing to restore access.
          </p>
        ) : managed ? (
          <form action={startActivationCheckout} className="mt-6">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Your plan is reserved at the price we agreed — finish setup to activate it.
            </p>
            <button
              type="submit"
              className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
            >
              Set up billing →
            </button>
          </form>
        ) : (
          <div className="mt-6 text-left">
            <div className="flex items-center justify-between bg-[color:var(--color-surface-2)] rounded-lg p-2 mb-3">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 pl-2">Billing</span>
              <div className="flex gap-1">
                {(['monthly', 'annual'] as const).map((iv) => (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setInterval(iv)}
                    aria-pressed={interval === iv}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                      interval === iv
                        ? 'bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800'
                        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {iv === 'monthly' ? 'Monthly' : 'Annual · 2 mo free'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {PLANS.map((p) => {
                const price = interval === 'annual' ? p.annualPrice : p.price
                const suffix = interval === 'annual' ? '/yr' : '/mo'
                return (
                  <form key={p.id} action={startStripeCheckout.bind(null, p.id as PlanId, interval)}>
                    <button
                      type="submit"
                      className="w-full flex items-center justify-between rounded-lg border-2 border-gray-200 dark:border-gray-700/60 hover:border-teal-400 dark:hover:border-teal-500 p-3 transition text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full bg-${p.color}-500`} aria-hidden="true" />
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{p.name}</span>
                      </span>
                      <span className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                        ${price.toLocaleString('en-US')}
                        <span className="text-xs font-normal text-gray-500">{suffix}</span>
                      </span>
                    </button>
                  </form>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
              Have a promo or partner code? Apply it on the checkout page.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
