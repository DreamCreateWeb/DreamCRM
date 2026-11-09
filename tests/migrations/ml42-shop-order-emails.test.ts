import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-42 — the shop order emails' idempotency keys, pinned by TAG (the
 * integrator renumbers): two nullable timestamps on shop_order, nothing else.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('ml42_shop_order_emails', () => {
  const file = readdirSync(DIR).find((f) => f.endsWith('_ml42_shop_order_emails.sql'))
  const sql = file ? readFileSync(join(DIR, file), 'utf8') : ''
  const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)

  it('adds exactly the two nullable claim columns', () => {
    expect(file).toBeTruthy()
    expect(statements).toHaveLength(2)
    expect(sql).toMatch(/ALTER TABLE "shop_order" ADD COLUMN "ready_email_at" timestamp;/)
    expect(sql).toMatch(/ALTER TABLE "shop_order" ADD COLUMN "shipped_email_at" timestamp;/)
    expect(sql).not.toMatch(/NOT NULL/)
  })
})
