import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-51 — holiday closures. Pinned by TAG (the integrator renumbers): the
 * table asserts only its own statements — clinic-local DATE columns (never
 * timestamps), org-scoped and cascading, the (organization_id, starts_on)
 * index — and the migration touches nothing else.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_ml51_clinic_closure.sql'))!

describe('ml51_clinic_closure', () => {
  const sql = readFileSync(join(DIR, file), 'utf8')

  it('creates clinic_closure with day columns, a label, and the org', () => {
    expect(sql).toMatch(/CREATE TABLE "clinic_closure"/)
    expect(sql).toMatch(/"starts_on" date NOT NULL/)
    expect(sql).toMatch(/"ends_on" date NOT NULL/)
    expect(sql).toMatch(/"label" text NOT NULL/)
    expect(sql).toMatch(/"organization_id" text NOT NULL/)
    expect(sql).toMatch(/"clinic_closure_organization_id_organization_id_fk" FOREIGN KEY \("organization_id"\) REFERENCES "public"\."organization"\("id"\) ON DELETE cascade/)
  })

  it('indexes the per-clinic lookup', () => {
    expect(sql).toMatch(/CREATE INDEX "clinic_closure_org_starts_idx" ON "clinic_closure" USING btree \("organization_id","starts_on"\)/)
  })

  it('touches no other table', () => {
    expect(sql).not.toMatch(/DROP |UPDATE "/)
    for (const m of Array.from(sql.matchAll(/ALTER TABLE "([a-z_]+)"/g))) expect(m[1]).toBe('clinic_closure')
  })

  it('is registered in the journal', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(journal.entries.some((e) => e.tag.endsWith('_ml51_clinic_closure'))).toBe(true)
  })
})
