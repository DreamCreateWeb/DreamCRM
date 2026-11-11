import Link from 'next/link'
import type { HuntStats } from '@/lib/services/prospecting'
import type { ProspectingConfig, ProspectHygieneStats, ProspectQualityCounts } from '@/lib/types/prospecting'
import { INTENT_SIGNAL_LABELS, formatUtcStamp, type ProspectIntentSignal } from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { TONE_PILL, TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { MiniTrend } from '@/components/ui/charts'
import { PLATFORM_BUCKET_NOTE } from '@/lib/metrics-registry'
import type { Heartbeat } from '@/lib/metric-series'

const ENGINE_PILL_LEGEND = [
  { tone: 'ok' as Tone, label: 'Engine on / LIVE', meaning: 'The hunter is discovering and sending for real.' },
  { tone: 'info' as Tone, label: 'Dry-run', meaning: 'Everything drafts but nothing sends.' },
  { tone: 'urgent' as Tone, label: 'Watchdog TRIPPED', meaning: 'Bounces/complaints spiked — sending auto-paused to dry-run.' },
  { tone: 'warn' as Tone, label: 'Sender: not set', meaning: 'No sending identity configured — outreach can’t go out.' },
  { tone: 'special' as Tone, label: '🤖 Hunter on', meaning: 'Auto-enrollment is filling sequences on its own.' },
]

/**
 * The hunt cockpit — last-24h activity + live engine status + who's hottest
 * right now, above the funnel on the prospecting home. This is the "is the
 * machine working" glance.
 */
export default function HuntPanel({
  stats,
  config,
  env,
  sentByHour,
  quality,
  failures,
  hygiene,
}: {
  stats: HuntStats
  /** The hourly send series from the metrics snapshot (ML-38) — spark + honest line. */
  sentByHour?: Heartbeat | null
  config: ProspectingConfig
  env: { senderConfigured: boolean; gmailConfigured: boolean }
  /** Verification + quality counts (P-01); absent = the tiles stay off. */
  quality?: ProspectQualityCounts | null
  /** The verification pass's strikes this week (P-01), newest first. */
  failures?: Array<{ summary: string; occurredAt: Date }> | null
  /** The hygiene pass (P-03): merged today, resting now, the last refresh. */
  hygiene?: ProspectHygieneStats | null
}) {
  const live = !config.killSwitch && !config.dryRun
  const senderReady = env.senderConfigured || env.gmailConfigured
  const tile = (label: string, value: number, sub?: string, tone?: Tone, beat?: Heartbeat | null) => (
    <div className="rounded-[var(--r-xs)] bg-[color:var(--color-surface-sunk)] p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-0.5 font-mono-num text-xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value.toLocaleString()}
      </div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
      {beat?.spark && (
        <div className="mt-1" aria-hidden="true">
          <MiniTrend data={beat.spark} width={96} height={24} />
        </div>
      )}
      {beat && (beat.spark || beat.line) && (
        <div className="text-xs text-gray-500 dark:text-gray-400" data-heartbeat-line>
          {beat.line ? `${beat.line} · ` : 'by the hour · '}
          {PLATFORM_BUCKET_NOTE}
        </div>
      )}
    </div>
  )

  return (
    <section className="v2-card p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          The hunt · last 24 hours
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill
            tone={config.killSwitch ? 'neutral' : 'ok'}
            label={config.killSwitch ? 'Engine off' : 'Engine on'}
          />
          <StatusPill tone={config.dryRun ? 'info' : 'ok'} label={config.dryRun ? 'Dry-run' : 'LIVE'} />
          <StatusPill
            tone={config.watchdog.trippedAt ? 'urgent' : 'ok'}
            label={config.watchdog.trippedAt ? 'Watchdog TRIPPED' : 'Watchdog healthy'}
          />
          <StatusPill
            tone={senderReady ? 'ok' : 'warn'}
            label={
              env.gmailConfigured ? 'Sender: Gmail' : env.senderConfigured ? 'Sender: Resend' : 'Sender: not set'
            }
          />
          {config.autoEnroll.enabled && <StatusPill tone="special" label="🤖 Hunter on" />}
          <EncodingLegend pills={ENGINE_PILL_LEGEND} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {live
          ? tile('Sent', stats.sent24h, undefined, undefined, sentByHour)
          : tile('Drafted', stats.dryRun24h, 'dry-run')}
        {tile('Opens', stats.opens24h)}
        {tile('Clicks', stats.clicks24h)}
        {tile('Replies', stats.replies24h, undefined, stats.replies24h > 0 ? 'warn' : undefined)}
        {tile('New call-list', stats.newCallList24h, undefined, stats.newCallList24h > 0 ? 'warn' : undefined)}
        {tile('Auto-enrolled', stats.autoEnrolledToday, 'today')}
      </div>

      {quality && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Verification · floor {config.qualityFloor}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-quality-tiles>
            {tile('Best in queue', quality.bestInQueue, 'verified + dialable')}
            {tile('Good', quality.good, 'quality 60–79')}
            {tile('Parked', quality.parked, 'not served', quality.parked > 0 ? 'warn' : undefined)}
            {tile('Not verified yet', quality.unverified, 'the sweep is on it')}
            {hygiene &&
              tile(
                'Chains removed',
                hygiene.chainsRemoved,
                hygiene.chainsRestoredToday > 0
                  ? `set aside — targeted later · ${hygiene.chainsRestoredToday.toLocaleString()} restored today`
                  : 'set aside — targeted later',
              )}
            {hygiene && (
              <div className="rounded-[var(--r-xs)] bg-[color:var(--color-surface-sunk)] p-3 sm:col-span-2" data-hygiene-tile>
                <div className="text-xs text-gray-500 dark:text-gray-400">Hygiene · today</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  Merged {hygiene.mergedToday.toLocaleString()} · Resting {hygiene.resting.toLocaleString()}
                  {hygiene.lastRefresh
                    ? ` · Refreshed ${hygiene.lastRefresh.state} ${hygiene.lastRefresh.zipPrefix}xx`
                    : ' · No territory refreshed yet'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {hygiene.lastRefresh
                    ? `last refresh ${formatUtcStamp(hygiene.lastRefresh.at)}`
                    : `a finished territory is re-swept once it is ${config.hygiene.discoveryRefreshDays} days old`}
                </div>
                {hygiene.earlyRefresh && (
                  <div className={`mt-1 text-xs ${TONE_TEXT.warn}`} data-early-refresh>
                    Refreshing {hygiene.earlyRefresh.state} {hygiene.earlyRefresh.zipPrefix} early — {hygiene.earlyRefresh.reason}
                    <span className="text-gray-500 dark:text-gray-400"> · pulled {formatUtcStamp(hygiene.earlyRefresh.at)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {failures && failures.length > 0 && (
        <div
          role="status"
          className={`mt-3 rounded-[var(--r-xs)] ring-1 ring-inset ring-current/20 px-3 py-2 text-xs ${TONE_PILL.warn}`}
          data-verification-failures
        >
          <span className="font-semibold">Verification hit a wall this week.</span>
          <ul className="mt-1 space-y-0.5">
            {failures.slice(0, 4).map((f, i) => (
              <li key={i}>
                {f.summary} <span className="opacity-80">({formatUtcStamp(f.occurredAt)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.hottest.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Hottest right now
          </div>
          <ul className="space-y-1.5">
            {stats.hottest.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/platform/prospecting/call-list?highlight=${h.id}`}
                  className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {h.name}
                </Link>
                {h.intentSignal && (
                  <StatusPill
                    tone={h.status === 'call_list' ? 'special' : 'warn'}
                    label={
                      INTENT_SIGNAL_LABELS[h.intentSignal as ProspectIntentSignal] ?? h.intentSignal
                    }
                  />
                )}
                {h.intentSummary && (
                  <span className="truncate text-gray-500 dark:text-gray-400">{h.intentSummary}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
