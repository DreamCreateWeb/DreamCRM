import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0181 — ONE index, `patient_message_org_patient_sent_idx` on
 * (organization_id, patient_id, sent_at). The Patients list's "Last contact"
 * cell is a DISTINCT ON per patient over patient_message and its sort is a
 * correlated `max(sent_at)` per row (G2-17); both key on the org + patient
 * pair and walk sent_at from the top, which the two existing indexes
 * (thread+sent, org+sent) cannot serve. Nothing else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0181_patient_message_index', () => {
  const sql = readFileSync(join(DIR, '0181_patient_message_index.sql'), 'utf8')

  it('creates exactly the one index, in column order, and touches nothing else', () => {
    expect(sql).toMatch(
      /CREATE INDEX "patient_message_org_patient_sent_idx" ON "patient_message" USING btree \("organization_id","patient_id","sent_at"\)/,
    )
    expect(sql.match(/CREATE INDEX/g)).toHaveLength(1)
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP/)
  })

  it('is registered in the journal under its name, directly after 0180', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number }>
    }
    const last = journal.entries.find((e) => e.idx === 181)
    expect(last?.tag).toBe('0181_patient_message_index')
    const prev = journal.entries.find((e) => e.idx === 180)
    expect(prev?.tag).toBe('0180_insurance_discovery')
    expect(last!.when).toBeGreaterThan(prev!.when)
  })

  it('matches the drizzle schema, so the next `db:generate` has nothing to add', () => {
    const schema = readFileSync(join(process.cwd(), 'lib/db/schema/clinic.ts'), 'utf8')
    expect(schema).toContain("index('patient_message_org_patient_sent_idx').on(t.organizationId, t.patientId, t.sentAt)")
    const snapshot = JSON.parse(readFileSync(join(DIR, 'meta/0181_snapshot.json'), 'utf8')) as {
      tables: Record<string, { indexes: Record<string, { columns: Array<{ expression: string }> }> }>
    }
    const idx = snapshot.tables['public.patient_message'].indexes['patient_message_org_patient_sent_idx']
    expect(idx.columns.map((c) => c.expression)).toEqual(['organization_id', 'patient_id', 'sent_at'])
  })
})
