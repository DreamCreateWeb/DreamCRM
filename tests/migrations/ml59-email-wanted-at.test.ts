import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_metric_snapshot_clinic_closure_email_wanted_at.sql'))

describe('ml59_email_wanted_at (by tag)', () => {
  it('adds only email_account.wanted_at', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8').trim()
    // The file is shared with other slices (0188 regenerated on the merged schema): assert this column's own statement.
    const own = sql.split('--> statement-breakpoint').map((st) => st.trim()).filter((st) => st.includes('"email_account"'))
    expect(own).toEqual(['ALTER TABLE "email_account" ADD COLUMN "wanted_at" timestamp with time zone;'])
  })
  it('is registered in the journal by tag', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(j.entries.some((e) => e.tag.endsWith('_metric_snapshot_clinic_closure_email_wanted_at'))).toBe(true)
  })
})
