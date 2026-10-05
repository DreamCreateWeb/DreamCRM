import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0170 — the owner's ruling that EVERY clinic meets the intro
 * card: the switch 0169 backfilled is cleared everywhere, nothing else is
 * touched, and the journal carries the entry (a hand-written custom
 * migration is the one kind drizzle's generator does not pin for us).
 */
const DIR = join(__dirname, '../../lib/db/migrations')

describe('0170_insurance_switch_reset', () => {
  const sql = readFileSync(join(DIR, '0170_insurance_switch_reset.sql'), 'utf8')
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && l.trim() !== '')
    .join('\n')

  it('clears insurance_enabled_at for every clinic and does nothing else', () => {
    expect(statements).toMatch(/UPDATE "clinic_profile" SET "insurance_enabled_at" = NULL/)
    expect(statements).not.toMatch(/ALTER|DROP|DELETE|INSERT/i)
    // No org-specific carve-out: the rule is "everybody meets the intro".
    expect(statements).not.toMatch(/is_demo|organization_id/)
  })

  it('is in the journal, after 0169', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    const i169 = journal.entries.findIndex((e) => e.tag === '0169_insurance_enabled_at')
    const i170 = journal.entries.findIndex((e) => e.tag === '0170_insurance_switch_reset')
    expect(i169).toBeGreaterThan(-1)
    expect(i170).toBe(i169 + 1)
  })
})
