/**
 * getLeadsPerDay14 — the Leads page's heartbeat series (law 7).
 *
 * Pins the three things that matter:
 *   1. TENANT SCOPING — the single SELECT filters by organizationId
 *      (ORG_A / ORG_B pattern: each org's call carries its own id and
 *      never the other's).
 *   2. CLINIC-LOCAL day bucketing — the server runs UTC; a 10 PM Chicago
 *      lead whose UTC date is already "tomorrow" must land in the clinic's
 *      TODAY bucket (clinicDayStart, not startOfDay).
 *   3. Shape — 14 buckets, oldest first, 'Jul 5'-style labels, zero-filled.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(organizationId, …) fragment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = {
  wheres: [] as string[],
  rows: [] as Array<{ createdAt: Date }>,
}

// Walk a drizzle clause tree and collect every literal/param value so we can
// grep for the org id (same technique as tests/tenant-scoping).
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
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async (clause: unknown) => {
            state.wheres.push(captureSql(clause))
            return state.rows
          },
        }),
      }),
    },
    schema,
  }
})

// Pin the clinic tz so the local-vs-UTC assertion is deterministic.
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { getLeadsPerDay14 } from '@/lib/services/leads'

beforeEach(() => {
  state.wheres = []
  state.rows = []
  vi.useFakeTimers()
  // 2026-07-19T12:00:00Z = 7:00 AM in Chicago (CDT, UTC-5) → clinic-local
  // "today" is Jul 19; the 14-day window is Jul 6 … Jul 19.
  vi.setSystemTime(new Date('2026-07-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getLeadsPerDay14', () => {
  it('returns 14 zero-filled clinic-local day buckets, oldest first, labeled like "Jul 5"', async () => {
    const points = await getLeadsPerDay14('org_a')
    expect(points).toHaveLength(14)
    expect(points[0]).toEqual({ bucket: 'Jul 6', value: 0 })
    expect(points[13]).toEqual({ bucket: 'Jul 19', value: 0 })
    // No zero-padded days, no duplicates.
    expect(new Set(points.map((p) => p.bucket)).size).toBe(14)
  })

  it('buckets by the CLINIC-local day, not the UTC server day', async () => {
    state.rows = [
      // 03:00Z on Jul 19 is 10:00 PM Jul 18 in Chicago — UTC says "Jul 19",
      // the clinic says "Jul 18". Must land in Jul 18.
      { createdAt: new Date('2026-07-19T03:00:00Z') },
      // 1:00 PM UTC = 8:00 AM Chicago, plainly today.
      { createdAt: new Date('2026-07-19T13:00:00Z') },
      // Exactly the window's opening boundary (Jul 6 local midnight = 05:00Z).
      { createdAt: new Date('2026-07-06T05:00:00Z') },
      // One minute BEFORE the window (Jul 5 11:59 PM Chicago) — dropped even
      // if the DB range scan were to hand it back.
      { createdAt: new Date('2026-07-06T04:59:00Z') },
    ]
    const points = await getLeadsPerDay14('org_a')
    const byBucket = Object.fromEntries(points.map((p) => [p.bucket, p.value]))
    expect(byBucket['Jul 18']).toBe(1)
    expect(byBucket['Jul 19']).toBe(1)
    expect(byBucket['Jul 6']).toBe(1)
    // Total accounts for exactly the 3 in-window rows.
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(3)
  })

  it('scopes the query to the calling org (ORG_A / ORG_B)', async () => {
    await getLeadsPerDay14('org_a')
    await getLeadsPerDay14('org_b')
    expect(state.wheres).toHaveLength(2)
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).not.toContain('org_b')
    expect(state.wheres[1]).toContain('org_b')
    expect(state.wheres[1]).not.toContain('org_a')
  })
})
