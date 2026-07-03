export const metadata = {
  title: 'Demo Prep — DreamCRM',
  description: 'Pre-demo briefing: gaps, story, objections, beat emphasis.',
}

export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getProspectDetail } from '@/lib/services/prospecting'
import { getDemoBrief } from '@/lib/services/demo-brief'
import { deriveDemoGaps } from '@/lib/demo-gaps'
import { DEMO_BEATS } from '@/lib/types/demo-script'
import { ratingLabel } from '@/lib/types/prospecting'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import { PageHeader } from '@/components/ui/page-header'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import BriefPanel from './brief-panel'
import PrepActions from './prep-actions'

const SECTION = 'v2-panel p-5 mb-5'
const SECTION_TITLE =
  'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3'

function ageLabel(iso: string | undefined | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (!Number.isFinite(days) || days < 0) return null
  return days === 0 ? 'crawled today' : days === 1 ? 'crawled yesterday' : `crawled ${days} days ago`
}

export default async function DemoPrepPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const { id } = await params
  const detail = await getProspectDetail(id)
  if (!detail) notFound()
  const p = detail.prospect
  const signals = (p.enrichment ?? null) as ProspectCrawlSignals | null
  const verdict = (p.aiVerdict ?? null) as ProspectAiVerdict | null
  const brief = await getDemoBrief(id)

  const gaps = deriveDemoGaps(signals, verdict, {
    ratingTenths: p.googleRatingTenths,
    reviewCount: p.reviewCount,
  })
  const beatTitle = new Map(DEMO_BEATS.map((b, i) => [b.id, `Beat ${i + 1} · ${b.title}`]))
  const gapsByBeat = new Map<string, string[]>()
  for (const g of gaps) {
    const list = gapsByBeat.get(g.beatId) ?? []
    list.push(g.label)
    gapsByBeat.set(g.beatId, list)
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      {/* Print = the one-pager: hide app chrome, keep the brief. */}
      <style>{`@media print { aside, header, nav, [data-testid="demo-hairline"], .no-print { display: none !important } }`}</style>
      <PageHeader
        eyebrow="Platform · Prospecting · Demo prep"
        title={p.name}
        subtitle={[
          p.authorizedOfficialName,
          [p.city, p.state].filter(Boolean).join(', '),
          p.phone ? `(${p.phone.slice(0, 3)}) ${p.phone.slice(3, 6)}-${p.phone.slice(6)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<PrepActions prospectId={p.id} />}
      />

      {/* The numbers vs. typical */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiStat
          label="Google rating"
          value={p.googleRatingTenths != null ? `${(p.googleRatingTenths / 10).toFixed(1)}★` : '—'}
          sub="typical established practice: ~4.5★"
          tone={p.googleRatingTenths != null && p.googleRatingTenths < 42 ? 'warn' : undefined}
        />
        <KpiStat
          label="Google reviews"
          value={p.reviewCount ?? '—'}
          sub="typical: ~200"
          tone={p.reviewCount != null && p.reviewCount < 50 ? 'warn' : undefined}
        />
        <KpiStat
          label="Opportunity score"
          value={p.opportunityScore ?? '—'}
          sub={p.scoreBand ? `${p.scoreBand} — how much they need us` : undefined}
          tone={p.scoreBand === 'hot' ? 'urgent' : p.scoreBand === 'warm' ? 'warn' : undefined}
        />
      </div>

      {/* Demo ammunition — gaps mapped to the beat where they land */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>Demo ammunition — where each gap lands</div>
        {gaps.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No verified gaps yet — {signals ? 'this practice looks healthy online (sell the time-savings story instead)' : 'run a re-enrich to crawl their site first'}.
          </p>
        ) : (
          <ul className="space-y-2">
            {Array.from(gapsByBeat.entries()).map(([beatId, labels]) => (
              <li key={beatId} className="text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {beatTitle.get(beatId) ?? beatId}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {' '}
                  — {labels.join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Walk-up story — what their presence says today */}
      <section className={SECTION}>
        <div className={SECTION_TITLE}>
          Walk-up story{signals?.fetchedAt ? ` · ${ageLabel(signals.fetchedAt)}` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {p.websiteUrl ? (
            <a
              href={p.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              {p.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')} ↗
            </a>
          ) : (
            <StatusPill tone="urgent" label="No website" />
          )}
          {signals && (
            <>
              <StatusPill tone={signals.mobileViewport ? 'ok' : 'urgent'} label={signals.mobileViewport ? 'Mobile-ready' : 'Not mobile-friendly'} />
              <StatusPill tone={signals.bookingWidget ? 'ok' : 'warn'} label={signals.bookingWidget ? 'Has online booking' : 'No online booking'} />
              {signals.builder && <StatusPill tone="neutral" label={`Built on ${signals.builder}`} />}
              {signals.copyrightYear != null && (
                <StatusPill
                  tone={signals.copyrightYear < new Date().getFullYear() - 1 ? 'warn' : 'neutral'}
                  label={`Footer says ${signals.copyrightYear}`}
                />
              )}
            </>
          )}
          {signals?.themeColor && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span
                className="h-4 w-4 rounded ring-1 ring-inset ring-[color:var(--color-hairline)]"
                style={{ background: signals.themeColor }}
                aria-hidden="true"
              />
              their brand color (from their site&apos;s theme-color tag)
            </span>
          )}
        </div>
        {Array.isArray(p.scoreReasons) && (p.scoreReasons as string[]).length > 0 && (
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {(p.scoreReasons as string[]).map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true">•</span>
                {r}
              </li>
            ))}
          </ul>
        )}
        {verdict?.summary && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{verdict.summary}</p>
        )}
      </section>

      {/* AI one-pager */}
      <BriefPanel prospectId={p.id} brief={brief} beatTitles={Object.fromEntries(beatTitle)} />
    </div>
  )
}
