import 'server-only'
import { METRICS, type MetricKey } from '@/lib/metrics-registry'
import { heartbeatFor, type Heartbeat } from '@/lib/metric-series'
import { readOrgSeriesMany } from '@/lib/services/metric-snapshot'

/**
 * THE FUNNEL'S HEARTBEATS (ML-38). The Growth hub's reactivation funnel's four
 * stages each read their own daily series from the metrics snapshot — the
 * spark through the chart kit and the honest line under it ("tracked since
 * Nov 9" until a fortnight exists, then the comparison). Nothing is
 * backfilled: a clinic's history starts the day the snapshot did.
 *
 * Its own file (not growth-hub.ts) so the word-of-mouth reader keeps its
 * light import graph.
 */
export type FunnelStage = 'due' | 'sent' | 'opened' | 'booked'
export type FunnelHeartbeats = Record<FunnelStage, Heartbeat>

export const FUNNEL_METRICS = {
  due: 'recall_due_reachable',
  sent: 'recall_sent',
  opened: 'recall_opened',
  booked: 'recall_booked',
} as const satisfies Record<FunnelStage, MetricKey>

/** What each flow stage counts, so "opened · 30d 62%" is not followed by a bare number. */
const FUNNEL_NOUNS: Record<FunnelStage, string | undefined> = { due: undefined, sent: 'sent', opened: 'opened', booked: 'booked back' }

export async function getFunnelHeartbeats(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<FunnelHeartbeats> {
  const series = await readOrgSeriesMany(organizationId, Object.values(FUNNEL_METRICS), 30, { now, timeZone })
  const out = {} as FunnelHeartbeats
  for (const stage of Object.keys(FUNNEL_METRICS) as FunnelStage[]) {
    const key = FUNNEL_METRICS[stage]
    out[stage] = heartbeatFor(series[key], METRICS[key].kind, { noun: FUNNEL_NOUNS[stage] })
  }
  return out
}
