import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * THE MEASUREMENT MEASURES THE QUERY, NOT A LOOKALIKE OF IT.
 *
 * `scripts/frequency-cap-explain.ts` is the instrument behind
 * `docs/FREQUENCY-CAP-MEASUREMENT.md` and behind the STRUCK verdict on
 * RELEASE.md Part 5 `:1840`. It cannot import `partitionByFrequencyCap`: that
 * module is `server-only` and reaches the live `db` proxy, neither of which a
 * plain `tsx` process can load. So it rebuilds the cap's SELECT through
 * drizzle's own QueryBuilder — and the moment those two drift, the document
 * describes the performance of a statement this repo does not run.
 *
 * That is not a hypothetical. The whole reason the entry is being struck is
 * that the measured plan uses `campaign_events_campaign_patient_type_idx` via
 * the campaigns join. Drop the join from the copy, or widen the predicate, and
 * the measured plan changes completely while every number in the document
 * keeps its confident formatting.
 *
 * So: render both, compare BYTES — the SQL and the bound parameters.
 *
 * The sibling `frequency-cap-sql.test.ts` asserts what the statement SAYS
 * (the disjunction is parenthesised, the org scope survives). This one asserts
 * only that two renderings agree, which is a different question and the one
 * the measurement stands on.
 */

const rendered: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const real = drizzle({} as never, { schema })

  const capture = (query: { toSQL(): { sql: string; params: unknown[] } }) => {
    rendered.push(query.toSQL())
    return []
  }
  function wrap(builder: unknown): unknown {
    return new Proxy(builder as object, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(capture(target as never))
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return out && typeof out === 'object' ? wrap(out) : out
        }
      },
    })
  }
  return { schema, db: { select: (cols?: Record<string, unknown>) => wrap(real.select(cols as never)) } }
})

import { partitionByFrequencyCap, FREQUENCY_WINDOW_DAYS } from '@/lib/services/marketing-frequency'
import { capQuery, CANDIDATE_INDEXES } from '@/scripts/frequency-cap-explain'

const NOW = new Date('2026-09-23T12:00:00.000Z')
const SINCE = new Date(NOW.getTime() - FREQUENCY_WINDOW_DAYS * 86_400_000)

/** What the service actually sends, for a recipient list of the given shape. */
async function serviceSql(ids: string[], emails: string[]) {
  rendered.length = 0
  const recipients = [
    ...ids.map((id) => ({ patientId: id, email: null })),
    ...emails.map((email) => ({ email })),
  ]
  await partitionByFrequencyCap('org_1', recipients, NOW)
  return rendered[0]
}

beforeEach(() => {
  rendered.length = 0
})

describe('the measurement script renders the cap query the service renders', () => {
  it('agrees on SQL and parameters for the production shape (patients only)', async () => {
    const ids = ['pat_1', 'pat_2', 'pat_3']
    const service = await serviceSql(ids, [])
    const script = capQuery('org_1', ids, [], SINCE)
    expect(script.sql).toBe(service.sql)
    expect(script.params).toEqual(service.params)
  })

  it('agrees on SQL and parameters for the mixed shape (the OR)', async () => {
    const ids = ['pat_1', 'pat_2']
    const emails = ['a@x.test', 'b@x.test']
    const service = await serviceSql(ids, emails)
    const script = capQuery('org_1', ids, emails, SINCE)
    expect(script.sql).toBe(service.sql)
    expect(script.params).toEqual(service.params)
  })

  it('agrees on SQL for the addresses-only shape (customer-source callers)', async () => {
    const emails = ['a@x.test']
    const service = await serviceSql([], emails)
    const script = capQuery('org_1', [], emails, SINCE)
    expect(script.sql).toBe(service.sql)
    expect(script.params).toEqual(service.params)
  })

  it('renders a real statement, not an empty string — the comparison above has something to compare', async () => {
    const script = capQuery('org_1', ['pat_1'], [], SINCE)
    expect(script.sql).toContain('"campaign_events"')
    expect(script.sql).toContain('inner join')
    expect(script.params.length).toBeGreaterThan(2)
  })
})

describe('the candidate indexes the measurement priced', () => {
  it('are the two halves of the OR — one per key column', () => {
    const ddl = CANDIDATE_INDEXES.map((i: { ddl: string }) => i.ddl.replace(/\s+/g, ' ')).join('\n')
    expect(ddl).toContain('(patient_id, occurred_at)')
    expect(ddl).toContain('(recipient_email, occurred_at)')
    // Partial on the event type the cap counts. A non-partial index would be a
    // different (larger) thing than the one the document reports a price for.
    expect(CANDIDATE_INDEXES.every((i: { ddl: string }) => /WHERE type = 'sent'/.test(i.ddl))).toBe(true)
  })

  it('name indexes that do NOT exist — the measurement priced a change, not the status quo', () => {
    // Read the schema SOURCE rather than the built table object: drizzle's
    // table carries circular references, and the question here is about what
    // the repo declares, which is a text fact.
    //
    // This is the assertion that would notice someone quietly shipping the
    // struck indexes anyway. If they are ever added on purpose, the ledger
    // entry and `docs/FREQUENCY-CAP-MEASUREMENT.md` are wrong and this test
    // failing is how that gets said out loud.
    const domain = readFileSync('lib/db/schema/domain.ts', 'utf8')
    for (const idx of CANDIDATE_INDEXES) {
      expect(domain, `${idx.name} now exists — the strike on :1840 needs revisiting`).not.toContain(idx.name)
    }
  })
})
