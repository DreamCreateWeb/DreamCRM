import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0176 — the doors_closed backfill (phase-audit round 3). 0175
 * added the memory with no backfill while the openers now run on every
 * occurrence, so a "Turn off" made between 0172 and 0175 would be reopened
 * by the next sync. For a GRANDFATHERED clinic (0172 set all five day-to-day
 * modules ON) a null column can only be a human close — those are recorded.
 * Nothing else is touched: no demo, no clinic created after the switches,
 * no Payments/Shop (their 0172 backfill was conditional).
 */
const DIR = join(__dirname, '../../lib/db/migrations')

describe('0176_doors_closed_backfill', () => {
  const sql = readFileSync(join(DIR, '0176_doors_closed_backfill.sql'), 'utf8')
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && l.trim() !== '')
    .join('\n')

  it('records a close for each null day-to-day switch, on grandfathered real clinics only', () => {
    expect(statements).toMatch(/^UPDATE "clinic_profile" cp/m)
    expect(statements).toMatch(/SET "doors_closed" = coalesce\(cp\."doors_closed", '\{\}'::jsonb\) \|\|/)
    for (const col of ['my_day', 'followups', 'leads', 'intake_forms', 'growth']) {
      expect(statements).toContain(`SELECT '${col}'`)
      expect(statements).toContain(`cp."${col}_enabled_at" IS NULL`)
    }
    expect(statements).not.toContain("'payments'")
    expect(statements).not.toContain("'shop'")
    expect(statements).toMatch(/o\."type" = 'clinic'/)
    expect(statements).toMatch(/o\."is_demo" = false/)
    expect(statements).toMatch(/o\."created_at" < '2026-10-06T00:00:00Z'/)
    expect(statements).not.toMatch(/ALTER|DROP|DELETE|INSERT/i)
  })

  it('is in the journal, after 0175', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    const i175 = journal.entries.findIndex((e) => e.tag === '0175_peaceful_morlun')
    const i176 = journal.entries.findIndex((e) => e.tag === '0176_doors_closed_backfill')
    expect(i175).toBeGreaterThan(-1)
    expect(i176).toBe(i175 + 1)
    expect(journal.entries[i176].idx).toBe(176)
  })
})
