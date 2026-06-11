import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getActivationDetails } from '@/lib/services/clinic-provisioning'
import { ActionButton } from '@/components/ui/action-button'
import { PageHeader } from '@/components/ui/page-header'
import { startActivationCheckout } from './actions'

export const metadata = {
  title: 'Finish billing setup — DreamCRM',
}

export const dynamic = 'force-dynamic'

/**
 * Managed-clinic billing activation: the platform reserved a plan (often at
 * a negotiated price); the owner reviews it here and pays via Stripe
 * Checkout with the discount already applied.
 */
export default async function BillingActivatePage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const canActivate = ctx.role === 'owner' || ctx.role === 'admin'

  const details = await getActivationDetails(ctx.organizationId)
  if (!details) redirect('/')

  const per = details.interval === 'annual' ? '/yr' : '/mo'
  const fmt = (n: number) =>
    n % 1 === 0 ? `$${n.toLocaleString('en-US')}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
      <PageHeader
        eyebrow={`Billing · ${ctx.organizationName}`}
        title="Finish setting up your plan"
        subtitle="We reserved your plan when your account was set up — review it and add billing to unlock everything."
      />

      <div className="v2-card p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              {details.planName} plan
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Billed {details.interval === 'annual' ? 'annually' : 'monthly'} · cancel anytime
            </div>
          </div>
          <div className="text-right">
            {details.discountedPrice != null ? (
              <>
                <div className="text-sm text-gray-500 dark:text-gray-400 line-through font-mono-num tabular-nums">
                  {fmt(details.basePrice)}
                  {per}
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono-num tabular-nums">
                  {fmt(details.discountedPrice)}
                  <span className="text-sm font-normal text-gray-500 font-sans">{per}</span>
                </div>
              </>
            ) : (
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono-num tabular-nums">
                {fmt(details.basePrice)}
                <span className="text-sm font-normal text-gray-500 font-sans">{per}</span>
              </div>
            )}
          </div>
        </div>

        {details.discountLabel && (
          <div className="mt-4 rounded-[var(--r-sm)] bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Your pricing: {details.discountLabel} — already applied, no code needed.
          </div>
        )}

        <div className="mt-6">
          {canActivate ? (
            <form action={startActivationCheckout}>
              <ActionButton type="submit" variant="primary" breath className="w-full justify-center">
                Add billing &amp; activate →
              </ActionButton>
            </form>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ask the clinic owner to finish this step — only owners and admins can add billing.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
            Secure checkout by Stripe. Your card is charged when you confirm on the next screen.
          </p>
        </div>
      </div>
    </div>
  )
}
