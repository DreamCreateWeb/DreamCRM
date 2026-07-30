import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and, gte, lt, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { workCountExpr, failureCountExpr } from '@/lib/services/guardian'

/**
 * THE GUARDIAN's grouped ledger read, RENDERED FOR REAL (Phase 4).
 *
 * Standing lesson from the Phase-3 audit (docs/AUDITS.md): a database
 * modelled in JavaScript is not a database. Both of that phase's criticals
 * lived exactly where the harnesses stop — a foreign-key constraint and
 * Postgres's parameter-type inference have no JS analogue — and 5,600
 * passing tests could not see either. So any NEW raw SQL gets a test at the
 * real boundary.
 *
 * It renders the SERVICE'S OWN aggregate expressions (imported, never
 * copied — a copied fragment silently stops testing the real one the day
 * they drift) plus the window predicate, through drizzle's dialect.
 */

const dialect = new PgDialect()

/** The service's real expressions, assembled the way the sweep assembles
 *  them. Only the surrounding select is written here. */
function buildSweepQuery(since: Date, until: Date) {
  return sql`select ${schema.actionLedger.organizationId},
      ${workCountExpr()} as work,
      ${failureCountExpr()} as failures
    from ${schema.actionLedger}
    where ${and(gte(schema.actionLedger.occurredAt, since), lt(schema.actionLedger.occurredAt, until))}
    group by ${schema.actionLedger.organizationId}`
}

describe('the guardian sweep as Postgres parses it', () => {
  const q = dialect.sqlToQuery(buildSweepQuery(new Date('2026-07-22T00:00:00Z'), new Date('2026-07-29T00:00:00Z')))

  it('emits FILTER aggregates, not a bare count that would tally failures as work', () => {
    expect(q.sql).toContain('count(*) filter (')
    // The work aggregate must exclude all three non-work kinds; dropping any
    // one of them makes a broken clinic look busy, which is the single
    // confusion this whole primitive exists to remove.
    expect(q.sql).toContain("'autonomyChange'")
    expect(q.sql).toContain("'autoFailure'")
    expect(q.sql).toContain("'failure'")
  })

  it('binds the window as real parameters — a literal-interpolated date is both wrong and injectable', () => {
    expect(q.params).toHaveLength(2)
    for (const p of q.params) expect(p instanceof Date || typeof p === 'string').toBe(true)
    expect(q.sql).toMatch(/\$1/)
    expect(q.sql).toMatch(/\$2/)
  })

  it('quotes the real table and column names from the schema', () => {
    expect(q.sql).toContain('"action_ledger"')
    expect(q.sql).toContain('"organization_id"')
    expect(q.sql).toContain('"occurred_at"')
    expect(q.sql).toContain('"detail"')
  })

  it('groups by the org — one row per clinic is what the sweep maps over', () => {
    expect(q.sql).toMatch(/group by\s+"action_ledger"\."organization_id"/i)
  })
})

/**
 * THE DAY BOUNDARY, IN THE RIGHT DIRECTION (round-7 audit).
 *
 * `action_ledger.occurred_at` is `timestamp` WITHOUT time zone holding a UTC
 * wall clock. In Postgres, `naive AT TIME ZONE z` ASSUMES the value is
 * already local in `z` and converts it TO timestamptz — it ADDS the offset.
 * The correct conversion for a UTC-bearing naive column is the ROUND TRIP:
 * `(v AT TIME ZONE 'UTC') AT TIME ZONE z`.
 *
 * Round 6 wrote the single-cast form — correct for the shared brain, whose
 * column really is timestamptz, and wrong here by DOUBLE the offset, so an
 * EDT practice's day rolled at 16:00 local and two rows on one afternoon
 * still counted as two "days". Presence of "at time zone" proved nothing;
 * only the direction does.
 */
describe('the failure alarm buckets on a real clinic day', () => {
  const text = dialect.sqlToQuery(failureCountExpr()).sql

  it('round-trips through UTC before the clinic zone', () => {
    expect(text.replace(/\s+/g, ' ')).toMatch(
      /at time zone 'UTC'\s*\)\s*at time zone coalesce\(/i,
    )
  })

  it('never applies the clinic zone directly to the naive column', () => {
    // The exact shape that shipped in round 6: the column, then the clinic
    // zone, with no UTC hop in between.
    const flat = text.replace(/\s+/g, ' ')
    expect(
      /"occurred_at" at time zone coalesce\(/i.test(flat),
      `single-cast AT TIME ZONE on a naive column shifts the day the WRONG way:\n${flat}`,
    ).toBe(false)
  })

  it('truncates to a day AFTER the conversion, not before', () => {
    const flat = text.replace(/\s+/g, ' ')
    const trunc = flat.indexOf("date_trunc('day'")
    const tz = flat.indexOf("at time zone 'UTC'")
    expect(trunc).toBeGreaterThan(-1)
    expect(tz).toBeGreaterThan(trunc)
  })
})
