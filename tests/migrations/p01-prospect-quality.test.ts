import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P-01 — prospect verification + quality. Pinned BY TAG: the integrator
 * regenerates one sequential migration per PR on the merged schema, so the
 * number may move; the tag and the prospect statements must not.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_p01_prospect_quality.sql'))

describe('p01_prospect_quality (by tag)', () => {
  it('adds the verification + quality + phone-standing columns and the quality index — nothing else on prospect', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8').trim()
    const own = sql
      .split('--> statement-breakpoint')
      .map((st) => st.trim())
      .filter((st) => st.includes('"prospect"'))
    expect(own).toEqual([
      'ALTER TABLE "prospect" ADD COLUMN "verification" jsonb;',
      'ALTER TABLE "prospect" ADD COLUMN "verified_at" timestamp with time zone;',
      'ALTER TABLE "prospect" ADD COLUMN "quality_score" integer;',
      'ALTER TABLE "prospect" ADD COLUMN "quality_band" text;',
      'ALTER TABLE "prospect" ADD COLUMN "quality_reasons" jsonb;',
      'ALTER TABLE "prospect" ADD COLUMN "phone_status" text;',
      'ALTER TABLE "prospect" ADD COLUMN "phone_line_type" text;',
      'ALTER TABLE "prospect" ADD COLUMN "phone_source" text;',
      'ALTER TABLE "prospect" ADD COLUMN "phone_validated_at" timestamp with time zone;',
      'CREATE INDEX "idx_prospect_quality" ON "prospect" USING btree ("quality_band","quality_score");',
    ])
  })
  it('is registered in the journal by tag', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(j.entries.some((e) => e.tag.endsWith('_p01_prospect_quality'))).toBe(true)
  })
})
