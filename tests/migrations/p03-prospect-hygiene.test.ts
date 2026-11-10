import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P-03 — prospect refresh, dedupe and decay. Pinned BY TAG: the integrator
 * regenerates one sequential migration per PR on the merged schema, so the
 * number may move; the tag and these three statements must not.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_p03_prospect_hygiene.sql'))

describe('p03_prospect_hygiene (by tag)', () => {
  it('adds the merge pointer, the resting memory and the territory refresh stamp — nothing else', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8').trim()
    const statements = sql
      .split('--> statement-breakpoint')
      .map((st) => st.trim())
      .filter(Boolean)
    expect(statements).toEqual([
      'ALTER TABLE "prospect" ADD COLUMN "merged_into_prospect_id" text;',
      'ALTER TABLE "prospect" ADD COLUMN "dormant_from_status" text;',
      'ALTER TABLE "prospect_discovery_task" ADD COLUMN "last_refreshed_at" timestamp with time zone;',
    ])
  })
  it('is registered in the journal by tag', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(j.entries.some((e) => e.tag.endsWith('_p03_prospect_hygiene'))).toBe(true)
  })
})
