export const metadata = {
  title: 'Prospecting — DreamCRM',
  description: 'Dental-clinic prospect discovery, scoring, and outreach.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listProspects,
  getFunnelStats,
  getProspectingConfig,
  getProspectDetail,
  getHuntStats,
  getWinLossReport,
} from '@/lib/services/prospecting'
import { getDailyBriefing } from '@/lib/services/prospecting-briefing'
import ProspectDrawer from './prospect-drawer'
import HuntPanel from './hunt-panel'
import DailyBriefing from './daily-briefing'
import CopilotBar from './copilot-bar'
import PipelinePanel from './pipeline-panel'
import FocusBanner from './focus-banner'
import {
  PROSPECT_STATUS_LABELS,
  SCORE_BAND_LABELS,
  ratingLabel,
  type ProspectFilters,
  type ProspectScoreBand,
  type ProspectStatus,
} from '@/lib/types/prospecting'
import { US_STATE_NAMES, type UsState } from '@/lib/types/us-geo'
import { PROSPECT_STATUSES, PROSPECT_SCORE_BANDS } from '@/lib/db/schema/prospecting'
import type { Tone } from '@/lib/ui/encodings'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'

// Status → tone: the pill carries state, not urgency. call_list is the
// "new/featured — act on me" moment; engaged is "needs our action soon".
const STATUS_TONES: Record<ProspectStatus, Tone> = {
  discovered: 'neutral',
  enriching: 'info',
  enriched: 'info',
  queued: 'info',
  contacted: 'info',
  engaged: 'warn',
  call_list: 'special',
  converted: 'ok',
  not_interested: 'neutral',
  suppressed: 'neutral',
  disqualified: 'neutral',
}
const BAND_TONES: Record<ProspectScoreBand, Tone> = {
  hot: 'urgent',
  warm: 'warn',
  cool: 'info',
  low: 'neutral',
}

function buildQuery(
  base: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const merged: Record<string, string | undefined> = {
    ...base,
    ...patch,
    page: undefined,
    prospect: undefined,
  }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
  const qs = params.toString()
  return qs ? `/platform/prospecting?${qs}` : '/platform/prospecting'
}

export default async function ProspectingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const params = await searchParams
  const filters: ProspectFilters = {
    state: params.state,
    status: (PROSPECT_STATUSES as readonly string[]).includes(params.status ?? '')
      ? (params.status as ProspectStatus)
      : undefined,
    scoreBand: (PROSPECT_SCORE_BANDS as readonly string[]).includes(params.band ?? '')
      ? (params.band as ProspectScoreBand)
      : undefined,
    hasWebsite: params.web === 'yes' ? true : params.web === 'no' ? false : undefined,
    search: params.q,
  }
  const page = Math.max(1, Number(params.page) || 1)

  const [config, funnel, list, detail, huntStats, briefing, winLoss] = await Promise.all([
    getProspectingConfig(),
    getFunnelStats(),
    listProspects(filters, page),
    params.prospect ? getProspectDetail(params.prospect) : Promise.resolve(null),
    getHuntStats(),
    getDailyBriefing(),
    getWinLossReport(),
  ])
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize))
  const activeStates = config.enabledStates as UsState[]
  const huntEnv = {
    senderConfigured: Boolean(process.env.OUTREACH_EMAIL_FROM?.trim()),
    gmailConfigured: Boolean(process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim()),
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Prospecting"
        subtitle="Every dental clinic we can find, scored by how much they need us. Hot prospects get outreach; intent lands them on your call list."
        actions={
          <div className="flex items-center gap-2">
            <CopilotBar />
            <ActionButton href="/platform/prospecting/call-list" variant={funnel.callList > 0 ? 'primary' : 'secondary'}>
              📞 Call list{funnel.callList > 0 ? ` (${funnel.callList - funnel.converted})` : ''}
            </ActionButton>
            <ActionButton href="/platform/prospecting/sequences" variant="secondary">
              ✉️ Sequences
            </ActionButton>
            <ActionButton href="/platform/prospecting/territory" variant="secondary">
              🗺️ Territory
            </ActionButton>
            <ActionButton href="/platform/prospecting/settings" variant="secondary">
              ⚙️ Settings
            </ActionButton>
          </div>
        }
      />

      {config.killSwitch && (
        <div className="mb-6 v2-card border-l-4 border-amber-400 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          The prospecting engine is <span className="font-semibold">switched off</span> — discovery,
          enrichment, and outreach are all idle.{' '}
          <Link href="/platform/prospecting/settings" className="font-medium text-teal-600 dark:text-teal-400 hover:underline">
            Turn it on in Settings →
          </Link>
        </div>
      )}

      {config.focus.state && <FocusBanner state={config.focus.state} />}

      {!config.killSwitch && <DailyBriefing briefing={briefing} />}

      {!config.killSwitch && <HuntPanel stats={huntStats} config={config} env={huntEnv} />}

      <PipelinePanel report={winLoss} />

      {/* Funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiStat label="Discovered" value={funnel.discovered} />
        <KpiStat label="Enriched" value={funnel.enriched} />
        <KpiStat label="Contacted" value={funnel.contacted} />
        <KpiStat label="Engaged" value={funnel.engaged} />
        <KpiStat
          label="Call list"
          value={funnel.callList}
          tone={funnel.callList > 0 ? 'warn' : undefined}
          sub={funnel.callList > 0 ? 'ready for your call' : undefined}
        />
        <KpiStat label="Converted" value={funnel.converted} tone="ok" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChip active={!filters.scoreBand && !filters.status && filters.hasWebsite === undefined} href={buildQuery(params, { band: undefined, status: undefined, web: undefined })}>
          All
        </FilterChip>
        {PROSPECT_SCORE_BANDS.map((band) => (
          <FilterChip
            key={band}
            active={filters.scoreBand === band}
            href={buildQuery(params, { band: filters.scoreBand === band ? undefined : band })}
          >
            {SCORE_BAND_LABELS[band]}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-[color:var(--color-hairline)]" aria-hidden="true" />
        <FilterChip active={filters.hasWebsite === false} href={buildQuery(params, { web: filters.hasWebsite === false ? undefined : 'no' })} title="Clinics with no website at all — the hottest segment">
          🌐✕ No website
        </FilterChip>
        <FilterChip active={filters.status === 'call_list'} href={buildQuery(params, { status: filters.status === 'call_list' ? undefined : 'call_list' })}>
          📞 Call list
        </FilterChip>
        <FilterChip active={filters.status === 'converted'} href={buildQuery(params, { status: filters.status === 'converted' ? undefined : 'converted' })}>
          Converted
        </FilterChip>
        {activeStates.length > 1 && (
          <>
            <span className="mx-1 h-4 w-px bg-[color:var(--color-hairline)]" aria-hidden="true" />
            {activeStates.map((s) => (
              <FilterChip
                key={s}
                active={filters.state === s}
                href={buildQuery(params, { state: filters.state === s ? undefined : s })}
                title={US_STATE_NAMES[s]}
              >
                {s}
              </FilterChip>
            ))}
          </>
        )}
        <form action="/platform/prospecting" method="get" className="ml-auto">
          {filters.state && <input type="hidden" name="state" value={filters.state} />}
          <input
            type="search"
            name="q"
            defaultValue={filters.search ?? ''}
            placeholder="Search name, city, dentist…"
            className="form-input text-sm py-1.5 w-56"
          />
        </form>
      </div>

      {/* Table */}
      {list.rows.length === 0 ? (
        <EmptyState
          icon="🔭"
          title={list.total === 0 && funnel.discovered === 0 ? 'No prospects yet' : 'Nothing matches these filters'}
          body={
            list.total === 0 && funnel.discovered === 0
              ? 'Enable a state in Settings and the discovery engine will start pulling every dental clinic from the NPI registry within a few hours.'
              : 'Clear a filter or two — the prospects are still here.'
          }
          action={
            list.total === 0 && funnel.discovered === 0 ? (
              <ActionButton href="/platform/prospecting/settings" variant="primary">
                Open Settings
              </ActionButton>
            ) : (
              <ActionButton href="/platform/prospecting" variant="secondary">
                Clear filters
              </ActionButton>
            )
          }
        />
      ) : (
        <div className="v2-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-[color:var(--color-hairline)]">
                <th className="px-4 py-3">Practice</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Owner / official</th>
                <th className="px-4 py-3">Website</th>
                <th className="px-4 py-3">Google</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[color:var(--color-hairline)] last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    <Link
                      href={`${buildQuery(params, {})}${buildQuery(params, {}).includes('?') ? '&' : '?'}prospect=${p.id}`}
                      scroll={false}
                      className="hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      {p.name}
                    </Link>
                    {p.phone && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        ({p.phone.slice(0, 3)}) {p.phone.slice(3, 6)}-{p.phone.slice(6)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {p.authorizedOfficialName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.websiteUrl ? (
                      <a
                        href={p.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 dark:text-teal-400 hover:underline break-all"
                      >
                        {p.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32)}
                      </a>
                    ) : p.status === 'discovered' || p.status === 'enriching' ? (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">not checked yet</span>
                    ) : (
                      <StatusPill tone="urgent" label="No website" title="No website found — the hottest kind of prospect" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                    {ratingLabel(p.googleRatingTenths, p.reviewCount) ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.scoreBand ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusPill tone={BAND_TONES[p.scoreBand]} label={SCORE_BAND_LABELS[p.scoreBand]} />
                        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {p.opportunityScore}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={STATUS_TONES[p.status]} label={PROSPECT_STATUS_LABELS[p.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <ProspectDrawer detail={detail} closeHref={buildQuery(params, {})} />}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span className="tabular-nums">
            {list.total.toLocaleString()} prospects · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <ActionButton
                href={`${buildQuery(params, {})}${buildQuery(params, {}).includes('?') ? '&' : '?'}page=${page - 1}`}
                variant="secondary"
                size="sm"
              >
                ← Previous
              </ActionButton>
            )}
            {page < totalPages && (
              <ActionButton
                href={`${buildQuery(params, {})}${buildQuery(params, {}).includes('?') ? '&' : '?'}page=${page + 1}`}
                variant="secondary"
                size="sm"
              >
                Next →
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
