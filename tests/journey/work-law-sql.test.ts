import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and, eq, gte, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { workOnly, failureOnly, ownFailureMarker, isWorkEntry } from '@/lib/services/action-ledger'
import { workCountExpr, failureCountExpr } from '@/lib/services/guardian'

/**
 * THE WORK LAW HAS ONE HOME, AND THE FAILURE DE-DUP IS REAL SQL (round-1
 * Phase-4 audit).
 *
 * Two findings, one file, because they are the same standing lesson from
 * Phase 3 (docs/AUDITS.md): a database modelled in JavaScript is not a
 * database.
 *
 * 1. `isWorkEntry` and the SQL filter were two hand-copied transcriptions of
 *    the same rule, with a comment on the copy claiming there was one home.
 *    They had to be edited in lockstep forever — and the `report` marker
 *    added this round is exactly the kind of change that lands in one and
 *    not the other. The Guardian's aggregate now wraps `workOnly()`, and
 *    this pins that they cannot drift again.
 *
 * 2. `recordFailure`'s de-dup predicate is raw SQL that the unit test never
 *    renders — that harness mocks `drizzle-orm` wholesale, so the template
 *    was never parsed by anything. It gets a real dialect pass here.
 */

const dialect = new PgDialect()
const render = (frag: unknown) => dialect.sqlToQuery(frag as never).sql

/** Every non-work marker the JS law knows about. Adding one to isWorkEntry
 *  without adding it to the SQL is the drift this catches. */
const NOT_WORK_MARKERS = ['autonomyChange', 'autoFailure', 'failure', 'report'] as const

describe('the WORK law, in SQL and in JavaScript', () => {
  const text = render(workOnly())

  it('names every marker the JavaScript law rejects', () => {
    for (const m of NOT_WORK_MARKERS) {
      expect(text, `'${m}' is excluded in JS but not in SQL`).toContain(`'${m}'`)
      expect(isWorkEntry({ [m]: m === 'autonomyChange' ? 'x' : true })).toBe(false)
    }
  })

  it('counts an ordinary entry as work on both sides', () => {
    expect(isWorkEntry({ patientId: 'p1' })).toBe(true)
    expect(isWorkEntry(null)).toBe(true)
  })

  it('the Guardian aggregate is the SAME expression, not a copy', () => {
    // Wrapping means every marker shows up in the aggregate for free.
    const agg = render(workCountExpr())
    for (const m of NOT_WORK_MARKERS) expect(agg).toContain(`'${m}'`)
    expect(agg).toContain('count(*) filter (')
  })

  it('the failure aggregate is the complement, and does NOT swallow reports', () => {
    const agg = render(failureCountExpr())
    expect(agg).toContain("'failure'")
    expect(agg).toContain("'autoFailure'")
    // A guardian note is not a failure — counting it as one would let the
    // Guardian's own reports trip its three-strike alarm.
    expect(agg).not.toContain("'report'")
  })

  it('uses IS DISTINCT FROM, not <>, so a NULL detail still counts as work', () => {
    // `(detail ->> 'failure') <> 'true'` is NULL for every row without the
    // key, and NULL is not TRUE — the filter would drop every normal entry
    // and the standup would report a working clinic as having done nothing.
    expect(text).toContain('is distinct from')
  })
})

describe('the failure de-dup predicate as Postgres parses it', () => {
  /** The real statement recordFailure builds, assembled the way it does. */
  const q = dialect.sqlToQuery(
    sql`select ${schema.actionLedger.id} from ${schema.actionLedger} where ${and(
      eq(schema.actionLedger.organizationId, 'org_1'),
      eq(schema.actionLedger.capability, 'review_reply'),
      gte(schema.actionLedger.occurredAt, new Date('2026-07-28T00:00:00Z')),
      // The service's OWN expression, imported — round-2 audit: this test
      // used to hand-copy the predicate, so it would have gone on passing
      // after the real one drifted.
      // recordFailure builds its de-dup with the NARROWER marker on purpose
      // (a hand-back from another subsystem must not suppress a generator's
      // strike). Verification round: this test used to render failureOnly()
      // — a predicate no caller builds.
      ownFailureMarker(),
    )}`,
  )

  it('narrows to FAILURES only — an ordinary work entry must not suppress a strike', () => {
    // Without this clause a clinic whose reviews are both working and
    // failing would look already-struck and go quiet.
    expect(q.sql).toContain("->> 'failure') = 'true'")
  })

  it('scopes to one org and one capability, over a bound window', () => {
    expect(q.sql).toContain('"organization_id"')
    expect(q.sql).toContain('"capability"')
    expect(q.sql).toContain('"occurred_at"')
    // org + capability + window + the failure KIND (round-6 audit: without
    // the kind, an unthrottled hand-back suppressed the engine's own strike).
    expect(q.params).toHaveLength(4)
  })

  it('keys on the failure KIND — a hand-back must not silence the engine', () => {
    expect(q.sql).toContain("'failureKind'")
    expect(q.params).toContain('engine')
  })

  it('reads the jsonb detail with ->>, the text operator the comparison needs', () => {
    // `->` returns jsonb; `jsonb = text` has no operator and Postgres 42883s.
    expect(q.sql).toMatch(/"detail"\s*->>\s*'failure'/)
  })
})

/**
 * COMPOSITION SAFETY (verification round). `failureOnly()` has a top-level
 * OR. drizzle's `and()` wraps the whole list in one pair of parens and never
 * parenthesizes the chunks, so an unwrapped fragment escapes its own AND and
 * the org filter stops applying — a tenant-scoping breach that renders
 * perfectly valid SQL and returns plausible-looking rows.
 */
describe('failureOnly composes safely inside and()', () => {
  const rendered = dialect.sqlToQuery(
    sql`select 1 from ${schema.actionLedger} where ${and(
      eq(schema.actionLedger.organizationId, 'org_1'),
      gte(schema.actionLedger.occurredAt, new Date('2026-07-22T00:00:00Z')),
      failureOnly(),
    )}`,
  ).sql

  it('parenthesizes its own OR', () => {
    expect(failureOnly ? dialect.sqlToQuery(failureOnly() as never).sql.trim().startsWith('(') : false).toBe(true)
  })

  it('the org filter still binds — the whole predicate is one AND chain', () => {
    // With the OR unwrapped this read `(org AND window AND failure) OR
    // (autoFailure)`, matching every hand-back row for every organization.
    const where = rendered.slice(rendered.indexOf('where '))
    const orIdx = where.indexOf(' or ')
    expect(orIdx).toBeGreaterThan(-1)
    // Every ` or ` must sit inside a deeper paren level than the AND chain.
    let depth = 0
    for (let i = 0; i < where.length; i++) {
      if (where[i] === '(') depth++
      else if (where[i] === ')') depth--
      else if (where.startsWith(' or ', i) && depth <= 1) {
        throw new Error(`top-level OR escapes the AND chain:\n${where}`)
      }
    }
  })

  it('ownFailureMarker has no OR at all, so it is safe anywhere', () => {
    expect(dialect.sqlToQuery(ownFailureMarker() as never).sql).not.toMatch(/ or /i)
  })
})
