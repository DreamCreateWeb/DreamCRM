import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A NOTIFICATION THAT CAN BE DISPATCHED TWICE IS WRITTEN ONCE (DREAMCRM-89).
 *
 * `notify()` inserts a fresh row per call, which is right for nearly everything
 * — a second "Sarah replied" IS a second notification. It is wrong for a
 * dispatch that can be REPLAYED for one real-world event: the platform Stripe
 * webhook releases its event claim when a handler throws so Stripe's retry
 * re-processes, and the claim is fail-open, so a delivery whose ledger write
 * errored is processed with nothing recorded at all. Either way the handler
 * re-runs from the top and every platform owner is told a second time that a
 * clinic's payment failed.
 *
 * `dedupeKey` is the at-most-once contract. What it has to cover, and what each
 * test below pins: the row, the live push, AND the email — a replay that
 * re-emailed would be the same defect one channel over.
 */
const state: {
  selectQueue: unknown[][]
  inserts: Array<Record<string, unknown>>
  /** Rows the deduped insert's RETURNING hands back — [] models a conflict. */
  insertReturns: unknown[][]
  emails: unknown[]
  pushes: unknown[]
} = { selectQueue: [], inserts: [], insertReturns: [], emails: [], pushes: [] }

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
          // Both paths read the inserted id back: the deduped one through
          // .onConflictDoNothing().returning(), the plain one directly, since
          // the email stamp is keyed on it (DREAMCRM-106). One object serves
          // both.
          const result: any = {
            returning: async () => state.insertReturns.shift() ?? [{ id: 1 }],
          }
          result.onConflictDoNothing = () => ({
            returning: async () => state.insertReturns.shift() ?? [{ id: 1 }],
          })
          return result
        },
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
    schema: {
      notifications: { id: 'id', userId: 'user_id', dedupeKey: 'dedupe_key', emailSentAt: 'email_sent_at' },
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

/** Prefs that both surface the bell row AND send the email, so a duplicate
 *  would be visible on both channels. */
function queueLoudPrefs() {
  state.selectQueue.push([
    { comments: true, candidates: true, offers: true, emailMode: 'all', pushNothing: false },
  ])
  state.selectQueue.push([{ email: 'owner@dreamcreateweb.com', name: 'Dustin' }])
}

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.insertReturns.length = 0
  state.emails.length = 0
  state.pushes.length = 0
})

describe('notify() with a dedupeKey', () => {
  it('delivers the first dispatch in full — row, live push and email', async () => {
    queueLoudPrefs()
    state.insertReturns.push([{ id: 1 }])

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.inserts).toHaveLength(1)
    expect(state.pushes).toHaveLength(1)
    expect(state.emails).toHaveLength(1)
  })

  it('a REPLAY writes nothing, pushes nothing and emails nothing', async () => {
    queueLoudPrefs()
    // The insert conflicted: this event already notified this recipient.
    state.insertReturns.push([])

    await notify({ ...BASE, dedupeKey: 'stripe:evt_1' })

    expect(state.pushes).toHaveLength(0)
    // The email is the half a row-count check would miss — a second "your
    // clinic's payment failed" in the owner's inbox is the visible defect.
    expect(state.emails).toHaveLength(0)
  })

  it('scopes the stored key by notification TYPE, so one event can still say two things', async () => {
    queueLoudPrefs()
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1', type: 'payment_failed' })
    queueLoudPrefs()
    await notify({ ...BASE, dedupeKey: 'stripe:evt_1', type: 'clinic_signup' })

    const keys = state.inserts.map((i) => i.dedupeKey)
    expect(keys).toEqual(['stripe:evt_1#payment_failed', 'stripe:evt_1#clinic_signup'])
    // Same event id, different notification — two rows, not one swallowed.
    expect(new Set(keys).size).toBe(2)
  })

  it('leaves an ordinary notification alone — no key stored, no conflict clause', async () => {
    queueLoudPrefs()
    await notify({ ...BASE, type: 'inbox_message' })
    queueLoudPrefs()
    await notify({ ...BASE, type: 'inbox_message' })

    // A second message from the same patient IS a second notification.
    expect(state.inserts).toHaveLength(2)
    expect(state.inserts[0].dedupeKey).toBeNull()
    expect(state.emails).toHaveLength(2)
  })
})
