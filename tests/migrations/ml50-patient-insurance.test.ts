import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-50 — a second plan on the record. Pinned by TAG (the integrator
 * renumbers): the slot table, the check's rank, the unique slot, and the
 * backfill of every patient's flat primary columns into rank 'primary'.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_partner_share_code_patient_insurance.sql'))!

describe('ml50_patient_insurance', () => {
  const sql = readFileSync(join(DIR, file), 'utf8')

  it('creates the slot table, org-scoped, cascading with the org and the patient', () => {
    expect(sql).toMatch(/CREATE TABLE "patient_insurance"/)
    for (const col of ['organization_id', 'patient_id', 'rank', 'provider', 'policy_number', 'group_number', 'detail']) expect(sql, col).toContain(`"${col}"`)
    expect(sql).toMatch(/"organization_id" text NOT NULL/)
    expect(sql).toMatch(/"patient_insurance_patient_id_patient_id_fk" FOREIGN KEY \("patient_id"\) REFERENCES "public"\."patient"\("id"\) ON DELETE cascade/)
  })

  it('keeps ONE row per patient per rank and indexes the lookup', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "patient_insurance_org_patient_rank_uq" ON "patient_insurance" USING btree \("organization_id","patient_id","rank"\)/)
    expect(sql).toMatch(/CREATE INDEX "patient_insurance_org_patient_idx"/)
  })

  it('stamps the check with the plan it verified, defaulting to primary', () => {
    expect(sql).toMatch(/ALTER TABLE "insurance_verification" ADD COLUMN "rank" text DEFAULT 'primary' NOT NULL;/)
  })

  it('backfills the flat primary columns, org carried, idempotent, and touches nothing else', () => {
    const ins = sql.slice(sql.indexOf('INSERT INTO "patient_insurance"'))
    expect(ins).toMatch(/SELECT [^;]*p\."organization_id", p\."id", 'primary', p\."insurance_provider", p\."insurance_policy_number", p\."insurance_group_number", p\."insurance_detail"\s+FROM "patient" p/)
    expect(ins).toMatch(/WHERE p\."insurance_provider" IS NOT NULL OR p\."insurance_policy_number" IS NOT NULL OR p\."insurance_group_number" IS NOT NULL/)
    expect(ins).toMatch(/ON CONFLICT \("organization_id", "patient_id", "rank"\) DO NOTHING/)
    expect(sql).not.toMatch(/DROP |UPDATE "patient"|ALTER TABLE "patient" /)
  })

  it('is registered in the journal', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(journal.entries.some((e) => e.tag.endsWith('_partner_share_code_patient_insurance'))).toBe(true)
  })
})
