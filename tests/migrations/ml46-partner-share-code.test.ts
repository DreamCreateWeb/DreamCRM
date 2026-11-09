import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-46 — pinned by TAG (the integrator renumbers): only its own statements. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml46_partner_share_code', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_partner_share_code_patient_insurance'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
  it('adds the unique share code and the referral source; its own tables lose nothing', () => {
    expect(sql).toMatch(/ALTER TABLE "referral_partner" ADD COLUMN "share_code" text;/)
    expect(sql).toMatch(/ALTER TABLE "clinic_profile" ADD COLUMN "referral_source" text;/)
    expect(sql).toMatch(/"referral_partner_share_code_unique" UNIQUE\("share_code"\)/)
    // The file is shared with the second insurance plan (0186 regenerated on the
    // merged schema) — assert only this slice's own tables.
    const own = sql.split('--> statement-breakpoint').filter((st) => /"referral_partner"|"clinic_profile"/.test(st))
    expect(own).toHaveLength(3)
    expect(own.join('\n')).not.toMatch(/DROP|CREATE TABLE/)
  })
})
