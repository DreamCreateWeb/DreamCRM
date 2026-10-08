import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0180 — `insurance_discovery`, the no-card search's own table:
 * org-scoped with a cascade, patient set-null, the ask as jsonb (never the
 * SSN — the column holds DiscoveryInput, whose shape has no such field),
 * the candidate cards, and an (organization_id, created_at) index for the
 * monthly allowance's count. A new empty table; nothing else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0180_insurance_discovery', () => {
  const sql = readFileSync(join(DIR, '0180_insurance_discovery.sql'), 'utf8')

  it('creates the table with its scoping, its foreign keys and the allowance index', () => {
    expect(sql).toMatch(/CREATE TABLE "insurance_discovery"/)
    expect(sql).toMatch(/"organization_id" text NOT NULL/)
    expect(sql).toMatch(/"input" jsonb NOT NULL/)
    expect(sql).toMatch(/"candidates" jsonb DEFAULT '\[\]'::jsonb NOT NULL/)
    expect(sql).toMatch(/"coverages_found" integer DEFAULT 0 NOT NULL/)
    expect(sql).toMatch(/REFERENCES "public"\."organization"\("id"\) ON DELETE cascade/)
    expect(sql).toMatch(/REFERENCES "public"\."patient"\("id"\) ON DELETE set null/)
    expect(sql).toMatch(/REFERENCES "public"\."user"\("id"\) ON DELETE set null/)
    expect(sql).toMatch(/CREATE INDEX "insurance_discovery_org_created_idx" ON "insurance_discovery" USING btree \("organization_id","created_at"\)/)
    expect(sql).not.toMatch(/"ssn"|social/i)
    expect(sql).not.toMatch(/DROP|ALTER TABLE "(?!insurance_discovery")/)
  })

  it('is registered in the journal under its name, last', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    expect(journal.entries.find((e) => e.idx === 180)?.tag).toBe('0180_insurance_discovery')
    expect(journal.entries.at(-1)?.tag).toBe('0180_insurance_discovery')
  })
})
