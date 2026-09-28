import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'

/**
 * THE REPLAY READ AND THE EMAIL STAMP, RENDERED FOR REAL (DREAMCRM-106).
 *
 * The sibling behaviour test mocks `@/lib/db` and models the conflict in
 * JavaScript. That is the right way to assert the RESULT and completely blind
 * to the `WHERE` — a mocked db answers every predicate with the same canned
 * rows, so widening one, dropping the tenant half, or keying the stamp on the
 * wrong column all stay green (§2d, "render the SQL when the defect lives in
 * the predicate"; the shape that shipped a 42P18 in the autonomy write).
 *
 * Both statements this file is about are predicate-shaped and both are keyed on
 * a PERSON:
 *
 *   - the replay read asks "which row did my insert collide with?" and must
 *     answer with THIS recipient's row. `notifications_user_dedupe_idx` is
 *     unique on (user_id, dedupe_key), so dropping the `user_id` half reads
 *     somebody else's notification — and then decides, from THEIR delivery
 *     state, whether to email THIS person. That is a cross-user read in a
 *     module that fans one event out to every owner and admin of an org.
 *   - the stamp writes "this row's email went out" and must write it to the
 *     row the read returned.
 *
 * BOUNDARY, per §2d: this proves the SQL we RENDER, not the rows Postgres
 * RETURNS. It cannot see a type coercion, NULL semantics, a collation or a
 * missing index, and it is no substitute for the behaviour test beside it when
 * the defect is in the DATA.
 */

const captured: Array<{ sql: string; params: unknown[] }> = []
/** Rows the INSERT … RETURNING hands back. `[]` is the ON CONFLICT path. */
let insertRows: unknown[][] = [[1]]
/** Rows the replay SELECT hands back: [id, email_sent_at]. */
let existingRows: unknown[][] = [[7, null]]

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const db = drizzle(async (sql, params, method) => {
    captured.push({ sql, params })
    if (/^insert/i.test(sql)) return { rows: method === 'all' ? insertRows : [] }
    // The only read from `notifications` in this path is the replay read.
    if (/from "notifications"/i.test(sql)) return { rows: method === 'all' ? existingRows : [] }
    // The recipient's address, or the email is never attempted and the stamp
    // this file is about never renders.
    if (/from "user"/i.test(sql)) return { rows: [['owner@dreamcreateweb.com', 'Dustin']] }
    // Prefs: an empty result is DEFAULT_PREFS, and `forceEmail` above carries
    // every case here past the mode check regardless.
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
  forceEmail: true,
}

const find = (re: RegExp) => captured.find((c) => re.test(c.sql))

beforeEach(() => {
  captured.length = 0
  insertRows = [[1]]
  existingRows = [[7, null]]
})

describe('the replay read, as Postgres parses it', () => {
  it('keys on BOTH halves of the unique index — the recipient and the scoped key', async () => {
    insertRows = [] // the insert conflicted
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    const read = find(/^select .*from "notifications"/i)
    expect(read, 'the conflict branch must read the row it collided with').toBeTruthy()

    // The clause, not a golden string. Dropping either half reads a row that
    // belongs to somebody else and decides this person's email from it.
    expect(read!.sql).toMatch(/"notifications"\."user_id" = \$\d/i)
    expect(read!.sql).toMatch(/"notifications"\."dedupe_key" = \$\d/i)
    // And the values it binds are this recipient and the TYPE-scoped key —
    // the scoping that lets one event still say two different things.
    expect(read!.params).toContain('u1')
    expect(read!.params).toContain('stripe:evt_1#payment_failed')
  })

  it('asks for the delivery state, which is the only reason the read exists', async () => {
    insertRows = []
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    expect(find(/^select .*from "notifications"/i)!.sql).toMatch(/"email_sent_at"/i)
  })

  it('does not run at all when the insert won the race', async () => {
    // No conflict, no replay read — the extra round trip is paid only on the
    // path that needs it.
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    expect(find(/^select .*from "notifications"/i)).toBeUndefined()
  })
})

describe('the email stamp, as Postgres parses it', () => {
  it('sets email_sent_at on the row the dispatch owns, by id', async () => {
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    const stamp = find(/^update "notifications"/i)
    expect(stamp, 'a landed send must be recorded, or every replay re-emails').toBeTruthy()
    expect(stamp!.sql).toMatch(/set "email_sent_at" = \$\d/i)
    expect(stamp!.sql).toMatch(/where "notifications"\."id" = \$\d/i)
    expect(stamp!.params).toContain(1) // the id the INSERT … RETURNING handed back
  })

  it('stamps the EXISTING row on a replay, not a fresh one', async () => {
    insertRows = []
    existingRows = [[7, null]]

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    const stamp = find(/^update "notifications"/i)
    expect(stamp).toBeTruthy()
    // 7, from the replay read — not 1 from a RETURNING that yielded nothing.
    expect(stamp!.params).toContain(7)
  })

  it('renders exactly one UPDATE per dispatch', async () => {
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    expect(captured.filter((c) => /^update "notifications"/i.test(c.sql))).toHaveLength(1)
  })
})
