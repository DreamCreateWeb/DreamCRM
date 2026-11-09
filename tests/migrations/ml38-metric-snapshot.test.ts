import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-38 — the daily metrics snapshot table. Pinned by TAG (the integrator
 * renumbers) and asserting only its own statements.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_metric_snapshot_clinic_closure_email_wanted_at.sql'))!

describe('ml38_metric_snapshot', () => {
  const sql = readFileSync(join(DIR, file), 'utf8')

  it('creates the table with a NULLABLE org (platform rows) and a NOT NULL value (a gap is a gap)', () => {
    expect(sql).toMatch(/CREATE TABLE "metric_snapshot"/)
    expect(sql).toMatch(/"organization_id" text,/)
    expect(sql).toMatch(/"value" numeric\(20, 2\) NOT NULL/)
    for (const col of ['metric', 'bucket', 'granularity', 'detail', 'captured_at']) expect(sql, col).toContain(`"${col}"`)
    expect(sql).toMatch(/FOREIGN KEY \("organization_id"\) REFERENCES "public"\."organization"\("id"\) ON DELETE cascade/)
  })

  it('keeps ONE row per org+metric+bucket+granularity, and the platform rows their own partial key', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "metric_snapshot_org_uq" ON "metric_snapshot" USING btree \("organization_id","metric","bucket","granularity"\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX "metric_snapshot_platform_uq" ON "metric_snapshot" USING btree \("metric","bucket","granularity"\) WHERE "metric_snapshot"\."organization_id" IS NULL/)
  })

  it('indexes the series read (org, metric, bucket desc)', () => {
    expect(sql).toMatch(/CREATE INDEX "metric_snapshot_org_metric_bucket_idx" ON "metric_snapshot" USING btree \("organization_id","metric","bucket" DESC/)
  })

  it('drops nothing of its own (the file is shared with other slices — 0188 regenerated on the merged schema)', () => {
    const own = sql.split('--> statement-breakpoint').filter((st) => st.includes('"metric_snapshot"'))
    expect(own.length).toBeGreaterThan(0)
    expect(own.join('\n')).not.toMatch(/DROP /)
  })

  it('is registered in the journal', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(journal.entries.some((e) => e.tag.endsWith('_metric_snapshot_clinic_closure_email_wanted_at'))).toBe(true)
  })
})
