import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-58 — pinned by TAG (the integrator renumbers): only its own statements. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml58_two_factor', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml58_two_factor'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
  it("creates the plugin's two_factor table", () => {
    expect(sql).toContain('CREATE TABLE "two_factor"')
    for (const col of ['secret', 'backup_codes', 'user_id']) expect(sql).toContain(`"${col}" text NOT NULL`)
  })
  it('adds user.two_factor_enabled and clinic_profile.require_two_factor (default off), nothing destructive', () => {
    expect(sql).toContain('ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;')
    expect(sql).toContain('ALTER TABLE "clinic_profile" ADD COLUMN "require_two_factor" integer DEFAULT 0 NOT NULL;')
    expect(sql).not.toMatch(/DROP/)
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(1)
  })
})
