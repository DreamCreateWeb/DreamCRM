'use client'

import { IntroShell, TurnOnButton, AskManager } from '@/components/feature-switch/feature-intro'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'

const def = FEATURE_BY_KEY.shop

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-testid={`shop-step-${n}`}>
      <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-700 dark:text-teal-300">
        {n}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-gray-800 dark:text-gray-100">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-300">{children}</div>
      </div>
    </li>
  )
}

export default function ShopIntroCard({
  orgName,
  canManage,
  stripe,
  connectConfigured,
  isDemo,
  productCount,
  shopPath,
}: {
  orgName: string
  canManage: boolean
  /** ready = charges enabled; pending = connected, not finished in Stripe; none = not connected. 'unreadable' = could not be read just now. */
  stripe: 'ready' | 'pending' | 'none' | 'unreadable'
  connectConfigured: boolean
  isDemo: boolean
  /** null = could not be read. */
  productCount: number | null
  shopPath: string | null
}) {
  const canConnect = canManage && !isDemo && connectConfigured
  return (
    <IntroShell eyebrow={`Business · ${orgName}`} title={def.label} lede={def.lede} does={def.does} know={def.know} feature="shop" testId="shop-intro">
      <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Three steps to your first sale</p>
      <ol className="mt-3 space-y-4">
        <Step n={1} title="Connect Stripe">
          {stripe === 'ready' ? (
            <>
              <StatusPill tone="ok" label="Stripe connected" />
              <span>Payouts land in your bank, not ours.</span>
            </>
          ) : stripe === 'unreadable' ? (
            <>
              <StatusPill tone="neutral" label="Couldn’t read Stripe just now" />
              <span>Try again in a moment. Turning on doesn’t change it.</span>
            </>
          ) : stripe === 'pending' ? (
            <>
              <StatusPill tone="warn" label="Finish setup in Stripe" />
              <span>Stripe still needs a detail or two before charges are enabled.</span>
              {canConnect && (
                <ActionButton variant="secondary" size="sm" href="/api/connect/shop/start">
                  Finish Stripe setup
                </ActionButton>
              )}
            </>
          ) : (
            <>
              <StatusPill tone="neutral" label="Stripe not connected" />
              <span>Your own account, your own payouts — a few minutes with Stripe.</span>
              {canConnect && (
                <ActionButton variant="secondary" size="sm" href="/api/connect/shop/start">
                  Connect Stripe
                </ActionButton>
              )}
              {!connectConfigured && <span className="text-xs text-gray-500 dark:text-gray-400">Stripe Connect isn’t configured on this installation.</span>}
            </>
          )}
        </Step>
        <Step n={2} title="Add a product">
          {productCount === null ? (
            <span>Add your first product from the Shop page once it’s on.</span>
          ) : productCount > 0 ? (
            <>
              <StatusPill tone="ok" label={`${productCount} ${productCount === 1 ? 'product' : 'products'} ready`} />
              <span>Already in your catalog.</span>
            </>
          ) : (
            <span>A name, a price and a photo is enough — the Shop page walks you through it once it’s on.</span>
          )}
        </Step>
        <Step n={3} title="Share the link">
          <span>
            Your storefront lives on your website
            {shopPath ? (
              <>
                {' '}at <span className="font-mono-num text-gray-800 dark:text-gray-100">{shopPath}</span>
              </>
            ) : null}{' '}
            — put it in a text, a receipt or your front-desk QR code.
          </span>
        </Step>
      </ol>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">You can turn the Shop on first and finish the steps from the page — nothing is charged until a patient orders.</p>

      {canManage ? <TurnOnButton feature="shop" label={def.label} /> : <AskManager />}
    </IntroShell>
  )
}
