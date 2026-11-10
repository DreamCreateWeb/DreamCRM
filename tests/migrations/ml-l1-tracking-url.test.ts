import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-L1 (ML-42b) — shop_order.tracking_url: the carrier's tracking link,
 * nullable (every older order has none). Found BY TAG, never by number: the
 * integrator renumbers the file sequentially, and only this one ALTER is
 * asserted (never the whole file).
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('mlL1_tracking_url', () => {
  const file = readdirSync(DIR).find((f) => f.endsWith('_mlL1_tracking_url.sql'))
  it('exists and adds the nullable tracking_url column to shop_order', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8')
    expect(sql).toMatch(/ALTER TABLE "shop_order" ADD COLUMN "tracking_url" text;/)
    expect(sql).not.toMatch(/"tracking_url" text NOT NULL/)
  })
})
