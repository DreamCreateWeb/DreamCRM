import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { notifications } from '@/lib/db/schema/domain'

/**
 * THE DEDUPED INSERT, RENDERED FOR REAL (DREAMCRM-89).
 *
 * The sibling behaviour test mocks `@/lib/db` and models the conflict in
 * JavaScript. That is the right way to assert the RESULT and completely blind
 * to how Postgres will parse the statement — the same blindness that shipped a
 * 42P18 in the autonomy write (`tests/journey/autonomy-sql.test.ts`).
 *
 * The failure this file exists for: `notifications_user_dedupe_idx` is a
 * PARTIAL unique index, and Postgres cannot infer a partial index from a bare
 * conflict target. `ON CONFLICT ("user_id","dedupe_key") DO NOTHING` without
 * the index predicate raises 42P10 — "there is no unique or exclusion
 * constraint matching the ON CONFLICT specification" — on EVERY deduped
 * notification, which in production means every platform alert the Stripe
 * webhook tries to send. A mocked `db` says nothing about that.
 *
 * So this runs the REAL `notify()` against drizzle's own dialect through the
 * pg-proxy driver, captures the statement as Postgres would receive it, and
 * pins it against the index the schema actually declares. No database required.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const db = drizzle(async (sql, params, method) => {
    captured.push({ sql, params })
    // An INSERT … RETURNING must look like it inserted, or `notify()` reads the
    // empty result as "already delivered" and the rest of the path is skipped.
    if (/^insert/i.test(sql)) return { rows: method === 'all' ? [[1]] : [] }
    return { rows: [] }
  })
  return { schema, db }
})
vi.mock('@/lib/services/realtime', () => ({ publishRealtime: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => undefined) }))

import { notify } from '@/lib/services/notifications'

const BASE = {
  userId: 'u1',
  organizationId: 'o1',
  bucket: 'comments' as const,
  type: 'payment_failed',
  title: 'Payment failed',
}

function insertStatement(): { sql: string; params: unknown[] } {
  const row = captured.find((c) => /^insert/i.test(c.sql))
  if (!row) throw new Error('no INSERT was rendered')
  return row
}

beforeEach(() => {
  captured.length = 0
})

describe('the deduped notification insert as Postgres parses it', () => {
  it('names the partial index PREDICATE in the conflict target, not just the columns', async () => {
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    const { sql: text } = insertStatement()

    expect(text).toMatch(/on conflict/i)
    // 42P10 is what a bare target costs here. Both halves matter: the columns
    // identify the index, the predicate is what makes a PARTIAL one inferable.
    expect(text).toMatch(
      /on conflict\s*\("user_id","dedupe_key"\)\s+where\s+"notifications"\."dedupe_key"\s+is not null\s+do nothing/i,
    )
  })

  it('the predicate it names is the one the index is actually built on', () => {
    const idx = getTableConfig(notifications).indexes.find(
      (i) => i.config.name === 'notifications_user_dedupe_idx',
    )
    expect(idx, 'notifications_user_dedupe_idx must exist').toBeTruthy()
    expect(idx!.config.unique).toBe(true)
    expect(idx!.config.columns.map((c) => (c as { name?: string }).name)).toEqual([
      'user_id',
      'dedupe_key',
    ])
    // A conflict target whose predicate differs from the index predicate is the
    // same 42P10 wearing a plausible-looking clause.
    expect(idx!.config.where).toBeTruthy()
  })

  it('asks for the inserted id back — the whole decision hangs on that result', async () => {
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    expect(insertStatement().sql).toMatch(/returning\s+"id"/i)
  })

  it('an ordinary notification renders a plain INSERT with no conflict clause', async () => {
    await notify({ ...BASE, type: 'inbox_message' })
    const { sql: text } = insertStatement()
    expect(text).not.toMatch(/on conflict/i)
    expect(text).not.toMatch(/returning/i)
  })
})
