import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0184 — `patient_access_log` (ML-31): who opened which record and
 * who exported. Asserts this table's own statements only; the integrator may
 * renumber the file, so the journal entry is found by TAG.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0184_patient_access_log', () => {
  const sql = readFileSync(join(DIR, '0184_patient_access_log.sql'), 'utf8')

  it('creates the table with its columns (patient_id nullable, user_id and action required)', () => {
    const create = sql.match(/CREATE TABLE "patient_access_log" \(([\s\S]*?)\);/)?.[1] ?? ''
    expect(create).toContain('"id" text PRIMARY KEY NOT NULL')
    expect(create).toContain('"organization_id" text NOT NULL')
    expect(create).toMatch(/"patient_id" text,/)
    expect(create).toContain('"user_id" text NOT NULL')
    expect(create).toContain('"action" text NOT NULL')
    expect(create).toMatch(/"detail" jsonb,/)
    expect(create).toContain('"at" timestamp DEFAULT now() NOT NULL')
  })

  it('cascades from the organization and builds both access indexes, newest first', () => {
    expect(sql).toContain('ADD CONSTRAINT "patient_access_log_organization_id_organization_id_fk"')
    expect(sql).toContain('ON DELETE cascade')
    expect(sql).toMatch(
      /CREATE INDEX "patient_access_log_patient_at_idx" ON "patient_access_log" USING btree \("organization_id","patient_id","at" DESC NULLS LAST\)/,
    )
    expect(sql).toMatch(
      /CREATE INDEX "patient_access_log_user_at_idx" ON "patient_access_log" USING btree \("organization_id","user_id","at" DESC NULLS LAST\)/,
    )
  })

  it('is registered in the journal under its tag', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number }>
    }
    expect(journal.entries.filter((e) => e.tag === '0184_patient_access_log')).toHaveLength(1)
  })

  it('matches the drizzle schema', () => {
    const schema = readFileSync(join(process.cwd(), 'lib/db/schema/clinic.ts'), 'utf8')
    expect(schema).toContain("pgTable(\n  'patient_access_log'")
    expect(schema).toContain("index('patient_access_log_patient_at_idx').on(t.organizationId, t.patientId, t.at.desc())")
    expect(schema).toContain("index('patient_access_log_user_at_idx').on(t.organizationId, t.userId, t.at.desc())")
  })
})
