// Pure territory helpers — the ranking + gap logic behind the coverage map.
// Client-safe (imported by the territory table and the tests); the SQL that
// builds the rows lives in lib/services/prospecting.ts.

import type { TerritoryRow } from '@/lib/types/prospecting'

/** A coverage "stage" for a state — the one-word status the map colours by. */
export type TerritoryStage = 'idle' | 'discovering' | 'enriching' | 'working' | 'closing'

export function territoryStage(row: TerritoryRow): TerritoryStage {
  if (row.total === 0) return 'idle'
  if (row.won > 0 || row.callList > 0) return 'closing'
  if (row.contacted > 0) return 'working'
  if (row.tasksPending > 0 && row.enriched < row.total) return 'enriching'
  if (row.enriched < row.total) return 'discovering'
  return 'working'
}

export const TERRITORY_STAGE_LABELS: Record<TerritoryStage, string> = {
  idle: 'Not started',
  discovering: 'Discovering',
  enriching: 'Enriching',
  working: 'Working',
  closing: 'Closing',
}

/** Sort territories for the map: enabled first, then by raw opportunity
 *  (total discovered), then alphabetically — the biggest live pools on top. */
export function rankTerritories(rows: TerritoryRow[]): TerritoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    if (b.total !== a.total) return b.total - a.total
    return a.state.localeCompare(b.state)
  })
}

export interface TerritoryInsights {
  totalStates: number
  enabledStates: number
  totalProspects: number
  totalWon: number
  /** Enabled states we've barely touched — big pool, low worked %. */
  underworked: Array<{ state: string; stateName: string; total: number; workedPct: number }>
  /** Enabled states with a discovery grid still running (coverage incomplete). */
  stillDiscovering: string[]
  /** The single best state to focus next — most hot prospects sitting there,
   *  not already the focus. null when nothing hot is waiting. */
  suggestedFocus: { state: string; stateName: string; hot: number } | null
  /** True when very few states are enabled — a nudge to widen the net. */
  enableMore: boolean
}

/** Total US states/territories the discovery grid can cover — the denominator
 *  for the "enable more" nudge (kept loose; the real list is US_STATES). */
const FEW_STATES_THRESHOLD = 3

/** Headline read for the map — where the owner is leaving money on the table. */
export function summarizeTerritories(
  rows: TerritoryRow[],
  focusState?: string | null,
): TerritoryInsights {
  const enabled = rows.filter((r) => r.enabled)
  const underworked = enabled
    .filter((r) => r.total >= 20 && r.workedPct < 50)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((r) => ({ state: r.state, stateName: r.stateName, total: r.total, workedPct: r.workedPct }))
  const stillDiscovering = enabled
    .filter((r) => r.tasksPending > 0)
    .sort((a, b) => b.tasksPending - a.tasksPending)
    .map((r) => r.state)

  // Suggest the enabled state (not already focused) with the most hot prospects
  // waiting — the fastest path to booked demos.
  const focusCandidate = enabled
    .filter((r) => r.hot > 0 && r.state !== focusState)
    .sort((a, b) => b.hot - a.hot || b.total - a.total)[0]
  const suggestedFocus = focusCandidate
    ? { state: focusCandidate.state, stateName: focusCandidate.stateName, hot: focusCandidate.hot }
    : null

  return {
    totalStates: rows.filter((r) => r.total > 0).length,
    enabledStates: enabled.length,
    totalProspects: rows.reduce((n, r) => n + r.total, 0),
    totalWon: rows.reduce((n, r) => n + r.won, 0),
    underworked,
    stillDiscovering,
    suggestedFocus,
    enableMore: enabled.length > 0 && enabled.length < FEW_STATES_THRESHOLD,
  }
}
