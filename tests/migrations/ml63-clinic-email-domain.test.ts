import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-63 — pinned by TAG (the integrator renumbers): only its own statements. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml63_clinic_email_domain', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml63_clinic_email_domain'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
  it('adds the six email-domain columns to clinic_profile, nothing else', () => {
    for (const [col, type] of [
      ['email_domain_id', 'text'],
      ['email_domain_name', 'text'],
      ['email_domain_status', 'text'],
      ['email_domain_records', 'jsonb'],
      ['email_domain_checked_at', 'timestamp'],
      ['email_domain_verified_at', 'timestamp'],
    ]) {
      expect(sql).toContain(`ALTER TABLE "clinic_profile" ADD COLUMN "${col}" ${type};`)
    }
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(6)
    expect(sql).not.toMatch(/DROP|CREATE TABLE|NOT NULL/)
  })
})
