import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import { db, schema } from '@/lib/db'
import { getIntegrationsDashboard, openDentalConfigured } from '@/lib/services/pms'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import { getZernioConnection } from '@/lib/services/zernio'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import { zernioConfigured } from '@/lib/zernio'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import {
  socialAddonAvailable,
  socialAddonPriceCents,
  socialConnectionLimit,
} from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'
import {
  NEVER_TOUCHED,
  OPEN_DENTAL_FIELD_MAP,
  PROVIDER_LABELS,
  SYNCED_ENTITIES,
  SYNC_STATUS_LABELS,
  WRITE_OP_ENTITY_LABELS,
  WRITE_OP_STATUS_LABELS,
  type SyncedEntity,
  type SyncRunStatus,
  type WriteOpStatus,
} from '@/lib/types/pms'
import type { PmsSyncRun } from '@/lib/db/schema/clinic'
import {
  SOCIAL_CHANNEL_SHORTLIST,
  ZERNIO_PLATFORM_LABELS,
  ZERNIO_PLATFORM_ICONS,
  isConnectablePlatform,
  type SocialChannelView,
  type ZernioPlatform,
} from '@/lib/types/zernio'
import ConnectPanel from './connect-panel'
import SyncControls, { SyncNowButton } from './sync-controls'
import IntegrationsLibrary from './integrations-library'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import type { PillLegendRow, Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Integrations - DreamCRM',
  description:
    'Connect the tools that power your practice — your PMS (Open Dental), Google Business, and your social channels.',
}

export const dynamic = 'force-dynamic'

/**
 * Integrations — an app-library / integrations-directory. A calm grid of
 * integration cards grouped into sections (Practice management · Google ·
 * Social), like an app marketplace, NOT a dense single-connector dashboard.
 * The former /channels surface (social + GBP connect) folds in here so this is
 * the single place a clinic plugs things in.
 *
 * The grid is the new FRAME (IntegrationsLibrary); the rich Open Dental PMS
 * management (status hero, KPIs, scope, field map, sync/write-back logs, trust
 * banner) lives BELOW the grid, server-rendered, when Open Dental is connected
 * — the Open Dental card's "Manage" anchors to it. When unconnected (Premium),
 * the card's "Connect" anchors to the connect form below. PMS is Premium-gated;
 * GBP + social are free/cap-bounded on every tier (owner/admin required).
 */

// Sync-run state → tone. running is in flight (info); success done-good (ok);
// partial needs a look (warn); error is a problem now (urgent).
const RUN_TONE: Record<SyncRunStatus, Tone> = {
  running: 'info',
  success: 'ok',
  partial: 'warn',
  error: 'urgent',
}
// Write-op state → tone. pending is queued, ball in the next-sync's court (info);
// success done (ok); error will retry (urgent); skipped is a no-op (neutral).
const WRITE_TONE: Record<WriteOpStatus, Tone> = {
  pending: 'info',
  success: 'ok',
  error: 'urgent',
  skipped: 'neutral',
}

// One legend covers both pill families + the health-banner severities (they all
// share the tone vocabulary), so a clinic can decode the PMS detail at a glance.
const PILL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Synced', meaning: 'A sync run finished cleanly — everything came across' },
  { tone: 'info', label: 'Syncing', meaning: 'A run is in progress' },
  { tone: 'warn', label: 'Partial', meaning: 'Synced, but some records were skipped — worth a look' },
  { tone: 'urgent', label: 'Failed', meaning: 'A run errored, or a sync-health alert needs attention now' },
  { tone: 'info', label: 'Queued', meaning: 'A write-back is waiting — it flushes on the next sync' },
  { tone: 'ok', label: 'Written to PMS', meaning: 'We created the record in your PMS via the API' },
  { tone: 'urgent', label: 'Failed write', meaning: "A write-back didn't land — it will retry" },
  { tone: 'neutral', label: 'Skipped', meaning: 'A write-back was a no-op (e.g. already superseded)' },
]

function fmtRelative(d: Date | null): string {
  if (!d) return 'never'
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function summarizeRun(counts: PmsSyncRun['counts']): string {
  let created = 0
  let updated = 0
  let skipped = 0
  let contactsPreserved = 0
  for (const t of Object.values(counts ?? {})) {
    created += t?.created ?? 0
    updated += t?.updated ?? 0
    skipped += t?.skipped ?? 0
    // patient-only: rows where we kept our contact info over the PMS's because
    // the patient has a portal login (overwriting would break sign-in).
    contactsPreserved += (t as { skippedContactOverwrites?: number } | undefined)?.skippedContactOverwrites ?? 0
  }
  const parts: string[] = []
  if (created) parts.push(`${created} new`)
  if (updated) parts.push(`${updated} updated`)
  if (skipped) parts.push(`${skipped} unchanged`)
  if (contactsPreserved) parts.push(`${contactsPreserved} contact${contactsPreserved === 1 ? '' : 's'} preserved`)
  return parts.length ? parts.join(' · ') : 'no changes'
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  // The PMS integration (Open Dental) is Premium-tier. Google Business + the
  // social shortlist, however, are usable on every plan (Basic included; social
  // bounded by the per-plan cap) — so we never redirect below-Premium clinics
  // away; we render the GBP + social cards for them and gate ONLY the PMS detail
  // behind the Premium plan.
  const pmsEligible = planAllows(ctx.planTier, 'premium')

  const sp = await searchParams
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null

  // GBP + social load for everyone; the PMS dashboard + health only for Premium.
  const [dashboard, configured, health, zernio, cap, profileRow] = await Promise.all([
    pmsEligible ? getIntegrationsDashboard(ctx.organizationId) : Promise.resolve(null),
    Promise.resolve(openDentalConfigured()),
    pmsEligible ? getIntegrationsHealth(ctx.organizationId) : Promise.resolve(null),
    getZernioConnection(ctx.organizationId),
    canConnectSocialPlatform(ctx.organizationId),
    db
      .select({
        socialAddon: schema.clinicProfile.socialAddon,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  const { connection, counts, totals, pendingWrites, recentRuns, recentWrites } = dashboard ?? {
    connection: null,
    counts: { patients: 0, appointments: 0, providers: 0 },
    totals: { patients: 0, appointments: 0 },
    pendingWrites: 0,
    recentRuns: [],
    recentWrites: [],
  }
  const connected = connection?.status === 'connected'
  const isDemo = connection?.provider === 'demo'
  const meta = (connection?.meta as Record<string, unknown> | undefined) ?? {}
  const practiceTitle = meta.practiceTitle as string | undefined
  // A parked patient-import cursor means a big first import is still catching up.
  const importCursor = typeof meta.patientImportCursor === 'number' ? meta.patientImportCursor : 0
  const importInProgress = connected && importCursor > 0

  // ── Social entitlement props ──────────────────────────────────────────────
  const planTier = ctx.planTier as PlanTier
  const addonActive = profileRow?.socialAddon === 1
  const addonCents = socialAddonPriceCents(planTier)
  const socialChannels: SocialChannelView[] = SOCIAL_CHANNEL_SHORTLIST.map((platform) => ({
    platform,
    label: ZERNIO_PLATFORM_LABELS[platform],
    icon: ZERNIO_PLATFORM_ICONS[platform],
    account: zernio.accounts.find((a) => a.platform === platform) ?? null,
  }))
  const gbpAccount = zernio.googleBusinessAccounts[0] ?? null

  // Success / at-limit / error params (validated against the shortlist).
  const connectedParam = one(sp.connected)
  const atLimitParam = one(sp.atLimit)
  const justConnected: ZernioPlatform | null =
    connectedParam && isConnectablePlatform(connectedParam) ? connectedParam : null
  const atLimit: ZernioPlatform | null =
    atLimitParam && isConnectablePlatform(atLimitParam) ? atLimitParam : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="integrations" />

      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Integrations"
        subtitle="Connect the tools that power your practice — your practice-management system, Google Business, and the social channels you post to. DreamCRM wraps what you already run; it doesn't replace it."
        actions={pmsEligible && connected ? <SyncNowButton /> : null}
      />

      {/* ── The app-library grid (the new frame) ────────────────────────── */}
      <IntegrationsLibrary
        zernioConfigured={zernioConfigured()}
        pmsEligible={pmsEligible}
        pms={{
          connected,
          errored: connection?.lastSyncStatus === 'error',
          providerLabel: connection
            ? PROVIDER_LABELS[connection.provider as keyof typeof PROVIDER_LABELS] ?? connection.provider
            : 'Open Dental',
          isDemo: !!isDemo,
        }}
        gbp={{
          connected: zernio.status === 'connected' && zernio.googleBusinessAccounts.length > 0,
          error: zernio.status === 'error',
          account: gbpAccount,
        }}
        socialChannels={socialChannels}
        cap={{ allowed: cap.allowed, limit: cap.limit, current: cap.current, reason: cap.reason }}
        entitlement={{
          planName: getPlanById(planTier)?.name ?? planTier,
          addonAvailable: socialAddonAvailable(planTier),
          addonActive,
          addonRaisesTo: socialConnectionLimit(planTier, true),
          addonPriceDollars: addonCents != null ? Math.round(addonCents / 100) : null,
          addonConfigured: socialAddonConfigured(),
          managedBilling: !profileRow?.stripeSubscriptionId,
        }}
        justConnected={justConnected}
        atLimit={atLimit}
        routeError={one(sp.zernioError)}
      />

      {/* ── Open Dental deep management — the "Manage" detail, server-rendered.
          PMS is Premium; below-Premium clinics see only the grid card + its
          upgrade affordance (handled inside IntegrationsLibrary). ─────────── */}
      {pmsEligible && (
        <div className="mt-12 pt-8 border-t border-[color:var(--color-hairline)]">
          {connected ? (
            <section id="open-dental-detail" className="scroll-mt-20">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                  {PROVIDER_LABELS[connection!.provider as keyof typeof PROVIDER_LABELS] ?? connection!.provider} · Connection details
                </h2>
                <EncodingLegend pills={PILL_LEGEND} />
              </div>

              {/* ── Trust banner ──────────────────────────────────────────── */}
              <div className="mb-6 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30 rounded-[var(--r-lg)] p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <ShieldIcon />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Sanctioned &amp; audit-clean</p>
                  <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
                    Every read and write goes through Open Dental&apos;s official API, so each change is recorded in your
                    Open Dental Audit Trail. We never write directly to your database — the practice Open Dental itself
                    warns against. You can see every record we created in your PMS in the write-back log below.
                  </p>
                </div>
              </div>

              {/* ── First-import progress (renders only mid-import) ────── */}
              {importInProgress && (
                <div className="mb-6 rounded-[var(--r-lg)] ring-1 ring-inset ring-indigo-500/30 bg-indigo-500/10 p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                    <RefreshIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Importing your patients…</p>
                    <p className="text-sm mt-0.5 text-indigo-800/80 dark:text-indigo-300/80">
                      Imported <span className="font-mono-num">{importCursor.toLocaleString()}</span> so far — large
                      practices import in batches, and this continues automatically every hour. You can keep working; hit
                      “Sync now” any time to push it along.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Sync-health alert (renders only when unhealthy) ───── */}
              {health && health.severity !== 'info' && (
                <div
                  className={[
                    'mb-6 rounded-[var(--r-lg)] ring-1 ring-inset p-4 flex items-start gap-3',
                    health.severity === 'error'
                      ? 'bg-rose-500/10 ring-rose-500/30'
                      : 'bg-amber-500/10 ring-amber-500/30',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'w-8 h-8 rounded-[var(--r-md)] shrink-0 flex items-center justify-center text-base font-semibold',
                      health.severity === 'error'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    !
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm font-semibold',
                        health.severity === 'error' ? 'text-rose-800 dark:text-rose-200' : 'text-amber-800 dark:text-amber-200',
                      ].join(' ')}
                    >
                      Sync needs attention
                    </p>
                    <p
                      className={[
                        'text-sm mt-0.5',
                        health.severity === 'error'
                          ? 'text-rose-800/80 dark:text-rose-300/80'
                          : 'text-amber-800/80 dark:text-amber-300/80',
                      ].join(' ')}
                    >
                      {health.message}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Status card (etched panel — status hero) ──────────── */}
              <section className="v2-panel mb-6 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <PlugIcon />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                          {PROVIDER_LABELS[connection!.provider as keyof typeof PROVIDER_LABELS] ?? connection!.provider}
                        </h3>
                        <StatusPill
                          tone={connection!.lastSyncStatus === 'error' ? 'urgent' : 'ok'}
                          label={connection!.lastSyncStatus === 'error' ? 'Last run failed' : 'Connected'}
                        />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {practiceTitle ? `${practiceTitle} · ` : ''}Last synced {fmtRelative(connection!.lastSyncAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <SyncControls
                  syncDirection={connection!.syncDirection as 'import' | 'two_way'}
                  autoSyncEnabled={connection!.autoSyncEnabled === 1}
                  isDemo={!!isDemo}
                />
                {connection!.lastError && (
                  <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
                    Last sync error: {connection!.lastError}
                  </p>
                )}
              </section>

              {/* ── KPIs ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <KpiStat label="Patients synced" value={counts.patients} sub={`${totals.patients} total in DreamCRM`} />
                <KpiStat label="Appointments synced" value={counts.appointments} sub={`${totals.appointments} total`} />
                <KpiStat label="Providers" value={counts.providers} sub="Linked to your agenda" />
                <KpiStat
                  label="Awaiting write-back"
                  value={pendingWrites}
                  sub={pendingWrites > 0 ? 'Will push on next sync' : 'All bookings pushed'}
                  tone={pendingWrites > 0 ? 'warn' : 'ok'}
                />
              </div>

              <ScopeSection />
              <FieldMapSection />

              {/* ── Inbound sync log ──────────────────────────────────── */}
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Sync history (PMS → DreamCRM)</h2>
                {recentRuns.length === 0 ? (
                  <EmptyState
                    icon="🔄"
                    title="No syncs yet"
                    body="Hit “Sync now” to pull your patients and schedule into DreamCRM."
                  />
                ) : (
                  <div className="v2-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
                        <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                          <th className="px-3 py-2">When</th>
                          <th className="px-3 py-2">Trigger</th>
                          <th className="px-3 py-2">Result</th>
                          <th className="px-3 py-2">Changes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentRuns.map((r) => (
                          <tr key={r.id} className="border-b border-[color:var(--color-hairline)] last:border-b-0">
                            <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 tabular-nums font-mono-num">
                              {fmtRelative(r.startedAt)}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 capitalize">{r.trigger}</td>
                            <td className="px-3 py-2.5">
                              <StatusPill tone={RUN_TONE[r.status as SyncRunStatus]} label={SYNC_STATUS_LABELS[r.status as SyncRunStatus]} />
                            </td>
                            <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">{summarizeRun(r.counts)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── Outbound write-back log ───────────────────────────── */}
              <section className="mb-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Write-back log (DreamCRM → PMS)</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Every record we created in your PMS, via the API</p>
                </div>
                {recentWrites.length === 0 ? (
                  <EmptyState
                    icon="📤"
                    title="No write-backs yet"
                    body="New bookings from your website, portal, or front desk will appear here once they’re pushed to the PMS."
                  />
                ) : (
                  <div className="v2-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
                        <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                          <th className="px-3 py-2">Record</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">PMS id</th>
                          <th className="px-3 py-2">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentWrites.map((w) => (
                          <tr key={w.id} className="border-b border-[color:var(--color-hairline)] last:border-b-0">
                            <td className="px-3 py-2.5">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{w.label}</p>
                              {w.error && <p className="text-xs text-rose-600 dark:text-rose-400">{w.error}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                              {WRITE_OP_ENTITY_LABELS[w.entityType as keyof typeof WRITE_OP_ENTITY_LABELS] ?? w.entityType}
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusPill tone={WRITE_TONE[w.status]} label={WRITE_OP_STATUS_LABELS[w.status]} />
                            </td>
                            <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 font-mono-num">{w.externalId ?? '—'}</td>
                            <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">{fmtRelative(w.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── Coming next (PMS roadmap) ─────────────────────────── */}
              <section className="mt-8">
                <div className="v2-well p-5">
                  <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">Coming next</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <li>· Near-real-time sync via Open Dental webhook subscriptions (today auto-sync runs on a schedule + you can “Sync now” any time)</li>
                    <li>· Configurable field mapping (today the Open Dental mapping is fixed + shown in full above)</li>
                  </ul>
                </div>
              </section>
            </section>
          ) : (
            /* Unconnected (Premium) — the connect form + scope, anchored from
               the Open Dental card's "Connect" button. */
            <section id="connect-open-dental" className="scroll-mt-20 space-y-8">
              <ConnectPanel configured={configured} />
              <ScopeSection />
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function ScopeSection() {
  return (
    <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="v2-card p-5">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">What we sync</h2>
        <ul className="space-y-2.5">
          {SYNCED_ENTITIES.map((e) => (
            <li key={e.label} className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <ScopeIcon icon={e.icon} />
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{e.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 pt-3 border-t border-[color:var(--color-hairline)] text-xs text-gray-500 dark:text-gray-400">
          Records deleted in Open Dental are kept here — we never auto-delete a patient or appointment from DreamCRM, so
          your history and notes stay intact.
        </p>
      </div>
      <div className="v2-card p-5">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">What stays in your PMS</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          We&apos;re the relationship layer, not your chart. Clinical data never leaves the PMS.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {NEVER_TOUCHED.map((n) => (
            <span key={n} className="text-xs px-2 py-1 rounded-[var(--r-xs)] bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300">
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function FieldMapSection() {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Field mapping</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">How Open Dental fields map to DreamCRM</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {OPEN_DENTAL_FIELD_MAP.map((em) => (
          <div key={em.entity} className="v2-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{em.label}</h3>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300">
                {em.direction === 'two_way' ? 'Two-way' : 'Import'}
              </span>
            </div>
            <ul className="space-y-1">
              {em.fields.map((f) => (
                <li key={f.pms} className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-mono-num text-gray-500 dark:text-gray-400">{f.pms}</span>
                  <span className="text-gray-400 dark:text-gray-500"> → </span>
                  <span className="font-mono-num">{f.crm}</span>
                  {f.note && <span className="block text-xs text-gray-400 dark:text-gray-500 pl-1">{f.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScopeIcon({ icon }: { icon: SyncedEntity['icon'] }) {
  const cls = 'w-4 h-4'
  if (icon === 'users')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  if (icon === 'cal')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    )
  if (icon === 'badge')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 4.556-3.04 8.25-7.5 9.493a1.5 1.5 0 01-3 0C6.04 20.25 3 16.556 3 12V6.75a1.5 1.5 0 011.06-1.433l7.5-2.25a1.5 1.5 0 01.88 0l7.5 2.25A1.5 1.5 0 0121 6.75V12z" />
    </svg>
  )
}

function PlugIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V3m6 4V3M7 11h10M9 11v4a3 3 0 003 3v3m0-3a3 3 0 003-3v-4" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.027 14.652H8.02v4.992m-3.71-9.673a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99m-.001 0h-4.99m-9.504 1.654a8.25 8.25 0 0013.803 3.7l3.181-3.182m0 0h-4.991m4.991 0v4.99" />
    </svg>
  )
}
