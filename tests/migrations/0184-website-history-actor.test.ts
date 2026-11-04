import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Migration 0184 — who made a website edit (2026-11-03). */
const DIR = join(process.cwd(), 'lib/db/migrations')

describe('0184_website_history_actor', () => {
  const sql = readFileSync(join(DIR, '0184_website_history_actor.sql'), 'utf8')

  it('adds a nullable actor_user_id that set-nulls with the user', () => {
    expect(sql).toMatch(/ALTER TABLE "website_edit_history" ADD COLUMN "actor_user_id" text;/)
    expect(sql).not.toMatch(/"actor_user_id" text NOT NULL/)
    expect(sql).toMatch(/FOREIGN KEY \("actor_user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE set null/)
    expect(sql).not.toMatch(/DROP|clinic_profile/)
  })

  it('is registered in the journal under its tag, with a snapshot', () => {
    const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
    expect(journal.entries.some((e) => e.tag === '0184_website_history_actor')).toBe(true)
    expect(readFileSync(join(DIR, 'meta/0184_snapshot.json'), 'utf8')).toContain('actor_user_id')
  })
})
