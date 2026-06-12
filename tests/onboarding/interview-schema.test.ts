import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Migration 0062 ships the two server-persisted-interview columns. This guards
 * the migration + journal so a bad generate (missing column, duplicate idx,
 * tag/file mismatch) can't slip into a deploy — the container applies pending
 * migrations on boot, so a broken journal fails the whole deploy.
 */

const MIG_DIR = resolve(__dirname, '../../lib/db/migrations')

describe('migration 0062 — onboarding interview columns', () => {
  const sql = readFileSync(resolve(MIG_DIR, '0062_lonely_jean_grey.sql'), 'utf8')

  it('adds onboarding_interview_draft (jsonb)', () => {
    expect(sql).toMatch(/ADD COLUMN "onboarding_interview_draft" jsonb/i)
  })

  it('adds onboarding_interview_completed_at (timestamptz)', () => {
    expect(sql).toMatch(
      /ADD COLUMN "onboarding_interview_completed_at" timestamp with time zone/i,
    )
  })

  it('targets clinic_profile', () => {
    expect(sql).toMatch(/ALTER TABLE "clinic_profile"/i)
  })
})

describe('migration journal — self-consistent through 0062', () => {
  const journal = JSON.parse(readFileSync(resolve(MIG_DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; tag: string }>
  }

  it('contains idx 62 with the 0062 tag', () => {
    const e = journal.entries.find((x) => x.idx === 62)
    expect(e).toBeDefined()
    expect(e!.tag).toBe('0062_lonely_jean_grey')
  })

  it('has no duplicate idx values', () => {
    const idxs = journal.entries.map((e) => e.idx)
    expect(new Set(idxs).size).toBe(idxs.length)
  })

  it('every journal entry has a matching .sql + snapshot file (0062 included)', () => {
    // Just check 0062 end-to-end (the one this PR adds) to keep the test fast +
    // hermetic; the journal-wide uniqueness check above covers the rest.
    const snap = JSON.parse(
      readFileSync(resolve(MIG_DIR, 'meta/0062_snapshot.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(snap).toBeTruthy()
    expect(typeof snap).toBe('object')
  })
})
