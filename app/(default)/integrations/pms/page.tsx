import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getIntegrationsDashboard } from '@/lib/services/pms'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import { PageHeader } from '@/components/ui/page-header'
import { PROVIDER_LABELS, type PmsProviderId } from '@/lib/types/pms'
import { SyncNowButton } from '../sync-controls'
import { PmsConnectedDashboard, ScopeSection } from '../_pms-dashboard'

export const metadata = {
  title: 'PMS sync - Integrations - DreamCRM',
  description: 'Manage your practice-management-system sync — two-way sync, write-back, and the full field map.',
}

export const dynamic = 'force-dynamic'

/**
 * The PMS sync detail page — ONE deep management surface for whichever
 * practice-management system a clinic runs (owner ruling 2026-08-19: one
 * connector path, not two). Open Dental practices ride the same NexHealth
 * Synchronizer bridge as Dentrix/Eaglesoft/everyone else, so the old
 * self-serve Open Dental Customer-Key page is gone; /integrations/open-dental
 * 308s here. Connecting is a we-do-it-with-you install (the marketplace card
 * says so), so the unconnected state explains rather than offers a key form.
 */
export default async function PmsDetailPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  // Members can VIEW the sync dashboard (the marketplace card links them
  // here) but every mutating control — sync now, direction, disconnect —
  // is owner/admin, mirroring the marketplace's canManage gate.
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

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

  const [dashboard, health] = await Promise.all([
    getIntegrationsDashboard(ctx.organizationId),
    getIntegrationsHealth(ctx.organizationId),
  ])

  const connection = dashboard?.connection ?? null
  const connected = connection?.status === 'connected'
  const providerLabel = connection?.provider
    ? (PROVIDER_LABELS[connection.provider as PmsProviderId] ?? 'Your PMS')
    : 'Your PMS'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      <div className="mb-4">{backLink}</div>

      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title={connected ? `${providerLabel} sync` : 'PMS sync'}
        subtitle="The relationship layer over your practice-management system — synced through its official, sanctioned path, never by writing into your database behind its back."
        actions={connected && canManage ? <SyncNowButton /> : null}
      />

      {connected && dashboard ? (
        <PmsConnectedDashboard dashboard={dashboard} health={health} canManage={canManage} />
      ) : (
        /* Unconnected — the honest we-set-it-up-with-you story (no key form:
           the bridge install is a short guided session, not a paste box). */
        <section className="space-y-8">
          <div className="v2-panel p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              One bridge reaches nearly every PMS
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Open Dental, Dentrix, Eaglesoft, and most other practice-management systems connect
              through one short server install — we handle it with you (your machine, your IT&apos;s,
              or a remote session), at no cost to your practice. Once connected, your patients and
              appointments sync in automatically and online booking offers your real open times.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {canManage
                ? 'Ready when you are — reach Support from Settings → Feedback and we’ll schedule it.'
                : 'Connecting needs an owner or admin — ask them to schedule the short install with Support.'}
            </p>
          </div>
          <ScopeSection />
        </section>
      )}
    </div>
  )
}
