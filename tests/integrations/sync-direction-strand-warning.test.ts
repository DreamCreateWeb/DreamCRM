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
 * resolution surface. So what is under test is the honesty of the number.
 *
 * Two kinds of assertion below, and the second is the one that matters:
 *
 *  - the RESULT — a count and an age come back, and flipping write-back ON
 *    reports nothing stranded. These fail against the pre-fix `Promise<void>`.
 *  - the PREDICATE, rendered through drizzle's real dialect. The count is only
 *    worth showing if it means "what the flush would have drained": every
 *    clause here mirrors `retryPendingWrites`, and dropping any one of them
 *    produces a specific lie. Widen the status pair and a terminally-failed op
 *    (undrainable whatever the direction says) gets blamed on this click. Drop
 *    the entity-type pair and a 'patient' op — which the retry loop never
 *    drives directly — joins the count. Drop the attempt cap and an op already
 *    past six attempts does. Drop the org clause and a clinic is shown another
 *    clinic's queue, which is §5 and not a cosmetic defect.
 */

const dialect = new PgDialect()

type Row = Record<string, unknown>
const state = {
  seq: 0,
  updates: [] as { set: Row; at: number }[],
  selectWhere: null as SQL | null,
  selectAt: -1,
  selectRows: [] as Row[],
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
        const chain: Record<string, unknown> = {}
        chain.from = () => chain
        chain.where = (c: SQL) => {
          state.selectWhere = c
          state.selectAt = state.seq++
          return chain
        }
        chain.limit = () => chain
        ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(state.selectRows)
        return chain
      },
    },
  }
})

import { setSyncDirection } from '@/lib/services/pms/connection'
import { MAX_WRITE_ATTEMPTS } from '@/lib/types/pms'

beforeEach(() => {
  state.seq = 0
  state.updates.length = 0
  state.selectWhere = null
  state.selectAt = -1
  state.selectRows = []
})

describe('setSyncDirection — what the flip left behind', () => {
  it('reports the queue that "Import only" just stranded, and how old it is', async () => {
    const oldest = new Date('2026-09-18T09:15:00Z')
    state.selectRows = [{ c: 3, oldest }]

    const change = await setSyncDirection('org_1', 'import')

    expect(change.strandedWrites).toBe(3)
    expect(change.oldestStrandedAt?.toISOString()).toBe('2026-09-18T09:15:00.000Z')
    // The flip still happens — this is a warning, not a veto.
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set.syncDirection).toBe('import')
  })

  it('says nothing was stranded when the queue is empty', async () => {
    state.selectRows = [{ c: 0, oldest: null }]
    const change = await setSyncDirection('org_1', 'import')
    expect(change).toEqual({ strandedWrites: 0, oldestStrandedAt: null })
  })

  it('turning write-back ON strands nothing and does not even ask', async () => {
    // A flip TO two-way releases the queue to the next flush, so there is no
    // number to report and no reason to pay for the read.
    state.selectRows = [{ c: 99, oldest: new Date('2026-09-01T00:00:00Z') }]
    const change = await setSyncDirection('org_1', 'two_way')
    expect(change).toEqual({ strandedWrites: 0, oldestStrandedAt: null })
    expect(state.selectWhere).toBeNull()
  })

  it('counts AFTER the flip, so an op enqueued in the gap cannot be missed', async () => {
    // Every enqueue path refuses unless the connection is two-way, so once the
    // column is flipped nothing further can arrive and what is counted is
    // exactly what is stranded. Counting first would under-report — and
    // under-reporting is the direction that costs the practice a booking.
    state.selectRows = [{ c: 1, oldest: new Date('2026-09-20T00:00:00Z') }]
    await setSyncDirection('org_1', 'import')
    expect(state.updates[0].at).toBeLessThan(state.selectAt)
  })

  it('survives a row whose min() came back unreadable rather than inventing an age', async () => {
    state.selectRows = [{ c: 2, oldest: 'not-a-timestamp' }]
    const change = await setSyncDirection('org_1', 'import')
    expect(change.strandedWrites).toBe(2)
    expect(change.oldestStrandedAt).toBeNull()
  })
})

describe('setSyncDirection — the count means "what the flush would have drained"', () => {
  async function renderedPredicate() {
    state.selectRows = [{ c: 0, oldest: null }]
    await setSyncDirection('org_1', 'import')
    const q = dialect.sqlToQuery(state.selectWhere!)
    return { sql: q.sql.replace(/\s+/g, ' '), params: q.params }
  }

  it('is scoped to the one clinic', async () => {
    const { sql, params } = await renderedPredicate()
    expect(sql).toContain('"organization_id"')
    expect(params).toContain('org_1')
  })

  it('counts the two entity types the retry loop actually drives', async () => {
    // `retryPendingWrites` drives ['appointment','commlog']; a 'patient' op
    // rides the appointment leg and is never driven directly, so counting one
    // would blame this click for a row it was never going to move.
    const { sql, params } = await renderedPredicate()
    expect(sql).toContain('"entity_type"')
    expect(params).toContain('appointment')
    expect(params).toContain('commlog')
    expect(params).not.toContain('patient')
  })

  it('counts the waiting lanes only — never a settled op', async () => {
    const { sql, params } = await renderedPredicate()
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
    const { sql, params } = await renderedPredicate()
    expect(sql).toContain('"attempts"')
    expect(sql).toMatch(/"attempts" </)
    expect(params).toContain(MAX_WRITE_ATTEMPTS)
  })
})
