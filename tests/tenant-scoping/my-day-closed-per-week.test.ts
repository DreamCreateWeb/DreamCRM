/**
 * getMyClosedFollowupsPerWeek8 — My Day's personal heartbeat series (law 7).
 *
 * Pins the three things that matter:
 *   1. SCOPING — the single SELECT filters by organizationId AND completedBy
 *      (ORG_A/ORG_B + USER_A/USER_B pattern: each call carries its own org
 *      AND user id and never the other's — this is a PERSONAL series, so
 *      user scoping is as non-negotiable as org scoping).
 *   2. CLINIC-LOCAL week bucketing — the server runs UTC; a Saturday-night
 *      Chicago close whose UTC instant is already Sunday must stay in the
 *      week that just ended, not jump into the new one (clinicWeekStart,
 *      never naive UTC week math).
 *   3. Shape — 8 buckets, oldest first, 'Jun 7'-style Sunday labels,
 *      zero-filled.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured where-clause is the genuine eq(...) fragments. Same harness as
 * tests/tenant-scoping/messages-per-day.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = {
  wheres: [] as string[],
  rows: [] as Array<{ completedAt: Date | null }>,
}

// Walk a drizzle clause tree and collect every literal/param value so we can
// grep for the org/user ids (same technique as the other tenant-scoping tests).
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

import { getMyClosedFollowupsPerWeek8 } from '@/lib/services/my-day'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'
const USER_A = 'user_a_front_desk'
const USER_B = 'user_b_office_mgr'

beforeEach(() => {
  state.wheres = []
  state.rows = []
  vi.useFakeTimers()
  // 2026-07-19T12:00:00Z = Sunday Jul 19, 7:00 AM in Chicago (CDT, UTC-5).
  // Clinic-local week starts (Sundays): May 31 … Jul 19, so the 8-week
  // window opens at May 31 local midnight = 2026-05-31T05:00:00Z.
  vi.setSystemTime(new Date('2026-07-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getMyClosedFollowupsPerWeek8', () => {
  it('returns 8 zero-filled clinic-local week buckets, oldest first, Sunday-labeled', async () => {
    const points = await getMyClosedFollowupsPerWeek8(ORG_A, USER_A)
    expect(points).toHaveLength(8)
    expect(points[0]).toEqual({ bucket: 'May 31', value: 0 })
    expect(points[7]).toEqual({ bucket: 'Jul 19', value: 0 })
    expect(points.map((p) => p.bucket)).toEqual([
      'May 31', 'Jun 7', 'Jun 14', 'Jun 21', 'Jun 28', 'Jul 5', 'Jul 12', 'Jul 19',
    ])
  })

  it('buckets by the CLINIC-local week, not the UTC week', async () => {
    state.rows = [
      // 01:00Z on Sunday Jul 19 is 8:00 PM SATURDAY Jul 18 in Chicago — UTC
      // says the new week already started; the clinic says it hasn't. Must
      // land in the Jul 12 week, not Jul 19.
      { completedAt: new Date('2026-07-19T01:00:00Z') },
      // 1:00 PM UTC Sunday = 8:00 AM Chicago Sunday — plainly this week.
      { completedAt: new Date('2026-07-19T13:00:00Z') },
      // Exactly the window's opening boundary (May 31 local midnight = 05:00Z).
      { completedAt: new Date('2026-05-31T05:00:00Z') },
      // One minute BEFORE the window (May 30 11:59 PM Chicago) — dropped even
      // if the DB range scan were to hand it back.
      { completedAt: new Date('2026-05-31T04:59:00Z') },
      // Defensive: a null completedAt row never counts.
      { completedAt: null },
    ]
    const points = await getMyClosedFollowupsPerWeek8(ORG_A, USER_A)
    const byBucket = Object.fromEntries(points.map((p) => [p.bucket, p.value]))
    expect(byBucket['Jul 12']).toBe(1)
    expect(byBucket['Jul 19']).toBe(1)
    expect(byBucket['May 31']).toBe(1)
    // Total accounts for exactly the 3 in-window rows.
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(3)
  })

  it('scopes the query to the calling org AND user (ORG_A/ORG_B + USER_A/USER_B)', async () => {
    await getMyClosedFollowupsPerWeek8(ORG_A, USER_A)
    await getMyClosedFollowupsPerWeek8(ORG_B, USER_B)
    expect(state.wheres).toHaveLength(2)
    // Org scoping — each call carries its own org id, never the other's.
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.wheres[1]).toContain(ORG_B)
    expect(state.wheres[1]).not.toContain(ORG_A)
    // User scoping — the personal series never leaks a teammate's closes.
    expect(state.wheres[0]).toContain(USER_A)
    expect(state.wheres[0]).not.toContain(USER_B)
    expect(state.wheres[1]).toContain(USER_B)
    expect(state.wheres[1]).not.toContain(USER_A)
    // And only DONE follow-ups count.
    expect(state.wheres[0]).toContain('done')
  })
})
