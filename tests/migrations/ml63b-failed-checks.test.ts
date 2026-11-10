import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-63b — pinned by TAG (the integrator renumbers): only its own statement. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml63b_failed_checks', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml63b_failed_checks'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  it('adds the one counter column, nothing else', () => {
    const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
    expect(sql).toContain('ALTER TABLE "clinic_profile" ADD COLUMN "email_domain_failed_checks" integer DEFAULT 0 NOT NULL;')
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(sql).not.toMatch(/DROP|CREATE TABLE/)
  })
})
