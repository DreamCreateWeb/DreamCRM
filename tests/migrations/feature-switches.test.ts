import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0172 — the feature switches (docs/ACTIVATION.md S3). Pins the
 * seven nullable columns, the grandfather backfill for the five day-to-day
 * modules on EVERY existing clinic, and the Payments/Shop backfill keyed on
 * the payments bundle's own signal (so no clinic sees a money page it did
 * not see yesterday). Nothing else moves; new clinics start null.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0172_feature_switches', () => {
  const sql = readFileSync(join(DIR, '0172_feature_switches.sql'), 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)

  it('adds the seven nullable timestamp columns and nothing else structural', () => {
    const adds = statements.filter((s) => /^ALTER TABLE/i.test(s))
    expect(adds).toHaveLength(7)
    for (const col of ['my_day', 'followups', 'leads', 'intake_forms', 'growth', 'payments', 'shop']) {
      expect(adds.some((s) => s.includes(`ADD COLUMN "${col}_enabled_at" timestamp`)), col).toBe(true)
    }
    expect(sql).not.toMatch(/NOT NULL|DEFAULT now\(\)|DROP|CREATE INDEX/i)
  })

  it('grandfathers every existing clinic ON for the five day-to-day modules', () => {
    const grand = statements.find((s) => /^UPDATE "clinic_profile" SET\s+"my_day_enabled_at"/i.test(s))
    expect(grand).toBeTruthy()
    for (const col of ['my_day', 'followups', 'leads', 'intake_forms', 'growth']) expect(grand).toContain(`"${col}_enabled_at" = now()`)
    expect(grand).not.toMatch(/WHERE/i)
    expect(grand).not.toContain('payments_enabled_at')
  })

  it('opens Payments + Shop only where the payments bundle was already active', () => {
    const money = statements.find((s) => s.includes('"payments_enabled_at" = now()'))
    expect(money).toBeTruthy()
    expect(money).toContain('"shop_enabled_at" = now()')
    expect(money).toMatch(/WHERE EXISTS[\s\S]*"shop_config"/)
    expect(money).toContain(`"stripe_account_status" <> 'none'`)
    expect(money).toContain('"storefront_enabled" = 1')
    expect(money).toContain('"membership_enabled" = 1')
    expect(money).not.toContain('insurance_enabled_at')
  })

  it('is registered in the journal under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    const entry = journal.entries.find((e) => e.idx === 172)
    expect(entry?.tag).toBe('0172_feature_switches')
  })
})
