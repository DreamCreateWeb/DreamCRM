import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * H1 — the Huddle's switch (docs/daily-tools.md). Pinned BY TAG: the
 * integrator regenerates one sequential migration per PR on the merged
 * schema, so the number may move; the tag and this one statement must not.
 *
 * NO BACKFILL is the decision being pinned, not an omission: a clinic that
 * was live before the Huddle existed gets its door from the daily
 * activation reconcile (tests/first-week/activation-reconcile.test.ts),
 * which honors a door a person closed. An UPDATE here would not.
 */

const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_h1_huddle_switch.sql'))

describe('h1_huddle_switch (by tag)', () => {
  it('adds the one nullable switch column — and writes to no row', () => {
    expect(file).toBeTruthy()
    const sql = readFileSync(join(DIR, file!), 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((st) =>
        st
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim(),
      )
      .filter(Boolean)
    expect(statements).toEqual(['ALTER TABLE "clinic_profile" ADD COLUMN "huddle_enabled_at" timestamp;'])
    expect(sql).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/)
  })

  it('is registered in the journal by tag, after p04', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    const tags = j.entries.map((e) => e.tag)
    const h1 = tags.findIndex((t) => t.endsWith('_h1_huddle_switch'))
    const p04 = tags.findIndex((t) => t.endsWith('_p04_prospect_fit'))
    expect(h1).toBeGreaterThan(-1)
    expect(h1).toBeGreaterThan(p04)
  })
})
