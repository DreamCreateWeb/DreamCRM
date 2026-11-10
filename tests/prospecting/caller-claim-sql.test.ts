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
 * race is a miss and never a shared practice — and, since the fix pass, the
 * per-CALLER cap: the fill opens a transaction and locks the caller's own
 * row first (`SELECT … FOR UPDATE`), re-reading the count under that lock;
 * the release hook's and the sweep's predicates; the accept link's guard.
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

import {
  claimProspectForCaller,
  fillCallerQueue,
  fillCallerQueueIn,
  linkCallerUser,
  releaseStaleAssignments,
} from '@/lib/services/prospect-callers'
import { releaseIfUnservable, releaseUnservableAssignments } from '@/lib/services/prospect-caller-release'
import { getCallList, getPhoneQueue } from '@/lib/services/prospecting'
import { db } from '@/lib/db'

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

describe('fillCallerQueue — the statements Postgres receives', () => {
  const caller = { id: 'pcal_1', dailyTarget: 3, states: ['TX'], status: 'active' } as const

  it('runs inside a transaction (the proxy driver refuses one — the proof the fill opens it)', async () => {
    await expect(fillCallerQueue(caller, { now: NOW, floor: 60 })).rejects.toThrow(/transactions are not supported/i)
    expect(captured).toHaveLength(0) // nothing read or written outside the transaction
  })

  it('locks the caller row FOR UPDATE, counts what they can dial NOW, then reads the pool and claims', async () => {
    rowQueue.push([['pcal_1']]) // the lock
    rowQueue.push([[1]]) // ready now
    rowQueue.push([['p1'], ['p2']]) // candidates
    rowQueue.push([['p1']]) // claim p1
    rowQueue.push([]) // claim p2 lost
    const r = await fillCallerQueueIn(db, caller, { now: NOW, floor: 60 })
    expect(r).toEqual({ claimed: 1, ready: 2, target: 3 })

    const lock = captured[0].sql.toLowerCase()
    expect(lock).toMatch(/^select .* from "prospect_caller" where "prospect_caller"."id" = \$1 for update$/)
    expect(captured[0].params).toEqual(['pcal_1'])

    // The count is the queue's own predicate: theirs, servable, due now.
    const count = captured[1].sql.toLowerCase()
    expect(count).toContain('count(*)')
    expect(count).toContain('"prospect"."assigned_caller_id" = $')
    expect(count).toContain('"prospect"."phone" is not null')
    expect(count).toContain('"prospect"."status" in (')
    expect(count).toContain('"prospect"."intent_signal" not in (')
    expect(count).toContain('not exists (select 1 from "prospect_meeting"')
    expect(count).toContain('"prospect_meeting"."status" = $')
    expect(count).toContain('"prospect_meeting"."scheduled_at" > $')
    expect(count).toContain('"prospect"."next_follow_up_at" is null or "prospect"."next_follow_up_at" <= $')

    const pool = captured[2].sql.toLowerCase()
    expect(pool).toContain('"prospect"."assigned_caller_id" is null')
    expect(pool).toContain('"prospect"."phone" is not null')
    expect(pool).toContain('"prospect"."quality_score" >= $')
    expect(pool).toContain('"prospect"."status" in (')
    expect(pool).toContain('"prospect"."intent_signal" not in (')
    expect(pool).toContain('not exists (select 1 from "prospect_meeting"')
    expect(pool).toContain('"prospect"."next_follow_up_at" is null')
    expect(pool).toContain('"prospect"."caller_cooldown_until" <= $')
    expect(pool).toContain('"prospect"."state" in (')
    expect(pool).toContain('desc nulls last')
    expect(pool).toContain('limit $')
    expect(captured[2].params).toContain(60)
    expect(captured[2].params).toContain('TX')
    expect(captured[2].params).toContain(4) // (3 - 1) * 2

    expect(captured[3].sql.toLowerCase()).toContain('"prospect"."assigned_caller_id" is null')
    expect(captured).toHaveLength(5)
  })
})

describe('the release hook + the straggler sweep — the statement Postgres receives', () => {
  it('releaseIfUnservable: one self-checking UPDATE — this row, still assigned, NOT servable', async () => {
    rowQueue.push([['p1']])
    expect(await releaseIfUnservable('p1', NOW)).toBe(true)
    expect(captured).toHaveLength(1)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect" set /)
    expect(sql).toContain('"assigned_caller_id" = $')
    expect(captured[0].params[0]).toBeNull()
    expect(sql).toContain('"prospect"."id" = $')
    expect(sql).toContain('"prospect"."assigned_caller_id" is not null')
    expect(sql).toContain('not (')
    expect(sql).toContain('"prospect"."phone" is not null')
    expect(sql).toContain('"prospect"."phone_status" not in (')
    expect(sql).toContain('"prospect"."status" in (')
    expect(sql).toContain('"prospect"."intent_signal" not in (')
    expect(sql).toContain('not exists (select 1 from "prospect_meeting"')
    expect(sql).toContain('returning')
    expect(captured[0].params).toContain('p1')
    expect(captured[0].params).toContain('booked')
  })

  it('releaseIfUnservable is best-effort: a thrown statement is a false, never a throw', async () => {
    const bad = { ...captured } // keep a reference; the proxy below throws
    void bad
    const { db: proxied } = await import('@/lib/db')
    const orig = (proxied as unknown as { update: unknown }).update
    ;(proxied as unknown as { update: unknown }).update = () => {
      throw new Error('connection reset')
    }
    try {
      expect(await releaseIfUnservable('p1', NOW)).toBe(false)
    } finally {
      ;(proxied as unknown as { update: unknown }).update = orig
    }
  })

  it('releaseUnservableAssignments: every assigned row that fails the servable test, in one statement', async () => {
    rowQueue.push([['p1'], ['p2']])
    expect(await releaseUnservableAssignments(NOW)).toBe(2)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect" set /)
    expect(sql).not.toContain('"prospect"."id" = $')
    expect(sql).toContain('"prospect"."assigned_caller_id" is not null')
    expect(sql).toContain('not (')
    expect(sql).toContain('not exists (select 1 from "prospect_meeting"')
    expect(sql).toContain('returning')
  })
})

describe('linkCallerUser — the accept’s UPDATE re-checks token, status and clock', () => {
  it('links only the row whose token still matches, whose status is invited/active, whose clock has not run out', async () => {
    rowQueue.push([['pcal_1']])
    expect(await linkCallerUser('pcal_1', 'u1', 'tok_abc')).toBe(true)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect_caller" set /)
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"status" = $')
    expect(sql).toContain('"invite_token" = $')
    expect(sql).toContain('"prospect_caller"."id" = $')
    expect(sql).toContain('"prospect_caller"."invite_token" = $')
    expect(sql).toContain('"prospect_caller"."status" in ($')
    expect(sql).toContain('"prospect_caller"."invite_expires_at" > $')
    expect(sql).toContain('returning')
    expect(captured[0].params).toContain('tok_abc')
    expect(captured[0].params).toContain('invited')
    expect(captured[0].params).toContain('active')
    expect(captured[0].params).not.toContain('archived')
  })

  it('a miss (archived, rotated, expired) is false — never a re-activation', async () => {
    rowQueue.push([])
    expect(await linkCallerUser('pcal_1', 'u1', 'tok_old')).toBe(false)
  })
})

describe('releaseStaleAssignments — the 7-day sweep', () => {
  it('releases held rows with no call in seven days, no callback live, no demo ahead — with a cooldown', async () => {
    rowQueue.push([['p9']])
    expect(await releaseStaleAssignments(NOW)).toBe(1)
    const sql = captured[0].sql.toLowerCase()
    expect(sql).toMatch(/^update "prospect" set /)
    expect(sql).toContain('"assigned_caller_id" = $')
    expect(captured[0].params[0]).toBeNull()
    expect(sql).toContain('"caller_cooldown_until" = $')
    expect(sql).toContain('"prospect"."assigned_caller_id" is not null')
    expect(sql).toContain('"prospect"."assigned_at" <= $')
    expect(sql).toContain('"prospect"."next_follow_up_at" is null or "prospect"."next_follow_up_at" <= $')
    expect(sql).toContain('not exists (select 1 from "prospect_call_log"')
    expect(sql).toContain('"prospect_call_log"."prospect_id" = "prospect"."id"')
    expect(sql).toContain('"prospect_call_log"."created_at" >= $')
    expect(sql).toContain('not exists (select 1 from "prospect_meeting"')
    expect(sql).toContain('"prospect_meeting"."scheduled_at" > $')
    expect(sql).toContain('returning')
    const instants = captured[0].params
      .map((p) => (p instanceof Date ? p.getTime() : typeof p === 'string' ? Date.parse(p) : NaN))
      .filter((t) => !Number.isNaN(t))
    const cutoff = NOW.getTime() - 7 * 24 * 3600 * 1000
    // The cutoff rides as a bound parameter for assigned_at, the call-log
    // window AND the callback clause (a callback due within the week is
    // live) — three times; `now` only for the demo-ahead clause.
    expect(instants.filter((t) => t === cutoff)).toHaveLength(3)
    // The release cooldown: three days ahead.
    expect(instants).toContain(NOW.getTime() + 3 * 24 * 3600 * 1000)
  })
})

describe('the owner’s hand-raiser list, rendered', () => {
  it('does NOT hide a practice a caller holds — the hand went up, the owner sees it', async () => {
    rowQueue.push([])
    await getCallList()
    expect(captured[0].sql.toLowerCase()).not.toContain('assigned_caller_id" is null')
  })
})

describe('the owner’s phone-first queue, rendered', () => {
  it('reads assigned_caller_id IS NULL — a caller’s practice is never the owner’s dial target', async () => {
    rowQueue.push([])
    await getPhoneQueue(100, { floor: 60 })
    expect(captured[0].sql.toLowerCase()).toContain('"prospect"."assigned_caller_id" is null')
  })
})
