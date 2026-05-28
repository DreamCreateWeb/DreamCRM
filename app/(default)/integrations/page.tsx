import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getIntegrationsDashboard, openDentalConfigured } from '@/lib/services/pms'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import {
  ENTITY_LABELS,
  NEVER_TOUCHED,
  OPEN_DENTAL_FIELD_MAP,
  PMS_PROVIDERS,
  PROVIDER_LABELS,
  SYNCED_ENTITIES,
  SYNC_STATUS_LABELS,
  WRITE_OP_STATUS_LABELS,
  type PmsAvailability,
  type SyncedEntity,
  type SyncRunStatus,
  type WriteOpStatus,
} from '@/lib/types/pms'
import type { PmsSyncRun } from '@/lib/db/schema/clinic'
import ConnectPanel from './connect-panel'
import SyncControls from './sync-controls'

export const metadata = {
  title: 'Integrations - DreamCRM',
  description: 'Sync your PMS — Open Dental — through its official API. Audit-clean, never the database.',
}

export const dynamic = 'force-dynamic'

/**
 * PMS Integrations v1 — morning-huddle layout (mirrors Reviews / Recall /
 * Overview). DreamCRM wraps the clinic's PMS (Open Dental first), syncing the
 * relationship layer two-way through the OFFICIAL API only, so every write
 * lands in the clinic's Audit Trail. The opposite of the direct-DB scrapers
 * Open Dental publicly warns its customers against — that's our wedge.
 */

const RUN_PILL: Record<SyncRunStatus, string> = {
  running: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
}

const WRITE_PILL: Record<WriteOpStatus, string> = {
  pending: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  skipped: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
}

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
  for (const t of Object.values(counts ?? {})) {
    created += t?.created ?? 0
    updated += t?.updated ?? 0
    skipped += t?.skipped ?? 0
  }
  const parts: string[] = []
  if (created) parts.push(`${created} new`)
  if (updated) parts.push(`${updated} updated`)
  if (skipped) parts.push(`${skipped} unchanged`)
  return parts.length ? parts.join(' · ') : 'no changes'
}

export default async function IntegrationsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [dashboard, configured, health] = await Promise.all([
    getIntegrationsDashboard(ctx.organizationId),
    Promise.resolve(openDentalConfigured()),
    getIntegrationsHealth(ctx.organizationId),
  ])
  const { connection, counts, totals, pendingWrites, recentRuns, recentWrites } = dashboard
  const connected = connection?.status === 'connected'
  const isDemo = connection?.provider === 'demo'
  const now = new Date()
  const practiceTitle = (connection?.meta as Record<string, unknown> | undefined)?.practiceTitle as string | undefined

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
          Integrations · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Integrations</h1>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-3xl">
          DreamCRM wraps the practice-management system you already run — it doesn&apos;t replace it. We sync the
          relationship layer (patients, appointments, providers, balances) through the PMS&apos;s <span className="font-medium text-stone-600 dark:text-stone-300">official API</span>, both directions, and never touch your database directly.
        </p>
      </div>

      {/* ── Trust banner ──────────────────────────────────────────── */}
      <div className="mb-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          <ShieldIcon />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Sanctioned &amp; audit-clean</p>
          <p className="text-[12px] text-emerald-800/80 dark:text-emerald-300/80">
            Every read and write goes through Open Dental&apos;s official API, so each change is recorded in your
            Open Dental Audit Trail. We never write directly to your database — the practice Open Dental itself warns
            against. You can see every record we created in your PMS in the write-back log below.
          </p>
        </div>
      </div>

      {connected ? (
        <>
          {/* ── Sync-health alert (renders only when unhealthy) ───── */}
          {health && health.severity !== 'info' && (
            <div
              className={[
                'mb-6 rounded-xl border p-4 flex items-start gap-3',
                health.severity === 'error'
                  ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
              ].join(' ')}
            >
              <div
                className={[
                  'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base font-semibold',
                  health.severity === 'error'
                    ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
                ].join(' ')}
                aria-hidden="true"
              >
                !
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={[
                    'text-sm font-semibold',
                    health.severity === 'error'
                      ? 'text-rose-900 dark:text-rose-200'
                      : 'text-amber-900 dark:text-amber-200',
                  ].join(' ')}
                >
                  Sync needs attention
                </p>
                <p
                  className={[
                    'text-[12px] mt-0.5',
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

          {/* ── Status card ───────────────────────────────────────── */}
          <section className="mb-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <PlugIcon />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                      {PROVIDER_LABELS[connection!.provider as keyof typeof PROVIDER_LABELS] ?? connection!.provider}
                    </h2>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      Connected
                    </span>
                  </div>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400">
                    {practiceTitle ? `${practiceTitle} · ` : ''}Last synced {fmtRelative(connection!.lastSyncAt)}
                    {connection!.lastSyncStatus === 'error' ? ' · last run failed' : ''}
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
              <p className="mt-3 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
                Last sync error: {connection!.lastError}
              </p>
            )}
          </section>

          {/* ── KPIs ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Kpi label="Patients synced" value={counts.patients} hint={`${totals.patients} total in DreamCRM`} />
            <Kpi label="Appointments synced" value={counts.appointments} hint={`${totals.appointments} total`} />
            <Kpi label="Providers" value={counts.providers} hint="Linked to your agenda" />
            <Kpi
              label="Awaiting write-back"
              value={pendingWrites}
              hint={pendingWrites > 0 ? 'Will push on next sync' : 'All bookings pushed'}
              tone={pendingWrites > 0 ? 'warn' : 'ok'}
            />
          </div>

          <ScopeSection />
          <FieldMapSection />

          {/* ── Inbound sync log ──────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">Sync history (PMS → DreamCRM)</h2>
            {recentRuns.length === 0 ? (
              <EmptyCard text="No syncs yet — hit “Sync now” to pull your patients and schedule in." />
            ) : (
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
                    <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Trigger</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => (
                      <tr key={r.id} className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0">
                        <td className="px-3 py-2.5 text-[12px] text-stone-600 dark:text-stone-300 tabular-nums">{fmtRelative(r.startedAt)}</td>
                        <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400 capitalize">{r.trigger}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${RUN_PILL[r.status as SyncRunStatus]}`}>
                            {SYNC_STATUS_LABELS[r.status as SyncRunStatus]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400">{summarizeRun(r.counts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Outbound write-back log ───────────────────────────── */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Write-back log (DreamCRM → PMS)</h2>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">Every record we created in your PMS, via the API</p>
            </div>
            {recentWrites.length === 0 ? (
              <EmptyCard text="No write-backs yet. New bookings from your website, portal, or front desk will appear here once pushed to the PMS." />
            ) : (
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
                    <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                      <th className="px-3 py-2">Record</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">PMS id</th>
                      <th className="px-3 py-2">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentWrites.map((w) => (
                      <tr key={w.id} className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0">
                        <td className="px-3 py-2.5">
                          <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100">{w.label}</p>
                          {w.error && <p className="text-[11px] text-rose-500 dark:text-rose-400">{w.error}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400">
                          {ENTITY_LABELS[w.entityType as keyof typeof ENTITY_LABELS] ?? w.entityType}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${WRITE_PILL[w.status]}`}>
                            {WRITE_OP_STATUS_LABELS[w.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400 font-mono">{w.externalId ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">{fmtRelative(w.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* ── Connect (Open Dental) ─────────────────────────────── */}
          <section className="mb-8">
            <ConnectPanel configured={configured} />
          </section>

          <ScopeSection />

          {/* ── Other PMSes (honest roadmap) ──────────────────────── */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">Other systems</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PMS_PROVIDERS.filter((p) => p.id !== 'open_dental').map((p) => (
                <div key={p.id} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[15px] font-semibold text-stone-800 dark:text-stone-100">{p.name}</h3>
                    <AvailabilityPill availability={p.availability} />
                  </div>
                  <p className="text-[12px] text-stone-600 dark:text-stone-300 mb-1">{p.blurb}</p>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">{p.connection}{p.note ? ` · ${p.note}` : ''}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Coming next ───────────────────────────────────────────── */}
      <section>
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">Coming next</p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Scheduled auto-sync on a cron (manual “Sync now” + best-effort write-back on booking ship today)</li>
            <li>· Write-back of reschedules + cancellations into the PMS (v1 pushes new bookings; edits flow PMS → DreamCRM)</li>
            <li>· Dentrix Ascend (cloud REST API — pending Henry Schein One partner approval)</li>
            <li>· Eaglesoft / Dentrix desktop / Curve via a signed local connector per office</li>
            <li>· Configurable field mapping (today the Open Dental mapping is fixed + shown in full above)</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums mt-0.5 ${
          tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-900 dark:text-stone-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
      <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">{text}</p>
    </div>
  )
}

function ScopeSection() {
  return (
    <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">What we sync</h2>
        <ul className="space-y-2.5">
          {SYNCED_ENTITIES.map((e) => (
            <li key={e.label} className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <ScopeIcon icon={e.icon} />
              </span>
              <div>
                <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100">{e.label}</p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">{e.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">What stays in your PMS</h2>
        <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3">
          We&apos;re the relationship layer, not your chart. Clinical data never leaves the PMS.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {NEVER_TOUCHED.map((n) => (
            <span key={n} className="text-[11px] px-2 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
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
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Field mapping</h2>
        <p className="text-[11px] text-stone-400 dark:text-stone-500">How Open Dental fields map to DreamCRM</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {OPEN_DENTAL_FIELD_MAP.map((em) => (
          <div key={em.entity} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[13px] font-semibold text-stone-800 dark:text-stone-100">{em.label}</h3>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                {em.direction === 'two_way' ? 'Two-way' : 'Import'}
              </span>
            </div>
            <ul className="space-y-1">
              {em.fields.map((f) => (
                <li key={f.pms} className="text-[11px] text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-500 dark:text-stone-400">{f.pms}</span>
                  <span className="text-stone-300 dark:text-stone-600"> → </span>
                  <span className="font-mono">{f.crm}</span>
                  {f.note && <span className="block text-[10px] text-stone-400 dark:text-stone-500 pl-1">{f.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function AvailabilityPill({ availability }: { availability: PmsAvailability }) {
  const map: Record<PmsAvailability, { label: string; cls: string }> = {
    live: { label: 'Available', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
    request_access: { label: 'Request access', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' },
    roadmap: { label: 'On the roadmap', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
  }
  const m = map[availability]
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>
}

function ScopeIcon({ icon }: { icon: SyncedEntity['icon'] }) {
  const cls = 'w-4 h-4'
  if (icon === 'users')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  if (icon === 'cal')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    )
  if (icon === 'badge')
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 4.556-3.04 8.25-7.5 9.493a1.5 1.5 0 01-3 0C6.04 20.25 3 16.556 3 12V6.75a1.5 1.5 0 011.06-1.433l7.5-2.25a1.5 1.5 0 01.88 0l7.5 2.25A1.5 1.5 0 0121 6.75V12z" />
    </svg>
  )
}

function PlugIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V3m6 4V3M7 11h10M9 11v4a3 3 0 003 3v3m0-3a3 3 0 003-3v-4" />
    </svg>
  )
}
