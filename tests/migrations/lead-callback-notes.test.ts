import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration `lead_callback_notes` (ML-22) — THREE nullable columns on
 * `lead`: `call_back_at timestamp` (the desk's parked call-back day, stored
 * at clinic-local noon), `notes text` (the desk's own note) and
 * `followed_up_at timestamp` (when the machine's second touch went out).
 * Nothing else moves; no default, no backfill — a lead with none of them
 * reads exactly as before.
 *
 * Pinned by TAG, never by "last": the slice was cut on a parallel branch and
 * the integrator renumbers sequentially.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const TAG_SUFFIX = '_lead_callback_notes'

function findEntry() {
  const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>
  }
  const entry = journal.entries.find((e) => e.tag.endsWith(TAG_SUFFIX))
  expect(entry, `no journal entry whose tag ends with ${TAG_SUFFIX}`).toBeDefined()
  const pos = journal.entries.indexOf(entry!)
  return { journal, entry: entry!, prev: journal.entries[pos - 1] }
}

describe('lead_callback_notes', () => {
  it('adds exactly the three nullable columns to lead and touches nothing else', () => {
    const { entry } = findEntry()
    const sql = readFileSync(join(DIR, `${entry.tag}.sql`), 'utf8')
    expect(sql).toMatch(/ALTER TABLE "lead" ADD COLUMN "call_back_at" timestamp;/)
    expect(sql).toMatch(/ALTER TABLE "lead" ADD COLUMN "notes" text;/)
    expect(sql).toMatch(/ALTER TABLE "lead" ADD COLUMN "followed_up_at" timestamp;/)
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(3)
    expect(sql).not.toMatch(/NOT NULL|DEFAULT|CREATE TABLE|DROP|CREATE INDEX/)
  })

  it('is registered in the journal after its predecessor, with a later timestamp', () => {
    const { entry, prev } = findEntry()
    expect(prev).toBeDefined()
    expect(entry.idx).toBeGreaterThan(prev.idx)
    expect(entry.when).toBeGreaterThan(prev.when)
  })

  it('matches the drizzle schema and its snapshot, so the next `db:generate` has nothing to add', () => {
    const { entry } = findEntry()
    const schema = readFileSync(join(process.cwd(), 'lib/db/schema/clinic.ts'), 'utf8')
    expect(schema).toContain("callBackAt: timestamp('call_back_at')")
    expect(schema).toContain("notes: text('notes')")
    expect(schema).toContain("followedUpAt: timestamp('followed_up_at')")
    const snapshot = JSON.parse(readFileSync(join(DIR, `meta/${entry.tag.slice(0, 4)}_snapshot.json`), 'utf8')) as {
      tables: Record<string, { columns: Record<string, { type: string; notNull: boolean }> }>
    }
    const cols = snapshot.tables['public.lead'].columns
    expect(cols.call_back_at).toMatchObject({ type: 'timestamp', notNull: false })
    expect(cols.notes).toMatchObject({ type: 'text', notNull: false })
    expect(cols.followed_up_at).toMatchObject({ type: 'timestamp', notNull: false })
  })
})
