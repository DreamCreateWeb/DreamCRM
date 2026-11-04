import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { appointmentReminderLog } from '@/lib/db/schema/clinic'

/**
 * Migration 0184 (ML-30, G5-31) — `appointment_reminder_log.patient_id`: the
 * forms nudge is capped per PERSON, so the log learns who a touch was for.
 * Nullable, backfilled from the appointment, indexed for the one cap read.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const sql = readFileSync(join(DIR, '0184_reminder_log_patient.sql'), 'utf8')
const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)

describe('0184_reminder_log_patient', () => {
  it('adds a nullable patient_id with its FK and the cap index', () => {
    const add = statements.filter((s) => s.includes('ADD COLUMN "patient_id"'))
    expect(add).toHaveLength(1)
    expect(add[0]).toMatch(/^ALTER TABLE "appointment_reminder_log" ADD COLUMN "patient_id" text;$/)
    expect(add[0]).not.toMatch(/NOT NULL|DEFAULT/)
    expect(statements.some((s) => /REFERENCES "public"\."patient"\("id"\)/.test(s))).toBe(true)
    const idx = statements.find((s) => s.includes('appt_reminder_patient_tpl_sent_idx'))
    expect(idx).toMatch(/\("organization_id","patient_id","template","sent_at" DESC NULLS LAST\)/)
  })

  it('is registered in the journal under its tag, after the insurance-discovery migration', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number }>
    }
    const entry = journal.entries.find((e) => e.tag === '0184_reminder_log_patient')
    expect(entry).toBeDefined()
    const prior = journal.entries.find((e) => e.tag === '0180_insurance_discovery')
    expect(entry!.when).toBeGreaterThan(prior!.when)
  })

  it('the schema carries the column and the index the SQL creates', () => {
    const cfg = getTableConfig(appointmentReminderLog)
    expect(cfg.columns.find((c) => c.name === 'patient_id')?.notNull).toBe(false)
    expect(cfg.indexes.some((i) => i.config.name === 'appt_reminder_patient_tpl_sent_idx')).toBe(true)
  })

  it('the backfill UPDATE is scoped to rows missing a patient and joins on the appointment', () => {
    const upd = statements.filter((s) => s.startsWith('UPDATE "appointment_reminder_log"'))
    expect(upd).toHaveLength(1)
    expect(upd[0]).toContain('SET "patient_id" = a."patient_id"')
    expect(upd[0]).toContain('FROM "appointment" AS a')
    expect(upd[0]).toContain('a."id" = l."appointment_id"')
    expect(upd[0]).toContain('l."patient_id" IS NULL')
  })
})

describe('the auto-touch unique index, rendered through drizzle\'s dialect', () => {
  it('still excludes forms_intake by name — the nudge may repeat across windows', () => {
    const dialect = new PgDialect()
    const cfg = getTableConfig(appointmentReminderLog)
    const uq = cfg.indexes.find((i) => i.config.name === 'appt_reminder_auto_touch_uq')!
    expect(dialect.sqlToQuery(uq.config.where!).sql).toContain("<> 'forms_intake'")
  })
})
