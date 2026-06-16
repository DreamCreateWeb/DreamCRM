import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Clinic deletion deletes the org row, relying on `onDelete: cascade` FKs to
 * remove every org-scoped child. A single `onDelete: 'restrict'` (or a NO ACTION
 * default) anywhere in the cascade chain aborts the WHOLE delete — which once
 * left a "deleted" clinic's organization row (and its subdomain slug) stranded
 * in the DB. This guards that invariant at the schema-source level so it can't
 * silently regress.
 */

const SCHEMA_DIR = join(process.cwd(), 'lib/db/schema')

function schemaFiles(): { name: string; src: string }[] {
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f, src: readFileSync(join(SCHEMA_DIR, f), 'utf8') }))
}

describe('clinic-delete cascade invariant', () => {
  it("no foreign key uses onDelete: 'restrict' (it aborts the org-delete cascade)", () => {
    const offenders = schemaFiles()
      .filter((f) => /onDelete:\s*'restrict'/.test(f.src))
      .map((f) => f.name)
    expect(offenders).toEqual([])
  })

  it('every onDelete clause is cascade or set null (no surprise restrict/no-action)', () => {
    const values = schemaFiles()
      .flatMap((f) => Array.from(f.src.matchAll(/onDelete:\s*'([^']*)'/g), (m) => m[1]))
    const allowed = new Set(['cascade', 'set null'])
    const bad = values.filter((v) => !allowed.has(v))
    expect(bad).toEqual([])
  })

  it('the membership → plan FK (the historical blocker) cascades', () => {
    const clinic = readFileSync(join(SCHEMA_DIR, 'clinic.ts'), 'utf8')
    // The membership.plan_id reference must cascade, not restrict.
    expect(clinic).toMatch(/references\(\(\) => membershipPlan\.id,\s*\{\s*onDelete:\s*'cascade'\s*\}\)/)
  })
})
