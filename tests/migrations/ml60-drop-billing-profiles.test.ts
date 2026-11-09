import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** ML-60 — pinned by TAG (the integrator renumbers): exactly the drop, nothing else. */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] }

describe('ml60_drop_billing_profiles', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml60_drop_billing_profiles'))
  it('is registered in the journal', () => expect(entry).toBeTruthy())
  const sql = entry ? readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8') : ''
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
  it('drops billing_profiles and its billing_plan enum, and NOTHING else', () => {
    expect(statements).toHaveLength(2)
    expect(statements.some((s) => /^DROP TABLE "billing_profiles"/.test(s))).toBe(true)
    expect(statements.some((s) => /^DROP TYPE "public"\."billing_plan"/.test(s))).toBe(true)
  })
})
