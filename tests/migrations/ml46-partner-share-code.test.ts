import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-46 — pinned by TAG (the integrator renumbers): only its own statements. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml46_partner_share_code', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml46_partner_share_code'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
  it('adds the unique share code and the referral source, nothing else', () => {
    expect(sql).toMatch(/ALTER TABLE "referral_partner" ADD COLUMN "share_code" text;/)
    expect(sql).toMatch(/ALTER TABLE "clinic_profile" ADD COLUMN "referral_source" text;/)
    expect(sql).toMatch(/"referral_partner_share_code_unique" UNIQUE\("share_code"\)/)
    expect(sql).not.toMatch(/DROP|CREATE TABLE/)
  })
})
