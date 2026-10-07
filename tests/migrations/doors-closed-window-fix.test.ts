import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0177 — the verification round's correction to 0176, whose
 * grandfather cutoff (midnight UTC Oct 6) sat ~5 hours after 0172 applied
 * (~19:05Z Oct 5): clinics born in that window had every switch null BY
 * DESIGN and 0176 wrote fake human closes for them, which every machine
 * opener then honoured. 0177 removes exactly 0176's five keys for exactly
 * that window, real clinics only, and nothing else.
 */
const DIR = join(__dirname, '../../lib/db/migrations')

describe('0177_doors_closed_window_fix', () => {
  const sql = readFileSync(join(DIR, '0177_doors_closed_window_fix.sql'), 'utf8')
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && l.trim() !== '')
    .join('\n')

  it('removes 0176’s five keys for clinics created between 0172’s merge and 0176’s cutoff, real clinics only', () => {
    expect(statements).toMatch(/^UPDATE "clinic_profile" cp/m)
    expect(statements).toMatch(/SET "doors_closed" = cp\."doors_closed" - ARRAY\['my_day','followups','leads','intake_forms','growth'\]::text\[\]/)
    expect(statements).toMatch(/o\."created_at" >= '2026-10-05T18:50:00Z'/)
    expect(statements).toMatch(/o\."created_at" < '2026-10-06T00:00:00Z'/)
    expect(statements).toMatch(/o\."type" = 'clinic'/)
    expect(statements).toMatch(/o\."is_demo" = false/)
    expect(statements).toMatch(/cp\."doors_closed" IS NOT NULL/)
    expect(statements).not.toContain("'payments'")
    expect(statements).not.toContain("'shop'")
    expect(statements).not.toMatch(/ALTER|DROP|DELETE|INSERT/i)
  })

  it('is in the journal, after 0176', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    const i176 = journal.entries.findIndex((e) => e.tag === '0176_doors_closed_backfill')
    const i177 = journal.entries.findIndex((e) => e.tag === '0177_doors_closed_window_fix')
    expect(i176).toBeGreaterThan(-1)
    expect(i177).toBe(i176 + 1)
    expect(journal.entries[i177].idx).toBe(177)
  })
})
