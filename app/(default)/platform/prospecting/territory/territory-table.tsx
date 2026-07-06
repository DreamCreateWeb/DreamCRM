'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TerritoryRow } from '@/lib/types/prospecting'
import {
  rankTerritories,
  territoryStage,
  TERRITORY_STAGE_LABELS,
  summarizeTerritories,
  type TerritoryStage,
} from '@/lib/prospect-territory'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import { setFocusStateAction } from '../admin-actions'

const STAGE_TONE: Record<TerritoryStage, Tone> = {
  idle: 'neutral',
  discovering: 'info',
  enriching: 'info',
  working: 'warn',
  closing: 'ok',
}

export default function TerritoryTable({
  rows,
  focusState,
}: {
  rows: TerritoryRow[]
  focusState: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const ranked = rankTerritories(rows)
  const insights = summarizeTerritories(rows, focusState)

  const setFocus = (state: string | null) =>
    startTransition(async () => {
      await setFocusStateAction(state)
      router.refresh()
    })

  return (
    <div>
      {/* Insights strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="States in play" value={insights.totalStates} />
        <Stat label="Enabled" value={insights.enabledStates} />
        <Stat label="Prospects found" value={insights.totalProspects.toLocaleString()} />
        <Stat label="Won" value={insights.totalWon} tone="teal" />
      </div>

      {insights.suggestedFocus && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-sm)] border border-teal-500/25 bg-teal-500/5 px-4 py-3">
          <div className="text-sm text-gray-800 dark:text-gray-100">
            <span aria-hidden="true">✨</span> <span className="font-semibold">
              {insights.suggestedFocus.hot} hot
            </span>{' '}
            {insights.suggestedFocus.hot === 1 ? 'practice is' : 'practices are'} waiting in{' '}
            {insights.suggestedFocus.stateName} — the fastest path to booked demos.
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => setFocus(insights.suggestedFocus!.state)}
            className="rounded-[var(--r-xs)] bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            Focus {insights.suggestedFocus.state}
          </button>
        </div>
      )}

      {insights.underworked.length > 0 && (
        <div className="mb-5 rounded-[var(--r-sm)] border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Room to work
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300">
            {insights.underworked
              .map((u) => `${u.stateName} (${u.total} found, ${u.workedPct}% worked)`)
              .join(' · ')}{' '}
            — big pools you&apos;ve barely touched. Focus one and drive it.
          </p>
        </div>
      )}

      {insights.enableMore && (
        <div className="mb-5 rounded-[var(--r-sm)] border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-800/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
          Only {insights.enabledStates} state{insights.enabledStates === 1 ? '' : 's'} enabled — once
          this pool is warm, widen the net in{' '}
          <Link href="/platform/prospecting/settings" className="text-teal-700 dark:text-teal-300 hover:underline">
            settings → state rollout
          </Link>
          .
        </div>
      )}

      <div className="v2-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-hairline)] text-left text-xs text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium text-right">Found</th>
              <th className="px-3 py-2 font-medium text-right">Worked</th>
              <th className="px-3 py-2 font-medium text-right">Hot</th>
              <th className="px-3 py-2 font-medium text-right">Call list</th>
              <th className="px-3 py-2 font-medium text-right">Won</th>
              <th className="px-3 py-2 font-medium text-right">Convert</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const stage = territoryStage(r)
              const isFocus = focusState === r.state
              return (
                <tr
                  key={r.state}
                  className={`border-b border-[color:var(--color-hairline)] last:border-0 ${
                    isFocus ? 'bg-teal-500/5' : ''
                  } ${r.enabled ? '' : 'opacity-60'}`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/platform/prospecting?state=${r.state}`)}
                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      {r.state}
                    </button>
                    <span className="ml-2 text-xs text-gray-400">{r.stateName}</span>
                    {!r.enabled && (
                      <span className="ml-2 text-xs uppercase tracking-wide text-gray-400">
                        off
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={STAGE_TONE[stage]} label={TERRITORY_STAGE_LABELS[stage]} />
                    {r.tasksPending > 0 && (
                      <span className="ml-2 text-xs text-gray-400 tabular-nums">
                        {r.tasksPending} sweeping
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {r.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {r.total > 0 ? `${r.workedPct}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                    {r.hot || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {r.callList || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-teal-700 dark:text-teal-300">
                    {r.won || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {r.convertPct != null ? `${r.convertPct}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setFocus(isFocus ? null : r.state)}
                      className={`rounded-[var(--r-xs)] px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                        isFocus
                          ? 'bg-teal-600 text-white hover:bg-teal-700'
                          : 'border border-[color:var(--color-hairline-strong)] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {isFocus ? '★ Focused' : 'Focus'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400">
                  No territory yet — enable a state in settings to start the discovery grid.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'teal' }) {
  return (
    <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === 'teal'
            ? 'text-teal-700 dark:text-teal-300'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
