import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { PmsConnection } from '@/lib/db/schema/clinic'

/**
 * Sync-health alerts. The #1 reliability complaint about PMS integrations in
 * the research was that syncs silently stop working — clinic operates on stale
 * data without noticing until they catch a real-world miss. We compute a
 * single health snapshot from `pms_connection.lastSyncAt/lastSyncStatus/lastError`
 * + the last few `pms_sync_run` rows, then surface it as an attention banner
 * on Overview AND on the Integrations page itself.
 *
 * No new schema — this is read-only over what we already capture.
 */

export type IntegrationsHealthStatus =
  | 'ok' // last sync recent and successful
  | 'never_synced' // connected but no sync attempt yet
  | 'stale' // auto-sync on, no sync in the staleness window
  | 'partial' // last sync skipped some entities
  | 'errored' // last sync (or connection test) failed
  | 'repeated_failure' // STREAK_THRESHOLD+ non-success runs in a row

export type IntegrationsHealthSeverity = 'info' | 'warn' | 'error'

export interface IntegrationsHealth {
  organizationId: string
  provider: string
  status: IntegrationsHealthStatus
  severity: IntegrationsHealthSeverity
  message: string
  lastSyncAt: Date | null
  lastSyncStatus: 'success' | 'partial' | 'error' | null
  lastError: string | null
  consecutiveFailures: number
  staleAfterHours: number
}

const STALE_AFTER_HOURS = 36
const STREAK_THRESHOLD = 3

export async function getIntegrationsHealth(
  organizationId: string,
  now: Date = new Date(),
): Promise<IntegrationsHealth | null> {
  const rows = await db
    .select()
    .from(schema.pmsConnection)
    .where(eq(schema.pmsConnection.organizationId, organizationId))
    .limit(1)
  const conn = rows[0]
  if (!conn) return null
  if (conn.status === 'not_connected') return null
  const recentRuns = await db
    .select({ status: schema.pmsSyncRun.status })
    .from(schema.pmsSyncRun)
    .where(eq(schema.pmsSyncRun.organizationId, organizationId))
    .orderBy(desc(schema.pmsSyncRun.startedAt))
    .limit(5)
  return deriveIntegrationsHealth(conn, recentRuns, now)
}

// Pure derivation — exported separately so unit tests can exercise every
// branch without spinning up a DB.
export function deriveIntegrationsHealth(
  conn: Pick<
    PmsConnection,
    'organizationId' | 'provider' | 'status' | 'autoSyncEnabled' | 'lastSyncAt' | 'lastSyncStatus' | 'lastError'
  >,
  recentRuns: { status: string }[],
  now: Date,
): IntegrationsHealth {
  let consecutiveFailures = 0
  for (const r of recentRuns) {
    if (r.status === 'error' || r.status === 'partial') consecutiveFailures++
    else break
  }
  const base = {
    organizationId: conn.organizationId,
    provider: conn.provider,
    lastSyncAt: conn.lastSyncAt,
    lastSyncStatus: (conn.lastSyncStatus as IntegrationsHealth['lastSyncStatus']) ?? null,
    lastError: conn.lastError ?? null,
    consecutiveFailures,
    staleAfterHours: STALE_AFTER_HOURS,
  }

  if (conn.status === 'error') {
    return {
      ...base,
      status: 'errored',
      severity: 'error',
      message: conn.lastError
        ? `Connection error: ${conn.lastError}`
        : 'Connection is in an error state — open Integrations to reconnect.',
    }
  }

  if (!conn.lastSyncAt) {
    return {
      ...base,
      status: 'never_synced',
      severity: 'info',
      message: 'Connected, no sync yet — run a manual sync to import your patient data.',
    }
  }

  if (consecutiveFailures >= STREAK_THRESHOLD) {
    return {
      ...base,
      status: 'repeated_failure',
      severity: 'error',
      message: `${consecutiveFailures} sync runs in a row haven't fully succeeded. Check the connection or try a manual sync.`,
    }
  }

  if (conn.lastSyncStatus === 'error') {
    return {
      ...base,
      status: 'errored',
      severity: 'error',
      message: conn.lastError ? `Last sync failed: ${conn.lastError}` : 'Last sync failed — try a manual sync.',
    }
  }

  const ageHours = (now.getTime() - conn.lastSyncAt.getTime()) / 3_600_000
  if (conn.autoSyncEnabled === 1 && ageHours > STALE_AFTER_HOURS) {
    return {
      ...base,
      status: 'stale',
      severity: 'warn',
      message: `No successful sync in the last ${Math.round(ageHours)} hours. Auto-sync runs hourly, so this usually means a connection problem — try a manual sync.`,
    }
  }

  if (conn.lastSyncStatus === 'partial') {
    return {
      ...base,
      status: 'partial',
      severity: 'warn',
      message: 'Last sync completed with skipped records. Open Integrations to see which entities were skipped.',
    }
  }

  return { ...base, status: 'ok', severity: 'info', message: 'Sync is healthy.' }
}
