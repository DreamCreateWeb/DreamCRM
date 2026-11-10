import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER CLAIM, RENDERED FOR REAL (P-02).
 *
 * The sibling test models the claim in JavaScript — the right way to assert
 * the orchestration, and blind to what Postgres receives. This one runs the
 * service against drizzle's pg-proxy driver: the real dialect, the real
 * schema, the real SQL, no database. It pins the one property the whole
 * no-double-dialing guarantee hangs on: the claim's predicate reads
 * `assigned_caller_id IS NULL` and the statement RETURNS the row, so a lost
 * race is a miss and never a shared practice.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
/** Rows (POSITIONAL arrays — the pg-proxy contract) each statement resolves with, FIFO. */
const rowQueue: unknown[][][] = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: (rowQueue.shift() ?? []) as never }
    },
    { schema },
  )
  return { db, schema }
})
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}), authEmailShell: vi.fn(() => ''), escapeHtml: (s: string) => s }))

import { claimProspectForCaller, fillCallerQueue, releaseStaleAssignments } from '@/lib/services/prospect-callers'
import { getPhoneQueue } from '@/lib/services/prospecting'

const NOW = new Date('2026-11-10T15:00:00Z')

beforeEach(() => {
  captured.length = 0
  rowQueue.length = 0
})

describe('claimProspectForCaller — the statement Postgres receives', () => {
  it('is ONE update predicated on the row being unassigned, returning the row', async () => {
    rowQueue.push([['p1']])
    expect(await claimProspectForCaller('p1', 'pcal_1', NOW)).toBe(true)
    expect(captured).toHaveLength(1)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect" set /)
    expect(sql).toContain('"assigned_caller_id" = $')
    expect(sql).toContain('"assigned_at" = $')
    expect(sql).toContain('"prospect"."id" = $')
    expect(sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(sql).toContain('returning')
    expect(captured[0].params).toContain('pcal_1')
    expect(captured[0].params).toContain('p1')
  })

  it('a lost race (no row returned) reads as a miss', async () => {
    rowQueue.push([])
    expect(await claimProspectForCaller('p1', 'pcal_1', NOW)).toBe(false)
  })
})

describe('fillCallerQueue — the pool read as Postgres parses it', () => {
  it('floors on quality, skips the assigned, the hand-raisers, the owner’s follow-ups and the cooling', async () => {
    rowQueue.push([[1]]) // holding
    rowQueue.push([['p1'], ['p2']]) // candidates
    rowQueue.push([['p1']]) // claim p1
    rowQueue.push([]) // claim p2 lost
    const r = await fillCallerQueue({ id: 'pcal_1', dailyTarget: 3, states: ['TX'], status: 'active' }, { now: NOW, floor: 60 })
    expect(r.claimed).toBe(1)
    const pool = captured[1].sql.toLowerCase()
    expect(pool).toContain('"prospect"."assigned_caller_id" is null')
    expect(pool).toContain('"prospect"."phone" is not null')
    expect(pool).toContain('"prospect"."quality_score" >= $')
    expect(pool).toContain('"prospect"."status" in (')
    expect(pool).toContain('"prospect"."intent_signal" not in (')
    expect(pool).toContain('"prospect"."next_follow_up_at" is null')
    expect(pool).toContain('"prospect"."caller_cooldown_until" <= $')
    expect(pool).toContain('"prospect"."state" in (')
    expect(pool).toContain('desc nulls last')
    expect(pool).toContain('limit $')
    expect(captured[1].params).toContain(60)
    expect(captured[1].params).toContain('TX')
    expect(captured[1].params).toContain(4) // (3 - 1) * 2
  })
})

describe('releaseStaleAssignments — the 7-day sweep', () => {
  it('releases held rows with no call in seven days and no callback still ahead', async () => {
    rowQueue.push([['p9']])
    expect(await releaseStaleAssignments(NOW)).toBe(1)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect" set /)
    expect(sql).toContain('"assigned_caller_id" = $')
    expect(captured[0].params[0]).toBeNull()
    expect(sql).toContain('"prospect"."assigned_caller_id" is not null')
    expect(sql).toContain('"prospect"."assigned_at" <= $')
    expect(sql).toContain('"prospect"."next_follow_up_at" is null or "prospect"."next_follow_up_at" <= $')
    expect(sql).toContain('not exists (select 1 from "prospect_call_log"')
    expect(sql).toContain('"prospect_call_log"."prospect_id" = "prospect"."id"')
    expect(sql).toContain('"prospect_call_log"."created_at" >= $')
    expect(sql).toContain('returning')
    // The cutoff rides as a bound parameter: seven days before now.
    const instants = captured[0].params
      .map((p) => (p instanceof Date ? p.getTime() : typeof p === 'string' ? Date.parse(p) : NaN))
      .filter((t) => !Number.isNaN(t))
    expect(instants).toContain(NOW.getTime() - 7 * 24 * 3600 * 1000)
  })
})

describe('the owner’s phone-first queue, rendered', () => {
  it('reads assigned_caller_id IS NULL — a caller’s practice is never the owner’s dial target', async () => {
    rowQueue.push([])
    await getPhoneQueue(100, { floor: 60 })
    expect(captured[0].sql.toLowerCase()).toContain('"prospect"."assigned_caller_id" is null')
  })
})
