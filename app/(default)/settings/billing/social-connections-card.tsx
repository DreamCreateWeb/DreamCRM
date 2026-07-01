import Link from 'next/link'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * Settings → Billing "Social connections" card — now a SLIM summary that points
 * to the Integrations app-library, which is the canonical place to buy/cancel the
 * social-connection add-on and manage every channel (the redesign consolidated
 * the add-on management there so a clinic isn't shown two competing widgets).
 * This card just shows the current entitlement + add-on state and links across.
 *
 * The buy/cancel server actions still live in ../actions (kept for any other
 * caller); they're driven from the Integrations surface now.
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
  const totalIncludingGbp = socialLimit + 1

  // A single at-a-glance status chip for the add-on (state only — buying/
  // cancelling now lives on /integrations, so this card never competes with it).
  const addonPill: { tone: 'ok' | 'info' | 'neutral'; label: string } = addonActive
    ? { tone: 'ok', label: 'Add-on active' }
    : !addonAvailable
      ? { tone: 'neutral', label: 'Pro plan required' }
      : managedBilling
        ? { tone: 'info', label: 'Managed billing' }
        : !addonConfigured
          ? { tone: 'neutral', label: 'Coming soon' }
          : { tone: 'info', label: 'Add-on available' }

  // A one-line nudge that matches the clinic's current state.
  let nudge: string
  if (addonActive) {
    nudge = `Your add-on is active — ${socialLimit} social connections.`
  } else if (!addonAvailable) {
    nudge = 'Social connections start on the Pro plan.'
  } else if (managedBilling) {
    nudge = 'Your plan is on managed billing — contact us to add social connections.'
  } else if (!addonConfigured) {
    nudge = 'More social connections are coming soon.'
  } else {
    nudge = `Add more for $${addonPriceDollars}/mo — raises your limit to ${addonRaisesTo}.`
  }

  return (
    <section>
      <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-100">Social connections</h3>

      <div className="v2-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Your <strong className="font-medium">{planName}</strong> plan includes{' '}
            <strong className="font-medium">Google Business</strong> plus{' '}
            <strong className="font-medium font-mono-num tabular-nums">{socialLimit}</strong>{' '}
            {socialLimit === 1 ? 'social connection' : 'social connections'}{' '}
            <span className="text-gray-500 dark:text-gray-400">
              (<span className="font-mono-num tabular-nums">{totalIncludingGbp}</span> total including Google Business)
            </span>
            .
          </p>
          <StatusPill tone={addonPill.tone} label={addonPill.label} />
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{nudge}</p>

        <Link
          href="/integrations"
          className="mt-4 inline-flex items-center text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
        >
          Manage on Integrations →
        </Link>
      </div>
    </section>
  )
}
