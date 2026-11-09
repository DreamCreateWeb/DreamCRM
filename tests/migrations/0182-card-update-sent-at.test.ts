import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0182 (ML-15 + ML-18, regenerated as ONE file at integration) — `payment_plan.card_update_sent_at`: the nullable stamp
 * that says the patient was emailed the "Update my card" link after a
 * declined installment. Set on the first decline of a streak, never re-sent
 * while set, cleared by a successful charge or the card-update return trip.
 * One nullable column; nothing else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0182_card_update_followup_kind_snooze_outcome (card_update_sent_at)', () => {
  const sql = readFileSync(join(DIR, '0182_card_update_followup_kind_snooze_outcome.sql'), 'utf8')

  it('adds the nullable stamp to payment_plan (the file also carries ML-18\'s patient_followup columns) and nothing else', () => {
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
    const stamp = statements.filter((s) => s.includes('"payment_plan"'))
    expect(stamp).toHaveLength(1)
    expect(stamp[0]).toMatch(/^ALTER TABLE "payment_plan" ADD COLUMN "card_update_sent_at" timestamp;$/)
    // Nullable BY DESIGN: null = "not told yet". No default, no NOT NULL.
    expect(stamp[0]).not.toMatch(/NOT NULL|DEFAULT/)
    expect(sql).not.toMatch(/DROP|CREATE TABLE|ALTER TABLE "(?!payment_plan"|patient_followup")/)
  })

  it('is registered in the journal as idx 182 under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string; when: number }>
    }
    const entry = journal.entries.find((e) => e.idx === 182)
    expect(entry?.tag).toBe('0182_card_update_followup_kind_snooze_outcome')
    // Applied after the insurance-discovery table (0180); drizzle applies by `when`.
    const prior = journal.entries.find((e) => e.tag === '0180_insurance_discovery')
    expect(entry!.when).toBeGreaterThan(prior!.when)
  })
})
