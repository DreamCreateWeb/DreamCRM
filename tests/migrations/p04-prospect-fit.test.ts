import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P-04 — fit and freshness. Pinned BY TAG: the integrator regenerates one
 * sequential migration per PR on the merged schema, so the number may
 * move; the tag and these two statements must not. Everything else P-04
 * stores rides existing jsonb columns (`prospect.verification` — the
 * `fit.*`, `reviews` and `phone.sources` keys; `prospect.enrichment` —
 * `stack`) and existing text columns (`suppressed_reason = 'chain'`,
 * `phone_source = corroborated | single_source`).
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_p04_prospect_fit.sql'))

describe('p04_prospect_fit (by tag)', () => {
  it('adds the territory pull stamp and its reason — nothing else', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8').trim()
    const statements = sql
      .split('--> statement-breakpoint')
      .map((st) => st.trim())
      .filter(Boolean)
    expect(statements).toEqual([
      'ALTER TABLE "prospect_discovery_task" ADD COLUMN "refresh_pulled_at" timestamp with time zone;',
      'ALTER TABLE "prospect_discovery_task" ADD COLUMN "refresh_pulled_reason" text;',
    ])
  })
  it('is registered in the journal by tag, after p03', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    const tags = j.entries.map((e) => e.tag)
    const p04 = tags.findIndex((t) => t.endsWith('_p04_prospect_fit'))
    const p03 = tags.findIndex((t) => t.endsWith('_p03_prospect_hygiene'))
    expect(p04).toBeGreaterThan(-1)
    expect(p04).toBeGreaterThan(p03)
  })
})
