/**
 * getFollowupsCompletedPerWeek8 — the /followups board's heartbeat series
 * (law 7). Completion is the win the board exists for, so the trend counts
 * work DONE, not backlog.
 *
 * Pins the four things that matter (mirrors
 * tests/patients/new-patients-per-week.test.ts):
 *   1. TENANT SCOPING — the single SELECT filters by organizationId
 *      (ORG_A / ORG_B pattern: each org's call carries its own id and
 *      never the other's), and only status='done' rows count in SQL.
 *   2. CLINIC-LOCAL week bucketing — the server runs UTC; a Saturday-night
 *      Chicago tick-off whose UTC date is already Sunday must stay in the
 *      clinic's CURRENT week, not jump to the next (clinicWeekStart, never
 *      naive weeks).
 *   3. COMPLETION SEMANTICS — buckets by completedAt (the timestamp
 *      completeFollowup stamps and reopenFollowup clears), never
 *      updatedAt/createdAt; a null completedAt row never counts.
 *   4. Shape — 8 buckets, oldest first, 'May 31'-style Sunday labels,
 *      zero-filled.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(organizationId, …) fragment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = {
  wheres: [] as string[],
  rows: [] as Array<{ completedAt: Date | null }>,
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

import { getFollowupsCompletedPerWeek8 } from '@/lib/services/patient-followups'

beforeEach(() => {
  state.wheres = []
  state.rows = []
  vi.useFakeTimers()
  // 2026-07-19T12:00:00Z = 7:00 AM Sunday Jul 19 in Chicago (CDT, UTC-5) →
  // the current clinic-local week starts Jul 19; the 8-week window's oldest
  // Sunday is May 31.
  vi.setSystemTime(new Date('2026-07-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getFollowupsCompletedPerWeek8', () => {
  it('returns 8 zero-filled clinic-local week buckets, oldest first, labeled by Sunday like "May 31"', async () => {
    const points = await getFollowupsCompletedPerWeek8('org_a')
    expect(points).toHaveLength(8)
    expect(points[0]).toEqual({ bucket: 'May 31', value: 0 })
    expect(points[7]).toEqual({ bucket: 'Jul 19', value: 0 })
    // Every boundary is a distinct Sunday — no duplicates.
    expect(new Set(points.map((p) => p.bucket)).size).toBe(8)
  })

  it('buckets by the CLINIC-local week, not the UTC server week', async () => {
    state.rows = [
      // 03:00Z on Sunday Jul 19 is 10:00 PM SATURDAY Jul 18 in Chicago — UTC
      // says the new week already started; the clinic says it hasn't. Must
      // land in the Jul 12 week.
      { completedAt: new Date('2026-07-19T03:00:00Z') },
      // 1:00 PM UTC Sunday = 8:00 AM Chicago, plainly the Jul 19 week.
      { completedAt: new Date('2026-07-19T13:00:00Z') },
      // Exactly the window's opening boundary (May 31 local midnight = 05:00Z).
      { completedAt: new Date('2026-05-31T05:00:00Z') },
      // One minute BEFORE the window — dropped even if the DB range scan
      // were to hand it back.
      { completedAt: new Date('2026-05-31T04:59:00Z') },
    ]
    const points = await getFollowupsCompletedPerWeek8('org_a')
    const byBucket = Object.fromEntries(points.map((p) => [p.bucket, p.value]))
    expect(byBucket['Jul 12']).toBe(1)
    expect(byBucket['Jul 19']).toBe(1)
    expect(byBucket['May 31']).toBe(1)
    // Total accounts for exactly the 3 in-window rows.
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(3)
  })

  it('never counts a row without a completedAt (SQL filters it; the JS guard holds regardless)', async () => {
    state.rows = [
      { completedAt: new Date('2026-07-15T13:00:00Z') },
      { completedAt: null },
    ]
    const points = await getFollowupsCompletedPerWeek8('org_a')
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(1)
    expect(points.find((p) => p.bucket === 'Jul 12')?.value).toBe(1)
  })

  it('scopes the query to the calling org (ORG_A / ORG_B) and counts only done follow-ups', async () => {
    await getFollowupsCompletedPerWeek8('org_a')
    await getFollowupsCompletedPerWeek8('org_b')
    expect(state.wheres).toHaveLength(2)
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).not.toContain('org_b')
    expect(state.wheres[1]).toContain('org_b')
    expect(state.wheres[1]).not.toContain('org_a')
    // The done-status filter rides the same where clause.
    expect(state.wheres[0]).toContain('done')
  })
})
