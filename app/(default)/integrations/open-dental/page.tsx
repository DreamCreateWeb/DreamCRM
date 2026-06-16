import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import { getIntegrationsDashboard, openDentalConfigured } from '@/lib/services/pms'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { BrandLogo } from '@/components/integrations/brand-logos'
import { OPEN_DENTAL_API_FEE_NOTE } from '@/lib/types/pms'
import ConnectPanel from '../connect-panel'
import { SyncNowButton } from '../sync-controls'
import { PmsConnectedDashboard, ScopeSection } from '../_pms-dashboard'

export const metadata = {
  title: 'Open Dental - Integrations - DreamCRM',
  description: 'Connect and manage your Open Dental PMS — two-way sync, write-back, and the full field map.',
}

export const dynamic = 'force-dynamic'

/**
 * Open Dental detail page — the deep PMS management surface, moved off the main
 * /integrations marketplace grid onto its own route (the owner's call). The
 * marketplace card links here: "Manage" (connected) / "Connect" (eligible +
 * unconnected) / handled by the card's "Upgrade to Premium" for below-Premium.
 *
 * Gating: clinic tenant + Premium plan. A below-Premium clinic hitting this URL
 * directly sees a calm upgrade state (no crash); a non-clinic redirects out. The
 * page does the auth/load; the deep dashboard render lives in `_pms-dashboard`.
 */
export default async function OpenDentalDetailPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const pmsEligible = planAllows(ctx.planTier, 'premium')

  const backLink = (
    <Link
      href="/integrations"
      className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      All integrations
    </Link>
  )

  // ── Below Premium → a calm upgrade state, no dashboard, no crash ──────────
  if (!pmsEligible) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
        <div className="mb-4">{backLink}</div>
        <div className="v2-panel p-8 text-center">
          <span className="inline-flex w-16 h-16 rounded-[var(--r-lg)] items-center justify-center bg-[#1B75BC]/10 ring-1 ring-inset ring-[#1B75BC]/25 mb-4">
            <BrandLogo id="open_dental" size={36} />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Open Dental is on Premium</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Two-way PMS sync — patients, appointments, providers, and balances flow both directions through Open
            Dental&apos;s official API, audit-clean. It&apos;s included on the Premium plan.
          </p>
          <div className="mt-5 flex justify-center">
            <ActionButton variant="primary" size="md" href="/settings/plans?upgrade=integrations" breath>
              Upgrade to Premium
            </ActionButton>
          </div>
        </div>
      </div>
    )
  }

  const [dashboard, configured, health] = await Promise.all([
    getIntegrationsDashboard(ctx.organizationId),
    Promise.resolve(openDentalConfigured()),
    getIntegrationsHealth(ctx.organizationId),
  ])

  const connection = dashboard?.connection ?? null
  const connected = connection?.status === 'connected'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <div className="mb-4">{backLink}</div>

      <PageHeader
        eyebrow={`Practice management · ${ctx.organizationName}`}
        title="Open Dental"
        subtitle="The relationship layer over your PMS — synced both directions through the official API, so every change lands in your Open Dental Audit Trail. We never touch your database directly."
        actions={connected ? <SyncNowButton /> : null}
      />

      {connected && dashboard ? (
        <PmsConnectedDashboard dashboard={dashboard} health={health} />
      ) : (
        /* Unconnected (Premium) — the connect form + scope boundary. */
        <section className="space-y-8">
          <ConnectPanel configured={configured} />
          <ScopeSection />
          <p className="text-xs text-gray-500 dark:text-gray-400">{OPEN_DENTAL_API_FEE_NOTE}</p>
        </section>
      )}
    </div>
  )
}
