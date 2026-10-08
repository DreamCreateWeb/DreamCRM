import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0179 — the Full breakdown's `billed_checks` on
 * insurance_verification: NOT NULL with a default of 1 so every existing
 * row keeps counting as the one check it was, and nothing else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0179_full_breakdown', () => {
  const sql = readFileSync(join(DIR, '0179_full_breakdown.sql'), 'utf8')

  it('adds billed_checks with a default of one, not null', () => {
    expect(sql).toMatch(/ALTER TABLE "insurance_verification" ADD COLUMN "billed_checks" integer DEFAULT 1 NOT NULL;/)
    expect(sql).not.toMatch(/DROP|CREATE TABLE/)
  })

  it('is registered in the journal under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    expect(journal.entries.find((e) => e.idx === 179)?.tag).toBe('0179_full_breakdown')
  })
})
