import { describe, it, expect } from 'vitest'
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
import { sweepCountsQuery, failureCountExpr, parkedWritesQuery } from '@/lib/services/guardian'

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


describe('the day expression cannot be taken down by one bad stored zone', () => {
  const q = dialect.sqlToQuery(
    buildSweepQuery(new Date('2026-07-22T00:00:00Z'), new Date('2026-07-29T00:00:00Z')),
  )

  it('resolves the zone through pg_timezone_names, not a bare coalesce', () => {
    // `coalesce` guards NULL only, and this expression lives inside ONE
    // grouped aggregate over every org's ledger — so an unrecognised
    // non-empty value raises and fails the whole statement, blinding the
    // watcher for every OTHER clinic. Both writers validate now; a legacy
    // or imported row predates that (Phase 4 open item #6).
    expect(q.sql).toContain('pg_timezone_names')
    expect(q.sql).toContain('America/New_York')
  })

  it('still buckets on the CLINIC’s zone, not the server’s', () => {
    expect(q.sql).toContain('"timezone"')
    expect(q.sql).toMatch(/at time zone 'UTC'/)
  })
})

/**
 * THE PARKED WRITE-OP READ, RENDERED FOR REAL (DREAMCRM-68).
 *
 * Same law as the sweep above: new raw SQL gets a test at the real
 * boundary, built from the SERVICE'S OWN definition rather than a
 * reconstruction of it. This query joins a second table and narrows on a
 * status word in each — exactly the shape where a JS-modelled database
 * proves nothing, and where the round-11 42P01 lived.
 *
 * The three narrowings asserted here are DECISIONS, not incidental
 * filters. Each one, dropped, produces a specific production failure:
 *
 * Every predicate answers ONE question — is anything still actively trying
 * to deliver this row? — and each, dropped, produces a specific production
 * failure of the SAME shape: an alarm that can never clear, so the practice
 * is pinned at `blocked` and re-raised every `RE_ALERT_DAYS` for the life of
 * the account.
 *
 *  - widen `status = 'pending'` to the usual `('pending','error')` pair and
 *    a practice that ever had one terminally-failed op alarms forever —
 *    `retryPendingWrites` skips it at the attempt cap and nothing in the
 *    product can resolve it;
 *  - drop `entity_type = 'appointment'` and an orphaned 'patient' op alarms
 *    forever (the retry loop never drives that type directly), and the
 *    headline's "N bookings" starts counting things that are not bookings;
 *  - drop the connected clause and a practice that disconnected last spring
 *    alarms forever on rows `retryPendingWrites` will never drive again;
 *  - drop the TWO-WAY clause and a practice that flipped the direction
 *    toggle to "Import only" alarms forever — `syncPms` gates the flush on
 *    `syncDirection === 'two_way'` and that is the only call site, so even
 *    "Sync now" will not drain it. This is the one PR #640's review caught,
 *    and it is one supported button click rather than a rare state;
 *  - drop the AUTO-SYNC clause and a practice the hourly job never selects
 *    is accused of having an unreachable bridge nothing ever tried to reach;
 *  - drop the cutoff and the alarm fires on this morning's ordinary
 *    in-flight queue.
 */
describe('the parked write-op read as Postgres parses it', () => {
  const cutoff = new Date('2026-09-18T14:00:00Z')
  const q = dialect.sqlToQuery(parkedWritesQuery(new QueryBuilder() as never, cutoff).getSQL())
  const flat = q.sql.replace(/\s+/g, ' ')

  it('counts the WAITING lane only, never the terminally-failed one', () => {
    // A bound 'pending' and no 'error' anywhere. The error lane is a
    // different fact with no self-clearing path, and alarming on it would
    // be the crying-wolf failure this primitive exists to avoid.
    expect(q.params).toContain('pending')
    expect(q.params).not.toContain('error')
  })

  it('counts APPOINTMENTS only — the retry loop never drives a patient op directly', () => {
    // sync.ts:1150 drives ['appointment','commlog']; a 'patient' op rides
    // the appointment leg, so one orphaned by an appointment that errored
    // out at the cap is undrainable. And the headline says "bookings",
    // which a patient op and a chart note are not.
    expect(q.params).toContain('appointment')
    expect(flat).toContain('"entity_type"')
  })

  it('only looks at practices whose bridge is actually connected', () => {
    expect(flat).toMatch(/inner join "pms_connection"/i)
    expect(flat).toContain('"pms_connection"."organization_id"')
    // 'connected' is the second status bound, beside 'pending'.
    expect(q.params.filter((p) => p === 'connected')).toHaveLength(1)
  })

  it('only looks at TWO-WAY connections — "Import only" strands the queue permanently', () => {
    // THE DEFECT PR #640's REVIEW CAUGHT. `syncPms` gates the flush on
    // `syncDirection === 'two_way'` (sync.ts:252) and it is the only call
    // site, so "Sync now" does not drain it either — while
    // `setSyncDirection` is a bare UPDATE that strands whatever is already
    // queued. Without this predicate the practice most likely to flip that
    // toggle (one whose bridge is down) is told every week, forever, to
    // ring a practice whose bridge is fine.
    expect(q.params).toContain('two_way')
    expect(flat).toContain('"sync_direction"')
  })

  it('only looks at connections the hourly job actually sweeps', () => {
    // auto-sync off means nothing has TRIED, so there is no evidence about
    // their bridge to report. Same posture getPmsHealth takes with this
    // column (health.ts:128), for the same reason.
    expect(flat).toContain('"auto_sync_enabled"')
    expect(q.params).toContain(1)
  })

  it('binds the age cutoff as a real parameter rather than interpolating a date', () => {
    // Compared by VALUE: drizzle maps a Date through the column's driver
    // encoder, so the bound parameter is not the same object the caller
    // passed — only the instant it stands for survives, and that is the
    // part a test can honestly assert.
    const bound = q.params.filter((p) => p instanceof Date || typeof p === 'string')
    expect(bound.some((p) => new Date(p as string).getTime() === cutoff.getTime())).toBe(true)
    expect(flat).toMatch(/"created_at" < \$\d/)
  })

  it('aggregates the count AND the oldest instant — the headline needs both', () => {
    expect(flat).toContain('count(*)::int')
    expect(flat).toMatch(/min\("pms_write_op"\."created_at"\)/)
  })

  it('groups by the org, so one row comes back per practice', () => {
    expect(flat).toMatch(/group by "pms_write_op"\."organization_id"/i)
  })

  it('quotes the real table and column names from the schema', () => {
    expect(q.sql).toContain('"pms_write_op"')
    expect(q.sql).toContain('"organization_id"')
    expect(q.sql).toContain('"created_at"')
    expect(q.sql).toContain('"status"')
  })
})
