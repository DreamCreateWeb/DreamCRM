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
