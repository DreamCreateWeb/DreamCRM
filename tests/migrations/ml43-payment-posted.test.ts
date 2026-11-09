import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-43 — `patient_balance_payment.posted_at` + `posted_by_user_id`. Found by
 * TAG (the integrator renumbers); asserts only its own statements.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ tag: string }>
}

describe('ml43_payment_posted', () => {
  const entry = journal.entries.find((e) => e.tag.endsWith('_ml43_payment_posted'))

  it('is registered in the journal by tag', () => {
    expect(entry).toBeDefined()
  })

  it('adds two nullable columns and nothing else', () => {
    const sql = readFileSync(join(DIR, `${entry!.tag}.sql`), 'utf8')
    expect(sql).toMatch(/ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_at" timestamp(?! NOT NULL)/)
    expect(sql).toMatch(/ALTER TABLE "patient_balance_payment" ADD COLUMN "posted_by_user_id" text(?! NOT NULL)/)
    expect(sql).not.toMatch(/NOT NULL|DROP|DELETE|UPDATE /)
  })
})
