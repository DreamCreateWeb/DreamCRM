import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0173 — `pms_connect_request` (docs/ACTIVATION.md S4). Pins the
 * table, the org cascade, the ONE-row-per-clinic unique index, the
 * default status, and that nothing else moves.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0173_pms_connect_request', () => {
  const sql = readFileSync(join(DIR, '0173_pms_connect_request.sql'), 'utf8')

  it('creates the table with the request’s columns and a requested default', () => {
    expect(sql).toMatch(/CREATE TABLE "pms_connect_request"/)
    for (const col of ['vendor', 'vendor_name', 'practice_name_in_pms', 'contact_name', 'contact_email', 'contact_phone', 'best_time', 'notes', 'status', 'requested_by_user_id']) {
      expect(sql, col).toContain(`"${col}"`)
    }
    expect(sql).toMatch(/"status" text DEFAULT 'requested' NOT NULL/)
  })

  it('cascades with the organization, set-nulls the requester, and keeps one row per clinic', () => {
    expect(sql).toMatch(/REFERENCES "public"\."organization"\("id"\) ON DELETE cascade/)
    expect(sql).toMatch(/REFERENCES "public"\."user"\("id"\) ON DELETE set null/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX "pms_connect_request_org_uq" ON "pms_connect_request" USING btree \("organization_id"\)/)
    expect(sql).not.toMatch(/ALTER TABLE "clinic_profile"|DROP/)
  })

  it('is registered in the journal under its name', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    expect(journal.entries.find((e) => e.idx === 173)?.tag).toBe('0173_pms_connect_request')
  })
})
