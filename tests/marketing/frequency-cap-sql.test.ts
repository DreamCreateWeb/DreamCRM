import { describe, it, expect } from 'vitest'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { and, eq, gte, inArray, or } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'

/**
 * THE FREQUENCY CAP'S QUERY, RENDERED FOR REAL.
 *
 * The sibling test (marketing-frequency.test.ts) mocks `@/lib/db` with a
 * chain that ignores the WHERE clause entirely and hands back a fixed row
 * list. That is the right way to assert the COUNTING — which key wins, what
 * gets suppressed — and completely blind to the SQL.
 *
 * This file renders the real statement through drizzle's own dialect, no
 * database required, because the cap's move from an email key to a
 * `patientId ?? email` key changed the query in two ways a JavaScript mock
 * cannot see:
 *
 *  1. the WHERE grew a disjunction, and CLAUDE.md's standing warning is that
 *     drizzle's `and()` wraps its whole list in ONE paren pair and never
 *     parenthesises the chunks — so a bare top-level OR would escape its AND
 *     chain and match every clinic's events, not this org's;
 *  2. `campaign_events.recipient_email` went NULLABLE in migration 0143, and
 *     the DB is modelled in JavaScript, so nothing else in the suite would
 *     notice if the column and the query disagreed.
 *
 * The standing rule from the Phase-3 criticals: new raw SQL or a write to a
 * constrained column needs a boundary test rendered through the real dialect.
 */

const qb = new QueryBuilder()

/** The cap's WHERE, built exactly as marketing-frequency.ts builds it. */
function render(ids: string[], emails: string[]): string {
  const clauses = []
  if (ids.length > 0) clauses.push(inArray(schema.campaignEvents.patientId, ids))
  if (emails.length > 0) clauses.push(inArray(schema.campaignEvents.recipientEmail, emails))
  const keyMatch = clauses.length === 1 ? clauses[0] : or(...clauses)
  return qb
    .select({ email: schema.campaignEvents.recipientEmail, patientId: schema.campaignEvents.patientId })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaigns.organizationId, 'org_1'),
        eq(schema.campaignEvents.type, 'sent'),
        gte(schema.campaignEvents.occurredAt, new Date('2026-08-01T00:00:00Z')),
        keyMatch,
      ),
    )
    .toSQL().sql
}

describe('the cap query as Postgres receives it', () => {
  it('PARENTHESISES the key disjunction, so it cannot escape the org scope', () => {
    const sql = render(['pat_1'], ['a@x.com'])
    // The org filter and the OR must not end up as siblings in a flat AND —
    // that is the shape that would count every clinic's sends.
    expect(sql).toMatch(/\(.*"patient_id" in .* or .*"recipient_email" in .*\)/i)
  })

  it('still scopes to the organization via the campaigns join', () => {
    const sql = render(['pat_1'], ['a@x.com'])
    expect(sql).toContain('"campaigns"')
    expect(sql).toContain('organization_id')
    expect(sql).toContain('inner join')
  })

  it('emits a single predicate — no empty OR — when only patients are keyed', () => {
    const sql = render(['pat_1'], [])
    expect(sql).toContain('patient_id')
    expect(sql).not.toContain('recipient_email" in')
  })

  it('emits a single predicate when only addresses are keyed (customer-source sends)', () => {
    const sql = render([], ['a@x.com'])
    expect(sql).toContain('recipient_email')
    expect(sql).not.toContain('patient_id" in')
  })

  it('selects BOTH key columns — the counter needs them to apply patientId ?? email', () => {
    const sql = render(['pat_1'], ['a@x.com'])
    expect(sql).toContain('recipient_email')
    expect(sql).toContain('patient_id')
  })
})

describe('the schema the query is written against', () => {
  it('recipient_email is NULLABLE — a text to a phone-only patient has no address to record', () => {
    expect(schema.campaignEvents.recipientEmail.notNull).toBe(false)
  })

  it('recipient_phone exists and is nullable — null for every email send', () => {
    expect(schema.campaignEvents.recipientPhone).toBeDefined()
    expect(schema.campaignEvents.recipientPhone.notNull).toBe(false)
  })

  it('patient_id is still the soft pointer the cap keys on', () => {
    expect(schema.campaignEvents.patientId).toBeDefined()
    expect(schema.campaignEvents.patientId.notNull).toBe(false)
  })
})
