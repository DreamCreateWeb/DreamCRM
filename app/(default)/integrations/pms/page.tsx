import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getIntegrationsDashboard } from '@/lib/services/pms'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import { PageHeader } from '@/components/ui/page-header'
import { PROVIDER_LABELS, type PmsProviderId } from '@/lib/types/pms'
import { SyncNowButton } from '../sync-controls'
import { PmsConnectedDashboard, ScopeSection } from '../_pms-dashboard'
import { getPmsConnectRequest } from '@/lib/services/pms-connect'
import PmsConnectRequest from './connect-request'

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

  const [dashboard, health, request] = await Promise.all([
    getIntegrationsDashboard(ctx.organizationId),
    getIntegrationsHealth(ctx.organizationId),
    // The clinic's connect request (S4) — the door's own state. Best-effort.
    getPmsConnectRequest(ctx.organizationId).catch(() => null),
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
        title={connected ? `${providerLabel} sync` : 'Your practice software'}
        subtitle="The relationship layer over your practice-management system — synced through its official, sanctioned path, never by writing into your database behind its back."
        actions={connected && canManage ? <SyncNowButton /> : null}
      />

      {connected && dashboard ? (
        <PmsConnectedDashboard dashboard={dashboard} health={health} canManage={canManage} />
      ) : (
        /* Unconnected — THE FRONT DOOR (docs/ACTIVATION.md S4): the intro
           and one form that asks us to connect it, then an honest status
           until the install runs. No key form: the bridge install is a
           short guided session, not a paste box. */
        <section className="space-y-8">
          <PmsConnectRequest
            request={
              request
                ? {
                    vendor: request.vendor,
                    vendorName: request.vendorName,
                    practiceNameInPms: request.practiceNameInPms,
                    contactName: request.contactName,
                    contactEmail: request.contactEmail,
                    contactPhone: request.contactPhone,
                    bestTime: request.bestTime,
                    notes: request.notes,
                    status: request.status,
                    requestedAtIso: request.createdAt.toISOString(),
                  }
                : null
            }
            canManage={canManage && !ctx.isDemo}
            defaultContactName={ctx.userName ?? null}
            defaultContactEmail={ctx.userEmail ?? null}
          />
          <ScopeSection />
        </section>
      )}
    </div>
  )
}
