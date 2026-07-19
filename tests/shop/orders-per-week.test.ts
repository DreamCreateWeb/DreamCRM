import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getOrdersPerWeek8 — the Shop hub's heartbeat sparkline series (v3 law 7),
 * the Payments hub's getCollectedPerWeek8 pattern exactly. Pinned here:
 *   1. ORG SCOPING — the query filters by organizationId (ORG_A sees its
 *      orders, never ORG_B's). The db mock filters rows by whichever org id
 *      literal appears in the WHERE clause (the tenant-scoping captureSql
 *      pattern), so a missing filter would leak ORG_B's row into the series.
 *   2. CLINIC-LOCAL WEEKS — the server runs UTC; buckets must use
 *      clinicWeekStart against the clinic tz. A Saturday-9pm Central order
 *      is already Sunday in UTC — it must land in the PREVIOUS clinic-local
 *      week, not the new one.
 *   3. PAID ONLY — the hub's order numbers count paid orders; pending /
 *      cancelled checkouts never inflate the trend.
 */

interface Row {
  organizationId: string
  status: string
  createdAt: Date | null
}

const state: { rows: Row[]; wheres: Array<{ sql: string; params: unknown[] }> } = { rows: [], wheres: [] }

/** Flatten a real drizzle SQL clause into a greppable string + the bound
 *  query params (the tenant-scoping captureSql technique, sharpened: drizzle
 *  `Param` objects carry `value` + `encoder`, so params exclude schema noise
 *  like column names and column DEFAULTs — 'cancelled_at' / default
 *  'pending' must not read as a status filter). */
function captureSql(clause: unknown): { sql: string; params: unknown[] } {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const params: unknown[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) {
      parts.push(String(obj.value))
      if ('encoder' in obj) params.push(obj.value)
    }
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return { sql: parts.join('|'), params }
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const o: {
      from: () => typeof o
      where: (clause: unknown) => typeof o
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => void
      _rows: Row[]
    } = {
      _rows: [],
      from: () => o,
      where: (clause: unknown) => {
        const captured = captureSql(clause)
        state.wheres.push(captured)
        // Row-level tenancy: only rows whose org id was BOUND as a query
        // param come back — no org filter, everything leaks. Same for the
        // status filter: a row's status must be a bound param ('paid'),
        // so pending/cancelled rows only return if the query forgot the
        // status clause.
        o._rows = state.rows.filter(
          (r) => captured.params.includes(r.organizationId) && captured.params.includes(r.status),
        )
        return o
      },
      then: (resolve, reject) => Promise.resolve(o._rows).then(resolve, reject),
    }
    return o
  }
  return { db: { select: () => chain() }, schema }
})
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { getOrdersPerWeek8 } from '@/lib/services/shop'

// Wed Jan 7 2026, noon UTC. Chicago is CST (UTC-6, no DST games) — the
// clinic-local week containing "now" starts Sunday Jan 4 00:00 CST
// (= 2026-01-04T06:00:00Z).
const NOW = new Date('2026-01-07T12:00:00.000Z')

beforeEach(() => {
  state.rows = []
  state.wheres = []
})

describe('getOrdersPerWeek8', () => {
  it('returns 8 clinic-local weeks, oldest first, labeled by week-start date', async () => {
    const series = await getOrdersPerWeek8('org_a', NOW)
    expect(series).toHaveLength(8)
    expect(series.map((p) => p.bucket)).toEqual([
      'Nov 16', 'Nov 23', 'Nov 30', 'Dec 7', 'Dec 14', 'Dec 21', 'Dec 28', 'Jan 4',
    ])
    expect(series.every((p) => p.value === 0)).toBe(true)
  })

  it('is org-scoped: ORG_A sees its orders, never ORG_B’s', async () => {
    state.rows = [
      { organizationId: 'org_a', status: 'paid', createdAt: new Date('2026-01-05T15:00:00.000Z') },
      { organizationId: 'org_b', status: 'paid', createdAt: new Date('2026-01-05T15:00:00.000Z') },
      { organizationId: 'org_b', status: 'paid', createdAt: new Date('2026-01-06T15:00:00.000Z') },
    ]
    const a = await getOrdersPerWeek8('org_a', NOW)
    expect(a.reduce((s, p) => s + p.value, 0)).toBe(1)
    // And the WHERE clause itself carried the org id as a bound param.
    expect(state.wheres.some((w) => w.params.includes('org_a'))).toBe(true)

    const b = await getOrdersPerWeek8('org_b', NOW)
    expect(b.reduce((s, p) => s + p.value, 0)).toBe(2)
  })

  it('counts PAID orders only — the WHERE clause carries the paid status filter', async () => {
    state.rows = [
      { organizationId: 'org_a', status: 'paid', createdAt: new Date('2026-01-05T15:00:00.000Z') },
      { organizationId: 'org_a', status: 'pending', createdAt: new Date('2026-01-05T15:00:00.000Z') },
      { organizationId: 'org_a', status: 'cancelled', createdAt: new Date('2026-01-05T15:00:00.000Z') },
    ]
    const series = await getOrdersPerWeek8('org_a', NOW)
    expect(series.reduce((s, p) => s + p.value, 0)).toBe(1)
    const lastWhere = state.wheres[state.wheres.length - 1]
    expect(lastWhere.params).toContain('paid')
    expect(lastWhere.params).not.toContain('pending')
  })

  it('buckets a UTC-Sunday / clinic-Saturday order into the PREVIOUS clinic-local week', async () => {
    state.rows = [
      // 2026-01-04T02:00Z = Sat Jan 3, 8:00 PM in Chicago — the new week in
      // UTC, still LAST week clinic-locally. startOfWeek(new Date()) would
      // misfile this into "Jan 4".
      { organizationId: 'org_a', status: 'paid', createdAt: new Date('2026-01-04T02:00:00.000Z') },
      // Exactly the clinic-local week boundary (Sun Jan 4 00:00 CST) —
      // inclusive start of the new week.
      { organizationId: 'org_a', status: 'paid', createdAt: new Date('2026-01-04T06:00:00.000Z') },
      { organizationId: 'org_a', status: 'paid', createdAt: new Date('2026-01-06T18:00:00.000Z') },
    ]
    const series = await getOrdersPerWeek8('org_a', NOW)
    const byBucket = Object.fromEntries(series.map((p) => [p.bucket, p.value]))
    expect(byBucket['Dec 28']).toBe(1) // the Saturday-night order stayed put
    expect(byBucket['Jan 4']).toBe(2)
  })
})
