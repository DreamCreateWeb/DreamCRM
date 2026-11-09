import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { clinicProfile } from '@/lib/db/schema/platform'

/**
 * Migration 0184 — `clinic_profile.pms_answer` (ML-44): the sign-up's
 * "which practice software do you use?" answer, kept as free text so the
 * connect request can quote it. Asserts this column's own statement only;
 * the journal entry is found by TAG.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const sql = readFileSync(join(DIR, '0184_access_log_reminder_patient_pms_answer.sql'), 'utf8')
const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)

describe('0184 — clinic_profile.pms_answer (ML-44)', () => {
  it('adds a nullable text column with no default', () => {
    const add = statements.filter((s) => s.includes('"clinic_profile" ADD COLUMN "pms_answer"'))
    expect(add).toHaveLength(1)
    expect(add[0]).toMatch(/^ALTER TABLE "clinic_profile" ADD COLUMN "pms_answer" text;$/)
  })

  it('is registered in the journal under its tag, directly after 0183', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    const i = journal.entries.findIndex((e) => e.tag === '0184_access_log_reminder_patient_pms_answer')
    expect(i).toBeGreaterThan(0)
    expect(journal.entries[i - 1]!.tag).toMatch(/^0183_/)
  })

  it('the schema carries the column as nullable text', () => {
    const col = getTableConfig(clinicProfile).columns.find((c) => c.name === 'pms_answer')
    expect(col?.notNull).toBe(false)
    expect(col?.columnType).toBe('PgText')
  })
})
