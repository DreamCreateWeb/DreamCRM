import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0178 — the verification sheet (2026-10-08): the raw payer answer
 * on every check, and the payer notebook table. Pins the nullable column
 * (older rows and sandbox rows store null), the notebook's columns, the org
 * cascade, the ONE-row-per-clinic-per-payer unique index, and that nothing
 * else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0178_verification_sheet', () => {
  const sql = readFileSync(join(DIR, '0178_verification_sheet.sql'), 'utf8')

  it('adds the nullable raw_response column to insurance_verification', () => {
    expect(sql).toMatch(/ALTER TABLE "insurance_verification" ADD COLUMN "raw_response" jsonb;/)
    expect(sql).not.toMatch(/"raw_response" jsonb NOT NULL/)
  })

  it('creates clinic_payer_note with the notebook’s columns', () => {
    expect(sql).toMatch(/CREATE TABLE "clinic_payer_note"/)
    for (const col of ['organization_id', 'payer_key', 'payer_id', 'payer_name', 'fee_schedule', 'network', 'pays_on', 'claims_address', 'phone', 'notes', 'updated_by_user_id']) {
      expect(sql, col).toContain(`"${col}"`)
    }
    expect(sql).toMatch(/"payer_key" text NOT NULL/)
    expect(sql).toMatch(/"payer_name" text NOT NULL/)
  })

  it('cascades with the organization, set-nulls the writer, and keeps one row per clinic per payer', () => {
    expect(sql).toMatch(/"clinic_payer_note_organization_id_organization_id_fk" FOREIGN KEY \("organization_id"\) REFERENCES "public"\."organization"\("id"\) ON DELETE cascade/)
    expect(sql).toMatch(/"clinic_payer_note_updated_by_user_id_user_id_fk" FOREIGN KEY \("updated_by_user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE set null/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX "clinic_payer_note_org_payer_uq" ON "clinic_payer_note" USING btree \("organization_id","payer_key"\)/)
    expect(sql).not.toMatch(/DROP|"clinic_profile"/)
  })

  it('is registered in the journal under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    expect(journal.entries.find((e) => e.idx === 178)?.tag).toBe('0178_verification_sheet')
  })
})
