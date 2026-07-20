/**
 * listOpenFollowups — the completedBy ("closed by me") filter.
 *
 * The honest target for My Day's "You closed N this week" link must count the
 * SAME rows as getMyClosedFollowupsPerWeek8: status='done' AND completedBy =
 * the signed-in user, org-scoped. Pins:
 *   1. SCOPING — the where clause carries organizationId AND completedBy
 *      (ORG_A/ORG_B + USER_A/USER_B pattern, per
 *      tests/tenant-scoping/my-day-closed-per-week.test.ts — a personal view,
 *      so user scoping is as non-negotiable as org scoping), and forces
 *      status='done' (never the open-only default).
 *   2. ORDERING — most recently completed first (completedAt desc), not the
 *      open-work due-date ordering.
 *   3. The default (no completedBy) path is untouched: open-only + the
 *      coalesced due-date ordering.
 *
 * Uses REAL drizzle-orm + the real schema (only @/lib/db is mocked) so the
 * captured clauses are the genuine eq(...) fragments — same harness as
 * tests/followups/followups-completed-per-week.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as string[],
  orders: [] as string[],
  rows: [] as unknown[],
}

// Walk a drizzle clause tree and collect every literal/param/name value so we
// can grep for org/user ids + column names (same technique as tenant-scoping).
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
  // listOpenFollowups chains select→from→innerJoin→leftJoin→where→orderBy→limit.
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: (clause: unknown) => {
      state.wheres.push(captureSql(clause))
      return chain
    },
    orderBy: (...clauses: unknown[]) => {
      state.orders.push(captureSql(clauses))
      return chain
    },
    limit: async () => state.rows,
  }
  return { db: { select: () => chain }, schema }
})

vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { listOpenFollowups } from '@/lib/services/patient-followups'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'
const USER_A = 'user_a_front_desk'
const USER_B = 'user_b_office_mgr'

beforeEach(() => {
  state.wheres = []
  state.orders = []
  state.rows = []
})

describe('listOpenFollowups — completedBy ("closed by me")', () => {
  it('scopes to the calling org AND completing user, and forces status=done (ORG_A/ORG_B + USER_A/USER_B)', async () => {
    await listOpenFollowups(ORG_A, { completedBy: USER_A })
    await listOpenFollowups(ORG_B, { completedBy: USER_B })
    expect(state.wheres).toHaveLength(2)
    // Org scoping — each call carries its own org id, never the other's.
    expect(state.wheres[0]).toContain(ORG_A)
    expect(state.wheres[0]).not.toContain(ORG_B)
    expect(state.wheres[1]).toContain(ORG_B)
    expect(state.wheres[1]).not.toContain(ORG_A)
    // User scoping — a personal view never shows a teammate's closes.
    expect(state.wheres[0]).toContain(USER_A)
    expect(state.wheres[0]).not.toContain(USER_B)
    expect(state.wheres[1]).toContain(USER_B)
    expect(state.wheres[1]).not.toContain(USER_A)
    // Done-only — the exact status the heartbeat counts. ('done' appears in
    // the capture ONLY as a bound value — the default-path test below shows
    // it's absent there — so this pins eq(status,'done'). The literal 'open'
    // can't be asserted against: it rides every capture via the status
    // column's default('open') metadata.)
    expect(state.wheres[0]).toContain('done')
  })

  it('orders by completedAt desc (a "what I finished" log), not the due-date open-work ordering', async () => {
    await listOpenFollowups(ORG_A, { completedBy: USER_A })
    expect(state.orders).toHaveLength(1)
    expect(state.orders[0]).toContain('completed_at')
    // The coalesce due-date sentinel is the open-work ordering's fingerprint.
    expect(state.orders[0]).not.toContain('9999-12-31')
  })

  it('leaves the default path untouched: open-only + due-date ordering', async () => {
    await listOpenFollowups(ORG_A, {})
    expect(state.wheres[0]).toContain('open')
    expect(state.wheres[0]).not.toContain('done')
    expect(state.orders[0]).toContain('9999-12-31')
  })
})
