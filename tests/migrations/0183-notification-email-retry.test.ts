import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0183 — the notification re-drive's two columns (ML-32):
 * `email_attempts` (how many times the sweep re-tried the email, NOT NULL
 * with a 0 default so every existing row reads "never re-tried"),
 * `email_last_error` (the provider's last word, nullable), and the partial
 * index the sweep's window query rides — on `created_at`, over unsent rows
 * only. Additive: nothing is dropped, no other table moves.
 *
 * Pinned by NAME and found in the journal by TAG, never as the last entry:
 * sibling slices generate their own migrations against the same base and the
 * integrator re-sequences them on the merged schema.
 */
const DIR = join(process.cwd(), 'lib/db/migrations')
const TAG = '0183_notification_email_retry'

describe(TAG, () => {
  const sql = readFileSync(join(DIR, `${TAG}.sql`), 'utf8')

  it('adds the attempt count (NOT NULL, default 0), the last error, and the unsent-window index', () => {
    expect(sql).toMatch(/ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL/)
    expect(sql).toMatch(/ALTER TABLE "notifications" ADD COLUMN "email_last_error" text;/)
    expect(sql).toMatch(
      /CREATE INDEX "notifications_email_unsent_idx" ON "notifications" USING btree \("created_at"\) WHERE "notifications"\."email_sent_at" is null/,
    )
  })

  it('touches nothing else — additive on one table, no drops', () => {
    expect(sql).not.toMatch(/DROP/)
    expect(sql).not.toMatch(/ALTER TABLE "(?!notifications")/)
    expect(sql).not.toMatch(/CREATE TABLE/)
  })

  it('is registered in the journal under its tag', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    const entry = journal.entries.find((e) => e.tag === TAG)
    expect(entry, `${TAG} is not in the journal`).toBeTruthy()
    expect(entry!.idx).toBe(183)
  })
})
