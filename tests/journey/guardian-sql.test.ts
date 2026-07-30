import { describe, it, expect } from 'vitest'
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
import { sweepCountsQuery, failureCountExpr } from '@/lib/services/guardian'

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

/**
 * THE SERVICE'S OWN QUERY, not a reconstruction of it (round-11 audit).
 *
 * This file used to hand-write the surrounding `select … from action_ledger`
 * around the imported aggregate expressions — and `failureCountExpr` buckets
 * by `clinic_profile.timezone`, so the statement it rendered referenced a
 * table it never joined: Postgres 42P01, every time. The strictest-looking
 * test in the phase was validating a statement the database would reject,
 * and the LEFT JOIN the real query cannot run without had no coverage
 * anywhere (the service harness stubs `leftJoin` to a no-op).
 *
 * `sweepCountsQuery` is now the single definition. The service hands it the
 * live `db`; this hands it drizzle's offline `QueryBuilder`, which needs no
 * connection — so what is rendered below IS what production executes.
 */
function buildSweepQuery(since: Date, until: Date) {
  return sweepCountsQuery(new QueryBuilder() as never, since, until).getSQL()
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
    // Two window bounds plus the failure KIND the engine-only aggregate
    // narrows on (round-15) — all bound, none interpolated.
    const window = q.params.filter((p) => p !== 'engine')
    expect(window).toHaveLength(2)
    for (const p of q.params) {
      expect(p instanceof Date || typeof p === 'string').toBe(true)
    }
    expect(q.params).toContain('engine')
    expect(q.sql).toMatch(/\$1/)
    expect(q.sql).toMatch(/\$2/)
  })

  it('carries an ENGINE-ONLY failure aggregate beside the all-failures one', () => {
    // The owner's verdict counts both producers; the CLINIC-voiced hedge
    // must not, because promising to "get those working" is false about a
    // card the machine deliberately handed back. Same grouped query, one
    // more filtered aggregate — never a second read.
    expect(q.sql).toContain("'failureKind'")
    expect((q.sql.match(/count\(distinct/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('JOINS the table its own day expression names — the join has to be here or Postgres says 42P01', () => {
    // Round-11 audit: the version of this file that hand-built the select
    // rendered `clinic_profile.timezone` with no `clinic_profile` in scope,
    // so the strictest test in the phase was validating a statement the
    // database would reject. Both halves are asserted, because either one
    // alone is a statement that cannot run.
    expect(q.sql).toContain('"clinic_profile"')
    expect(q.sql).toMatch(/left join "clinic_profile"/)
    expect(q.sql).toContain('"timezone"')
  })

  it('groups by the org, so one row comes back per clinic', () => {
    expect(q.sql).toMatch(/group by "action_ledger"\."organization_id"/)
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
