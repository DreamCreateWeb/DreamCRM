import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getCollectedPerWeek8 — the Payments hub heartbeat sparkline series (v3 law 7).
 * Two things are non-negotiable and pinned here:
 *   1. ORG SCOPING — the query filters by organizationId (ORG_A sees its
 *      dollars, never ORG_B's). The db mock filters rows by whichever org id
 *      literal appears in the WHERE clause (the tenant-scoping captureSql
 *      pattern), so a missing filter would leak ORG_B's row into the series.
 *   2. CLINIC-LOCAL WEEKS — the server runs UTC; buckets must use
 *      clinicWeekStart against the clinic tz. A Saturday-9pm Central payment
 *      is already Sunday in UTC — it must land in the PREVIOUS clinic-local
 *      week, not the new one.
 */

interface Row {
  organizationId: string
  status: string
  amountCents: number
  paidAt: Date | null
}

const state: { rows: Row[]; wheres: string[] } = { rows: [], wheres: [] }

/** Flatten a real drizzle SQL clause into a greppable string (same technique
 *  as tests/tenant-scoping/ecommerce-services.test.ts). */
function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
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
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
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
        const sql = captureSql(clause)
        state.wheres.push(sql)
        // Row-level tenancy: only rows whose org id literal appears in the
        // WHERE clause come back — no org filter, everything leaks.
        o._rows = state.rows.filter((r) => sql.includes(r.organizationId))
        return o
      },
      then: (resolve, reject) => Promise.resolve(o._rows).then(resolve, reject),
    }
    return o
  }
  return { db: { select: () => chain() }, schema }
})
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { getCollectedPerWeek8 } from '@/lib/services/balance-payments'

// Wed Jan 7 2026, noon UTC. Chicago is CST (UTC-6, no DST games) — the
// clinic-local week containing "now" starts Sunday Jan 4 00:00 CST
// (= 2026-01-04T06:00:00Z).
const NOW = new Date('2026-01-07T12:00:00.000Z')

beforeEach(() => {
  state.rows = []
  state.wheres = []
})

describe('getCollectedPerWeek8', () => {
  it('returns 8 clinic-local weeks, oldest first, labeled by week-start date', async () => {
    const series = await getCollectedPerWeek8('org_a', NOW)
    expect(series).toHaveLength(8)
    expect(series.map((p) => p.bucket)).toEqual([
      'Nov 16', 'Nov 23', 'Nov 30', 'Dec 7', 'Dec 14', 'Dec 21', 'Dec 28', 'Jan 4',
    ])
    expect(series.every((p) => p.value === 0)).toBe(true)
  })

  it('is org-scoped: ORG_A sees its dollars, never ORG_B’s', async () => {
    state.rows = [
      { organizationId: 'org_a', status: 'paid', amountCents: 10000, paidAt: new Date('2026-01-05T15:00:00.000Z') },
      { organizationId: 'org_b', status: 'paid', amountCents: 99900, paidAt: new Date('2026-01-05T15:00:00.000Z') },
    ]
    const a = await getCollectedPerWeek8('org_a', NOW)
    const totalA = a.reduce((s, p) => s + p.value, 0)
    expect(totalA).toBe(100)
    expect(a.some((p) => p.value === 999)).toBe(false)
    // And the WHERE clause itself carried the org id.
    expect(state.wheres.some((w) => w.includes('org_a'))).toBe(true)

    const b = await getCollectedPerWeek8('org_b', NOW)
    expect(b.reduce((s, p) => s + p.value, 0)).toBe(999)
  })

  it('buckets a UTC-Sunday / clinic-Saturday payment into the PREVIOUS clinic-local week', async () => {
    state.rows = [
      // 2026-01-04T02:00Z = Sat Jan 3, 8:00 PM in Chicago — the new week in
      // UTC, still LAST week clinic-locally. startOfWeek(new Date()) would
      // misfile this into "Jan 4".
      { organizationId: 'org_a', status: 'paid', amountCents: 10000, paidAt: new Date('2026-01-04T02:00:00.000Z') },
      // Exactly the clinic-local week boundary (Sun Jan 4 00:00 CST) —
      // inclusive start of the new week.
      { organizationId: 'org_a', status: 'paid', amountCents: 2500, paidAt: new Date('2026-01-04T06:00:00.000Z') },
    ]
    const series = await getCollectedPerWeek8('org_a', NOW)
    const byBucket = Object.fromEntries(series.map((p) => [p.bucket, p.value]))
    expect(byBucket['Dec 28']).toBe(100) // the Saturday-night payment stayed put
    expect(byBucket['Jan 4']).toBe(25)
  })
})
