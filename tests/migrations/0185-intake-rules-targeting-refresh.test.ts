import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0185 — the auto-send rule's two knobs on `form_template`
 * (ML-27): `appointment_type_ids` jsonb (null = every visit) and
 * `refresh_months` integer (null = never re-ask). Both nullable, no
 * defaults, no backfill — a clinic's existing forms keep today's rule
 * ("any submission ever, for every visit") until someone edits one.
 * Nothing on `form_submission`: the chair reads the cached `ai_summary`;
 * there is no "acknowledged" stamp by design.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const TAG = '0183_notification_retry_website_actor_intake_rules_lead_callback'

describe(TAG, () => {
  const sql = readFileSync(join(DIR, `${TAG}.sql`), 'utf8')

  it('adds exactly the two nullable rule columns to form_template and touches nothing else', () => {
    expect(sql).toMatch(/ALTER TABLE "form_template" ADD COLUMN "appointment_type_ids" jsonb;/)
    expect(sql).toMatch(/ALTER TABLE "form_template" ADD COLUMN "refresh_months" integer;/)
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(2)
    expect(sql).not.toMatch(/NOT NULL|DEFAULT|CREATE TABLE|CREATE INDEX|DROP|form_submission/)
  })

  it('is registered in the journal under its tag, with a later timestamp than the entry before it', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number }>
    }
    const at = journal.entries.findIndex((e) => e.tag === TAG)
    expect(at).toBeGreaterThan(0)
    const entry = journal.entries[at]!
    expect(entry.idx).toBe(183)
    const prev = journal.entries[at - 1]!
    expect(entry.when).toBeGreaterThan(prev.when)
    expect(entry.idx).toBeGreaterThan(prev.idx)
  })

  it('matches the drizzle schema + snapshot, so the next `db:generate` has nothing to add', () => {
    const schema = readFileSync(join(process.cwd(), 'lib/db/schema/clinic.ts'), 'utf8')
    expect(schema).toContain("appointmentTypeIds: jsonb('appointment_type_ids')")
    expect(schema).toContain("refreshMonths: integer('refresh_months')")
    const snapshot = JSON.parse(readFileSync(join(DIR, 'meta/0185_snapshot.json'), 'utf8')) as {
      tables: Record<string, { columns: Record<string, { type: string; notNull: boolean }> }>
    }
    const cols = snapshot.tables['public.form_template'].columns
    expect(cols.appointment_type_ids).toMatchObject({ type: 'jsonb', notNull: false })
    expect(cols.refresh_months).toMatchObject({ type: 'integer', notNull: false })
  })
})
