import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0196 (ML-18) — patient_followup gains `kind` (NOT NULL, default
 * 'generic' so every existing row keeps working), `snoozed_until` and
 * `outcome` (both nullable). Purely additive.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0196_followup_kind_snooze_outcome', () => {
  const sql = readFileSync(join(DIR, '0196_followup_kind_snooze_outcome.sql'), 'utf8')

  it('adds the three columns and nothing destructive', () => {
    expect(sql).toMatch(/ADD COLUMN "kind" text DEFAULT 'generic' NOT NULL/)
    expect(sql).toMatch(/ADD COLUMN "snoozed_until" text;/)
    expect(sql).toMatch(/ADD COLUMN "outcome" text/)
    expect(sql).not.toMatch(/DROP|CREATE TABLE/)
  })

  it('is registered in the journal under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    expect(journal.entries.find((e) => e.idx === 196)?.tag).toBe('0196_followup_kind_snooze_outcome')
  })
})
