import Link from 'next/link'
import type { HuntStats } from '@/lib/services/prospecting'
import type { ProspectingConfig } from '@/lib/types/prospecting'
import { INTENT_SIGNAL_LABELS, type ProspectIntentSignal } from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'

/**
 * The hunt cockpit — last-24h activity + live engine status + who's hottest
 * right now, above the funnel on the prospecting home. This is the "is the
 * machine working" glance.
 */
export default function HuntPanel({
  stats,
  config,
  env,
}: {
  stats: HuntStats
  config: ProspectingConfig
  env: { senderConfigured: boolean; gmailConfigured: boolean }
}) {
  const live = !config.killSwitch && !config.dryRun
  const senderReady = env.senderConfigured || env.gmailConfigured
  const tile = (label: string, value: number, sub?: string, tone?: Tone) => (
    <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value.toLocaleString()}
      </div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {live
          ? tile('Sent', stats.sent24h)
          : tile('Drafted', stats.dryRun24h, 'dry-run')}
        {tile('Opens', stats.opens24h)}
        {tile('Clicks', stats.clicks24h)}
        {tile('Replies', stats.replies24h, undefined, stats.replies24h > 0 ? 'warn' : undefined)}
        {tile('New call-list', stats.newCallList24h, undefined, stats.newCallList24h > 0 ? 'warn' : undefined)}
        {tile('Auto-enrolled', stats.autoEnrolledToday, 'today')}
      </div>

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
