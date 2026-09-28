import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A REPLAY RE-ATTEMPTS THE EMAIL THAT NEVER WENT OUT (DREAMCRM-106).
 *
 * `dedupeKey` (DREAMCRM-89 / #651) made a replayable notification at-most-once
 * per (recipient, key) by returning at the ON CONFLICT. That was right for the
 * bell row and it collapsed two different states into one answer: a replay
 * whose email had already landed, and a replay whose email had FAILED, were
 * indistinguishable, and both got silence.
 *
 * The failing state is reachable, not theoretical. The row commits first; the
 * email is a network call after it; ANY email failure lands in `notify()`'s own
 * catch; and `deliver()` carries a 10s deadline (#649) that turns a merely slow
 * provider into a throwing one. Stripe's retry then arrived, conflicted, and
 * returned — so the "payment failed" / "subscription cancelled" mail to every
 * platform owner was gone for good where, before #651, it would have been
 * re-sent.
 *
 * `notifications.email_sent_at` is the state that tells the two apart. What
 * each test below pins:
 *
 *   - the stamp is written only after the send RESOLVES;
 *   - a replay with a NULL stamp emails again and writes NO second row;
 *   - a replay with a stamp does nothing at all, on every channel;
 *   - the live push fires for the dispatch that WROTE the row and no other.
 *
 * WATCHED TO FAIL against the real defect: reverting `notify()`'s conflict
 * branch to `if (inserted.length === 0) return` reddens the two tests that
 * matter here by name.
 */
const state: {
  selectQueue: unknown[][]
  inserts: Array<Record<string, unknown>>
  /** Rows the deduped insert's RETURNING hands back — [] models a conflict. */
  insertReturns: unknown[][]
  updates: Array<Record<string, unknown>>
  emails: unknown[]
  pushes: unknown[]
  /** Set to make `sendNotificationEmail` throw, the way a provider failure
   *  or `deliver()`'s deadline does. */
  emailThrows: boolean
} = {
  selectQueue: [],
  inserts: [],
  insertReturns: [],
  updates: [],
  emails: [],
  pushes: [],
  emailThrows: false,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          state.inserts.push(values)
          // Both paths return the inserted id now: the deduped one through
          // .onConflictDoNothing().returning(), the plain one directly.
          const result: any = {
            returning: async () => state.insertReturns.shift() ?? [{ id: 1 }],
          }
          result.onConflictDoNothing = () => ({
            returning: async () => state.insertReturns.shift() ?? [{ id: 1 }],
          })
          return result
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(values)
          },
        }),
      }),
    },
    schema: {
      notifications: {
        id: 'id',
        userId: 'user_id',
        dedupeKey: 'dedupe_key',
        emailSentAt: 'email_sent_at',
      },
      notificationPrefs: {
        userId: 'user_id',
        comments: 'comments',
        candidates: 'candidates',
        offers: 'offers',
        emailMode: 'emailMode',
        pushNothing: 'pushNothing',
      },
      user: { id: 'id', email: 'email', name: 'name' },
      member: { userId: 'member_user_id', organizationId: 'member_org_id', role: 'role' },
      organization: { id: 'id', isDemo: 'is_demo' },
    },
  }
})
vi.mock('@/lib/services/realtime', () => ({
  publishRealtime: vi.fn(async (...args: unknown[]) => {
    state.pushes.push(args)
  }),
}))
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(async (input: unknown) => {
    if (state.emailThrows) {
      // The real shape: `deliver()` remaps a provider failure and throws its
      // deadline error, and `sendNotificationEmail` does not catch either.
      throw new Error('The email service didn’t respond in time, so this message hasn’t gone out.')
    }
    state.emails.push(input)
  }),
}))

import { notify } from '@/lib/services/notifications'

const BASE = {
  userId: 'u1',
  organizationId: 'o1',
  bucket: 'comments' as const,
  type: 'payment_failed',
  title: 'Payment failed',
  body: 'A clinic failed to pay $200.00 USD.',
  linkPath: '/ecommerce/invoices',
}

/**
 * `notify()` asks the database up to three questions, in this order: the
 * recipient's prefs, then (ONLY on the conflict branch) the existing row, then
 * (only when an email is owed) the recipient's address. Each helper queues one
 * answer, and every test composes them in that order rather than splicing into
 * a shared queue — the order IS part of what these tests pin.
 */
const LOUD_PREFS = { comments: true, candidates: true, offers: true, emailMode: 'all', pushNothing: false }

/** Prefs that both surface the bell row AND send the email, so a miss on
 *  either channel is visible. */
function queuePrefs(over: Record<string, unknown> = {}) {
  state.selectQueue.push([{ ...LOUD_PREFS, ...over }])
}
/** The row an ON CONFLICT collided with. `[]` models it being GONE — which
 *  the conflict proves is a race, not the ordinary case: the row was deleted
 *  between the insert and this read. */
function queueExistingRow(row: { id: number; emailSentAt: Date | null } | null) {
  state.selectQueue.push(row ? [row] : [])
}
function queueRecipient() {
  state.selectQueue.push([{ email: 'owner@dreamcreateweb.com', name: 'Dustin' }])
}

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.insertReturns.length = 0
  state.updates.length = 0
  state.emails.length = 0
  state.pushes.length = 0
  state.emailThrows = false
})

describe('per-channel delivery state on a replayable notification', () => {
  it('stamps email_sent_at once the send resolves, on the first dispatch', async () => {
    queuePrefs()
    queueRecipient()
    state.insertReturns.push([{ id: 7 }])

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(1)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].emailSentAt).toBeInstanceOf(Date)
  })

  it('leaves email_sent_at NULL when the send throws — which is what a replay reads', async () => {
    // THE STATE THE WHOLE COLUMN EXISTS FOR. The bell row is committed and the
    // email is not, and before this change nothing in the row could say so.
    queuePrefs()
    queueRecipient()
    state.insertReturns.push([{ id: 7 }])
    state.emailThrows = true

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.inserts, 'the bell row still lands — that half was never the defect').toHaveLength(1)
    expect(state.emails).toHaveLength(0)
    expect(state.updates, 'a send that threw must not be recorded as sent').toEqual([])
  })

  it('a replay whose email never went out re-attempts the EMAIL and writes no second row', async () => {
    // THE DEFECT, AS A REPLAY. Stripe re-delivers, the handler re-runs, the
    // insert conflicts — and the row it conflicted with has a NULL stamp.
    queuePrefs()
    queueExistingRow({ id: 7, emailSentAt: null })
    queueRecipient()
    state.insertReturns.push([]) // ON CONFLICT: the bell row is already there

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.inserts, 'the insert is attempted; the unique index is what refuses it').toHaveLength(1)
    expect(state.emails, 'the email that failed the first time is owed').toHaveLength(1)
    expect(state.updates[0]?.emailSentAt, 'and now it is recorded').toBeInstanceOf(Date)
  })

  it('a replay whose email DID go out does nothing, on every channel', async () => {
    queuePrefs()
    queueExistingRow({ id: 7, emailSentAt: new Date('2026-09-22T10:00:00Z') })
    queueRecipient()
    state.insertReturns.push([])

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    // A second "your clinic's payment failed" in the owner's inbox is the
    // defect #651 fixed, and nothing here may reintroduce it.
    expect(state.emails).toHaveLength(0)
    expect(state.pushes).toHaveLength(0)
    expect(state.updates).toEqual([])
  })

  it('pushes for the dispatch that WROTE the row, and not for the replay', async () => {
    queuePrefs()
    queueRecipient()
    state.insertReturns.push([{ id: 7 }])
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })
    expect(state.pushes).toHaveLength(1)

    queuePrefs()
    queueExistingRow({ id: 7, emailSentAt: null })
    queueRecipient()
    state.insertReturns.push([])
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    // No new bell row means nothing for a badge to count. The email above is
    // re-attempted; the push is not re-fired.
    expect(state.pushes, 'a replay must not make one event flash twice').toHaveLength(1)
  })

  it('does not re-mint a row that was deleted between the insert and the read', async () => {
    // The conflict PROVES a row existed; the read says it does not. So this is
    // a race and not an ordinary path (Sentinel's note on #683) — the tray
    // cleared, or a cascade delete, in the window between two statements. The
    // guard earns its place anyway: re-creating a row somebody just dismissed
    // would undo a deliberate action.
    queuePrefs()
    queueExistingRow(null)
    queueRecipient()
    state.insertReturns.push([])

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.emails).toHaveLength(0)
    expect(state.updates).toEqual([])
  })

  it('stamps an ORDINARY notification too, so the column means what it says', async () => {
    // Not a dedupe concern — an honesty one. If only keyed dispatches were
    // stamped, a NULL would mean "no email" for most of the table and "the
    // email failed" for a handful, and the next reader would have no way to
    // tell which row they were looking at.
    queuePrefs()
    queueRecipient()
    await notify({ ...BASE, type: 'inbox_message' })

    expect(state.inserts[0].dedupeKey).toBeNull()
    expect(state.emails).toHaveLength(1)
    expect(state.updates[0]?.emailSentAt).toBeInstanceOf(Date)
  })

  it('stamps nothing when no email was owed', async () => {
    // `emailMode: 'none'` — the bell row lands and NULL correctly means "no
    // email was owed" rather than "one failed".
    queuePrefs({ emailMode: 'none' })

    await notify({ ...BASE, type: 'inbox_message' })

    expect(state.inserts).toHaveLength(1)
    expect(state.emails).toHaveLength(0)
    expect(state.updates).toEqual([])
  })
})
