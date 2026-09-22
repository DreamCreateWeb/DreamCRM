import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * A DIRECTION FLIP REPORTS WHAT IT STRANDED (DREAMCRM-97, deliverable 2).
 *
 * `setSyncDirection` was a bare UPDATE. `syncPms` gates the write-back flush on
 * `syncDirection === 'two_way'` and that is its ONLY call site, so pressing
 * "Import only" with bookings already queued parks them permanently — neither
 * the hourly cron nor "Sync now" will drive them again — and nothing said a
 * word. The practice most likely to press that button is one whose bridge is
 * down, which is exactly the practice with a queue.
 *
 * Scope is the WARNING path only, per the DREAMCRM-96 meeting: no drain, no
 * resolution surface. So what is under test is the honesty of the numbers.
 *
 * Two kinds of assertion below, and the second is the one that matters:
 *
 *  - the RESULT — two counts and an age come back, and flipping write-back ON
 *    reports nothing stranded. These fail against the pre-fix `Promise<void>`.
 *  - the PREDICATES, rendered through drizzle's real dialect. The stranded
 *    count is only worth showing if it means "what the flush would have
 *    drained": every clause mirrors `retryPendingWrites`, and dropping any one
 *    of them produces a specific lie. Widen the status pair and a
 *    terminally-failed op (undrainable whatever the direction says) gets
 *    blamed on this click. Drop the entity-type pair and a 'patient' op —
 *    which the retry loop never drives directly — joins the count. Drop the
 *    attempt cap and an op already past six attempts does. Drop the org clause
 *    and a clinic is shown another clinic's queue, which is §5 and not a
 *    cosmetic defect.
 *
 * The QUEUED count is the other half of the same honesty (Sentinel's N3 on
 * #663): it is the number the "Awaiting write-back" card beside the toast
 * shows, so the two can be spoken about in one sentence instead of leaving a
 * reader to guess which of two numbers is about them.
 */

const dialect = new PgDialect()

type Row = Record<string, unknown>
const state = {
  seq: 0,
  updates: [] as { set: Row; at: number }[],
  /** One entry per `select`, in call order: the captured predicate and when. */
  selects: [] as { where: SQL | null; at: number }[],
  /** Result rows handed back, in `select` call order. */
  selectResults: [] as Row[][],
}

vi.mock('@/lib/db', async () => {
  const realSchema = await import('@/lib/db/schema')
  return {
    // The REAL schema, so the `where` captured below renders as the statement
    // Postgres would actually parse rather than over proxy tokens.
    schema: realSchema,
    db: {
      update: () => ({
        set: (s: Row) => ({
          where: () => {
            state.updates.push({ set: s, at: state.seq++ })
            return Promise.resolve()
          },
        }),
      }),
      select: () => {
        const entry: { where: SQL | null; at: number } = { where: null, at: -1 }
        const index = state.selects.length
        state.selects.push(entry)
        const chain: Record<string, unknown> = {}
        chain.from = () => chain
        chain.where = (c: SQL) => {
          entry.where = c
          entry.at = state.seq++
          return chain
        }
        chain.limit = () => chain
        ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          resolve(state.selectResults[index] ?? [])
        return chain
      },
    },
  }
})

import { setSyncDirection } from '@/lib/services/pms/connection'
import { MAX_WRITE_ATTEMPTS } from '@/lib/types/pms'

/** The service reads the whole queue first, then the drainable subset. */
function rows(queued: number, stranded: number, oldest: unknown = null) {
  state.selectResults = [[{ c: queued }], [{ c: stranded, oldest }]]
}

beforeEach(() => {
  state.seq = 0
  state.updates.length = 0
  state.selects.length = 0
  state.selectResults = []
})

describe('setSyncDirection — what the flip left behind', () => {
  it('reports the queue that "Import only" just stranded, and how old it is', async () => {
    rows(3, 3, new Date('2026-09-18T09:15:00Z'))

    const change = await setSyncDirection('org_1', 'import')

    expect(change.strandedWrites).toBe(3)
    expect(change.queuedWrites).toBe(3)
    expect(change.oldestStrandedAt?.toISOString()).toBe('2026-09-18T09:15:00.000Z')
    // The flip still happens — this is a warning, not a veto.
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set.syncDirection).toBe('import')
  })

  it('separates the whole queue from the part the flush would have drained', async () => {
    // Ten unfinished ops, four of them still being retried. The card beside the
    // toast shows ten; blaming this click for all ten would overstate what it
    // cost, and reporting only four beside a card reading ten is the
    // unreconciled pair Sentinel's N3 was about.
    rows(10, 4, new Date('2026-09-18T09:15:00Z'))
    const change = await setSyncDirection('org_1', 'import')
    expect(change.queuedWrites).toBe(10)
    expect(change.strandedWrites).toBe(4)
  })

  it('says nothing was stranded when the queue is empty', async () => {
    rows(0, 0)
    const change = await setSyncDirection('org_1', 'import')
    expect(change).toEqual({ queuedWrites: 0, strandedWrites: 0, oldestStrandedAt: null })
  })

  it('turning write-back ON strands nothing and does not even ask', async () => {
    // A flip TO two-way releases the queue to the next flush, so there is no
    // number to report and no reason to pay for the reads.
    rows(99, 99, new Date('2026-09-01T00:00:00Z'))
    const change = await setSyncDirection('org_1', 'two_way')
    expect(change).toEqual({ queuedWrites: 0, strandedWrites: 0, oldestStrandedAt: null })
    expect(state.selects).toHaveLength(0)
  })

  it('counts AFTER the flip, so an op enqueued in the gap cannot be missed', async () => {
    // Every enqueue path refuses unless the connection is two-way, so once the
    // column is flipped nothing further can arrive and what is counted is
    // exactly what is stranded. Counting first would under-report — and
    // under-reporting is the direction that costs the practice a booking.
    rows(1, 1, new Date('2026-09-20T00:00:00Z'))
    await setSyncDirection('org_1', 'import')
    for (const s of state.selects) expect(state.updates[0].at).toBeLessThan(s.at)
  })

  it('survives a row whose min() came back unreadable rather than inventing an age', async () => {
    rows(2, 2, 'not-a-timestamp')
    const change = await setSyncDirection('org_1', 'import')
    expect(change.strandedWrites).toBe(2)
    expect(change.oldestStrandedAt).toBeNull()
  })
})

describe('setSyncDirection — the count means "what the flush would have drained"', () => {
  async function rendered() {
    rows(0, 0)
    await setSyncDirection('org_1', 'import')
    return state.selects.map((s) => {
      const q = dialect.sqlToQuery(s.where!)
      return { sql: q.sql.replace(/\s+/g, ' '), params: q.params }
    })
  }
  /** The drainable-subset read — the second one the service issues. */
  async function strandedPredicate() {
    return (await rendered())[1]
  }

  it('is scoped to the one clinic — both reads', async () => {
    for (const { sql, params } of await rendered()) {
      expect(sql).toContain('"organization_id"')
      expect(params).toContain('org_1')
    }
  })

  it('counts the two entity types the retry loop actually drives', async () => {
    // `retryPendingWrites` drives ['appointment','commlog']; a 'patient' op
    // rides the appointment leg and is never driven directly, so counting one
    // would blame this click for a row it was never going to move.
    const { sql, params } = await strandedPredicate()
    expect(sql).toContain('"entity_type"')
    expect(params).toContain('appointment')
    expect(params).toContain('commlog')
    expect(params).not.toContain('patient')
  })

  it('counts the waiting lanes only — never a settled op', async () => {
    const { sql, params } = await strandedPredicate()
    expect(sql).toContain('"status"')
    expect(params).toContain('pending')
    expect(params).toContain('error')
    // A succeeded or skipped op is finished business; counting one would make
    // the sentence on screen larger than the harm.
    expect(params).not.toContain('success')
    expect(params).not.toContain('skipped')
  })

  it('excludes ops already past the attempt cap — those were undrainable anyway', async () => {
    // Bound from the SHARED constant, which `retryPendingWrites` now reads from
    // the same place: a re-declared copy in sync.ts is how the count and the
    // drain drift apart without anything going red.
    const { sql, params } = await strandedPredicate()
    expect(sql).toContain('"attempts"')
    // `< $n`, not `<= $n`: the looser `/"attempts" </` this started as also
    // matched an `lt` → `lte` mutation, which silently re-includes the ops
    // sitting exactly AT the cap — the rows door 1 of the ledger entry is
    // about. Sentinel's N5 on #663.
    expect(sql).toMatch(/"attempts" < \$/)
    expect(params).toContain(MAX_WRITE_ATTEMPTS)
  })

  it('the QUEUE read is the card’s own predicate — no entity type, no cap', async () => {
    // This is what makes "the number beside the toast" a fact rather than a
    // hope: both counts come from `unfinishedWriteOps`, and this one adds
    // nothing to it. A cap or an entity-type clause creeping in here would make
    // the toast quietly stop agreeing with the card it is talking about.
    const [queued] = await rendered()
    expect(queued.sql).toContain('"status"')
    expect(queued.sql).not.toContain('"entity_type"')
    expect(queued.sql).not.toContain('"attempts"')
    expect(queued.params).not.toContain('appointment')
  })
})
