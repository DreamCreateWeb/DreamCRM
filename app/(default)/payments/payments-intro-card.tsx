'use client'

import { IntroShell, TurnOnButton, AskManager } from '@/components/feature-switch/feature-intro'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'

const def = FEATURE_BY_KEY.payments

export default function PaymentsIntroCard({
  orgName,
  canManage,
  stripe,
  connectConfigured,
  isDemo,
}: {
  orgName: string
  canManage: boolean
  /** ready = charges enabled; pending = connected but not finished in Stripe; none = not connected. */
  stripe: 'ready' | 'pending' | 'none'
  /** Stripe Connect is configured on this installation (the connect link works). */
  connectConfigured: boolean
  isDemo: boolean
}) {
  return (
    <IntroShell eyebrow={`Business · ${orgName}`} title={def.label} lede={def.lede} does={def.does} know={def.know} feature="payments" testId="payments-intro">
      <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Set up</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm" data-testid="payments-stripe">
        {stripe === 'ready' ? (
          <>
            <StatusPill tone="ok" label="Stripe connected" />
            <span className="text-gray-700 dark:text-gray-200">Your account can take payments — payouts land in your bank.</span>
          </>
        ) : stripe === 'pending' ? (
          <>
            <StatusPill tone="warn" label="Finish setup in Stripe" />
            <span className="text-gray-700 dark:text-gray-200">Stripe still needs a detail or two before charges are enabled. Open the Payments page after turning on and follow the link there.</span>
          </>
        ) : (
          <>
            <StatusPill tone="neutral" label="Stripe not connected" />
            <span className="text-gray-700 dark:text-gray-200">Connecting takes a few minutes with Stripe — your own account, your own payouts.</span>
            {canManage && !isDemo && connectConfigured && (
              <ActionButton variant="secondary" size="sm" href="/api/connect/shop/start?back=payments">
                Connect Stripe
              </ActionButton>
            )}
            {!connectConfigured && <span className="text-xs text-gray-500 dark:text-gray-400">Stripe Connect isn’t configured on this installation.</span>}
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">You can turn Payments on first and connect Stripe from the page — nothing charges until a patient pays.</p>

      {canManage ? <TurnOnButton feature="payments" label={def.label} /> : <AskManager />}
    </IntroShell>
  )
}
