import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P-01 fixes 2 — the website's source (C10). Pinned BY TAG: the integrator
 * regenerates one sequential migration per PR on the merged schema, so the
 * number may move; the tag and the one prospect statement must not.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_p01_prospect_quality_2.sql'))

describe('p01_prospect_quality_2 (by tag)', () => {
  it('adds website_source to prospect — nothing else', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8').trim()
    const statements = sql
      .split('--> statement-breakpoint')
      .map((st) => st.trim())
      .filter(Boolean)
    expect(statements).toEqual(['ALTER TABLE "prospect" ADD COLUMN "website_source" text;'])
  })
  it('is registered in the journal by tag', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(j.entries.some((e) => e.tag.endsWith('_p01_prospect_quality_2'))).toBe(true)
  })
})
