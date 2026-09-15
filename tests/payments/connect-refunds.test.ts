import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `recordConnectRefund` — the Stripe-side refund landing in our own records.
 *
 * Before this existed, a clinic that refunded in the Stripe dashboard kept
 * reading "Paid" on its own board, and the front desk reconciled its PMS
 * ledger against a record the bank disagreed with.
 *
 * What these pin, in order of what a wrong version would cost:
 *
 *  1. A FULL refund moves a shop order to 'refunded'; a PARTIAL one must not
 *     (that would be a new lie replacing the old one).
 *  2. Balance payments and booking deposits NEVER change `status`. Their
 *     status vocabulary is pending/paid/failed and eight readers filter on
 *     'paid' — a fourth value would vanish a refunded payment out of the
 *     reconciliation list the front desk needs it in.
 *  3. THE ORDERING RULE (DREAMCRM-47). A strictly newer snapshot of the charge
 *     is believed outright, down as well as up — which is the only way a
 *     refund that later FAILED at the bank stops being recorded as money
 *     returned. Anything that cannot be ordered against what we stored falls
 *     back to the old monotonic rule, so out-of-order delivery still cannot
 *     walk a refund backwards and a replay still writes nothing.
 *  4. Every UPDATE is scoped to the organization.
 */

const state = {
  // One queued result per table lookup, in service order:
  // shop_order, patient_balance_payment, booking_deposit.
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
  updateReturns: [] as Array<Array<{ id: string }>>,
  // The `connect_refund` receipt: the upsert's values + its conflict clause.
  receipts: [] as Array<{ values: Record<string, unknown>; conflict: Record<string, unknown> | null }>,
  receiptFails: false,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy']) obj[m] = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          if (state.receiptFails) throw new Error('receipt table down')
          const entry = { values, conflict: null as Record<string, unknown> | null }
          state.receipts.push(entry)
          const self = {
            onConflictDoUpdate: async (conflict: Record<string, unknown>) => {
              entry.conflict = conflict
            },
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
          return self
        },
      }),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: (where: unknown) => ({
            returning: async () => {
              state.updates.push({ set, where })
              return state.updateReturns.shift() ?? [{ id: 'row' }]
            },
          }),
        }),
      }),
    },
    // schema.<table>.<column> resolves to '<table>.<column>' so a captured
    // condition can be read back by the column it scopes on.
    schema: new Proxy(
      {},
      { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) },
    ),
  }
})

const eqCalls: Array<{ col: unknown; val: unknown }> = []
const lteCalls: Array<{ col: unknown; val: unknown }> = []
const ltCalls: Array<{ col: unknown; val: unknown }> = []
const gtCalls: Array<{ col: unknown; val: unknown }> = []
const isNullCalls: unknown[] = []

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ _kind: 'and', conds })),
  desc: vi.fn((col: unknown) => col),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      strings.raw.reduce((out, part, i) => out + part + (i < vals.length ? String(vals[i]) : ''), ''),
    { raw: (v: string) => v },
  ),
  eq: vi.fn((col: unknown, val: unknown) => {
    eqCalls.push({ col, val })
    return { _kind: 'eq', col, val }
  }),
  lte: vi.fn((col: unknown, val: unknown) => {
    lteCalls.push({ col, val })
    return { _kind: 'lte', col, val }
  }),
  lt: vi.fn((col: unknown, val: unknown) => {
    ltCalls.push({ col, val })
    return { _kind: 'lt', col, val }
  }),
  isNull: vi.fn((col: unknown) => {
    isNullCalls.push(col)
    return { _kind: 'isNull', col }
  }),
  or: vi.fn((...conds: unknown[]) => ({ _kind: 'or', conds })),
  gt: vi.fn((col: unknown, val: unknown) => {
    gtCalls.push({ col, val })
    return { _kind: 'gt', col, val }
  }),
}))

const syncLoyalty = vi.fn(async () => 'reversed' as const)
vi.mock('@/lib/services/loyalty', () => ({
  syncLoyaltyForRefundedPayment: (...args: unknown[]) => syncLoyalty(...(args as [])),
}))

import { recordConnectRefund, planRefundWrite, listUnmatchedRefunds } from '@/lib/services/refunds'

const ORG = 'org_a'
const PI = 'pi_123'

/** No record of ours owns this charge. */
const NO_ROWS: unknown[][] = [[], [], []]

function event(over: Partial<Parameters<typeof recordConnectRefund>[0]> = {}) {
  return {
    organizationId: ORG,
    paymentIntentId: PI,
    amountRefundedCents: 5_000,
    chargeAmountCents: 5_000,
    ...over,
  }
}

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.updateReturns = []
  eqCalls.length = 0
  lteCalls.length = 0
  ltCalls.length = 0
  gtCalls.length = 0
  isNullCalls.length = 0
  syncLoyalty.mockClear()
  syncLoyalty.mockResolvedValue('reversed')
  state.receipts = []
  state.receiptFails = false
})

describe('planRefundWrite', () => {
  it('a full refund on a paid row marks it refunded (when the table allows it)', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, true)
    expect(plan).toEqual({ refundedAmountCents: 5_000, markRefunded: true, unmarkRefunded: false, clearRefundedAt: false, syncedAt: null })
  })

  it('a PARTIAL refund records the amount but never marks it refunded', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 1_500, chargeAmountCents: 5_000 }, true)
    expect(plan).toEqual({ refundedAmountCents: 1_500, markRefunded: false, unmarkRefunded: false, clearRefundedAt: false, syncedAt: null })
  })

  it('a table whose status has no "refunded" value only records the amount', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, false)
    expect(plan).toEqual({ refundedAmountCents: 5_000, markRefunded: false, unmarkRefunded: false, clearRefundedAt: false, syncedAt: null })
  })

  it('never marks a row that is not paid — pending and cancelled belong to someone else', () => {
    for (const status of ['pending', 'cancelled', 'refunded']) {
      const plan = planRefundWrite({ refundedAmountCents: 0, status }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, true)
      expect(plan?.markRefunded, status).toBe(false)
    }
  })

  it('a zero charge amount is never "fully refunded"', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 0, chargeAmountCents: 0 }, true)
    expect(plan).toBeNull()
  })

  it('a replayed event writes nothing', () => {
    expect(
      planRefundWrite({ refundedAmountCents: 5_000, status: 'refunded' }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, true),
    ).toBeNull()
  })

  it('an out-of-order SMALLER event cannot walk the total backwards', () => {
    // Stripe's amount_refunded is cumulative and delivery is unordered: the
    // $15 partial can land after the $50 total.
    const plan = planRefundWrite({ refundedAmountCents: 5_000, status: 'refunded' }, { amountRefundedCents: 1_500, chargeAmountCents: 5_000 }, true)
    expect(plan).toBeNull()
  })

  it('a second partial refund raises the recorded total', () => {
    const plan = planRefundWrite({ refundedAmountCents: 1_500, status: 'paid' }, { amountRefundedCents: 3_000, chargeAmountCents: 5_000 }, true)
    expect(plan).toEqual({ refundedAmountCents: 3_000, markRefunded: false, unmarkRefunded: false, clearRefundedAt: false, syncedAt: null })
  })
})

/**
 * THE ORDERING RULE — the failed-refund fix (DREAMCRM-47).
 *
 * Stripe decrements a charge's `amount_refunded` when a refund fails at the
 * bank. A monotonic record could never follow that down, so it kept showing
 * money returned that never left. The rule that replaces it: a STRICTLY newer
 * snapshot wins outright, ordered by Stripe's own `event.created`; anything
 * not strictly newer falls back to monotonic, unchanged.
 *
 * `T0 < T1 < T2` below are three Stripe event timestamps.
 */
const T0 = new Date('2026-09-01T10:00:00Z')
const T1 = new Date('2026-09-01T10:05:00Z')
const T2 = new Date('2026-09-03T09:00:00Z')

describe('planRefundWrite — the ordering rule', () => {
  it('a strictly NEWER snapshot may lower the total — the failed refund, un-recorded', () => {
    const plan = planRefundWrite(
      { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
      { amountRefundedCents: 0, chargeAmountCents: 5_000, observedAt: T2 },
      true,
    )
    expect(plan).toEqual({
      refundedAmountCents: 0,
      markRefunded: false,
      unmarkRefunded: true,
      clearRefundedAt: true,
      syncedAt: T2,
    })
  })

  it('a demonstrably STALE snapshot writes nothing, in either direction', () => {
    // THE HOLE (found by Sentinel reviewing #579). The monotonic fallback is
    // for pairs we CANNOT order. An event whose `created` is strictly older
    // than the watermark IS ordered — we can prove a newer snapshot already
    // decided this charge — and letting it fall through to `Math.max` put the
    // failed refund straight back on the books.
    //
    // The shape: the failure (t40) lands first, then the original refund
    // (t10) arrives late, or is simply redelivered. Stripe is at-least-once
    // and retries for three days, so the redelivery needs no misordering at
    // all.
    expect(
      planRefundWrite(
        { refundedAmountCents: 0, status: 'paid', refundSyncedAt: T2 },
        { amountRefundedCents: 5_000, chargeAmountCents: 5_000, observedAt: T1 },
        true,
      ),
      'a stale event must not RAISE the total',
    ).toBeNull()
  })

  it('...and a stale snapshot cannot re-flip a shop order to refunded', () => {
    // The status is the visible half: $50 back on the books AND the order
    // reading "Refunded", with the watermark still at t40 so nothing short of
    // a genuinely newer event would ever correct it.
    expect(
      planRefundWrite(
        { refundedAmountCents: 1_500, status: 'paid', refundSyncedAt: T2 },
        { amountRefundedCents: 5_000, chargeAmountCents: 5_000, observedAt: T1 },
        true,
      ),
    ).toBeNull()
  })

  it('an OLDER snapshot still cannot walk the total backwards', () => {
    // The $50 total was recorded from a T1 snapshot; this $15 one was taken
    // BEFORE it and arrived late. Exactly the hazard the monotonic rule exists
    // to close, and it is still closed.
    expect(
      planRefundWrite(
        { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
        { amountRefundedCents: 1_500, chargeAmountCents: 5_000, observedAt: T0 },
        true,
      ),
    ).toBeNull()
  })

  it('an EQUAL timestamp is a redelivery, and re-decides nothing', () => {
    // Stripe replays an event with the same `created`. Equal is not newer.
    expect(
      planRefundWrite(
        { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
        { amountRefundedCents: 0, chargeAmountCents: 5_000, observedAt: T1 },
        true,
      ),
    ).toBeNull()
  })

  it('no ordering key at all is the monotonic rule, exactly as before', () => {
    expect(
      planRefundWrite(
        { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
        { amountRefundedCents: 0, chargeAmountCents: 5_000 },
        true,
      ),
    ).toBeNull()
  })

  it('a row that has never been ordered takes the first snapshot that carries a key', () => {
    const plan = planRefundWrite(
      { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: null },
      { amountRefundedCents: 0, chargeAmountCents: 5_000, observedAt: T2 },
      true,
    )
    expect(plan).toMatchObject({ refundedAmountCents: 0, syncedAt: T2 })
  })

  it('a table with no "refunded" status un-marks nothing, only un-records', () => {
    const plan = planRefundWrite(
      { refundedAmountCents: 5_000, status: 'paid', refundSyncedAt: T1 },
      { amountRefundedCents: 0, chargeAmountCents: 5_000, observedAt: T2 },
      false,
    )
    expect(plan).toMatchObject({ refundedAmountCents: 0, markRefunded: false, unmarkRefunded: false })
  })

  it('never un-marks a row that is not "refunded" — we only take back our own claim', () => {
    for (const status of ['paid', 'pending', 'cancelled']) {
      const plan = planRefundWrite(
        { refundedAmountCents: 5_000, status, refundSyncedAt: T1 },
        { amountRefundedCents: 0, chargeAmountCents: 5_000, observedAt: T2 },
        true,
      )
      // Not `plan?.unmarkRefunded` alone: `undefined` from a null plan would
      // satisfy a loose check while meaning something completely different.
      expect(plan, status).not.toBeNull()
      expect(plan?.unmarkRefunded, status).toBe(false)
    }
  })

  it('a PARTIAL refund failing leaves a partial refund, not a clean slate', () => {
    // $50 refunded, then the $35 leg fails and $15 stands. The order is no
    // longer fully refunded, so it goes back to 'paid' — but the $15 stays on
    // the record, and `refundedAt` with it.
    const plan = planRefundWrite(
      { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
      { amountRefundedCents: 1_500, chargeAmountCents: 5_000, observedAt: T2 },
      true,
    )
    expect(plan).toMatchObject({ refundedAmountCents: 1_500, unmarkRefunded: true, clearRefundedAt: false })
  })

  it('a superseding snapshot writes even when the amount did not change', () => {
    // The watermark is what lets the NEXT snapshot be ordered. Leaving it
    // behind would make a later, staler event look new.
    const plan = planRefundWrite(
      { refundedAmountCents: 5_000, status: 'refunded', refundSyncedAt: T1 },
      { amountRefundedCents: 5_000, chargeAmountCents: 5_000, observedAt: T2 },
      true,
    )
    expect(plan).toMatchObject({ refundedAmountCents: 5_000, syncedAt: T2 })
  })

  it('a newer snapshot that RAISES the total still works the ordinary way', () => {
    const plan = planRefundWrite(
      { refundedAmountCents: 1_500, status: 'paid', refundSyncedAt: T1 },
      { amountRefundedCents: 5_000, chargeAmountCents: 5_000, observedAt: T2 },
      true,
    )
    expect(plan).toMatchObject({ refundedAmountCents: 5_000, markRefunded: true, unmarkRefunded: false })
  })
})

describe('recordConnectRefund — the ordering rule on the wire', () => {
  const refundedOrder = (over: Record<string, unknown> = {}) => [
    { id: 'so_1', status: 'refunded', refundedAmountCents: 5_000, refundedAt: T0, refundSyncedAt: T1, ...over },
  ]

  it('a superseding write takes the order back to paid and clears the total', async () => {
    state.selectQueue = [refundedOrder(), [], []]
    const kinds = await recordConnectRefund(event({ amountRefundedCents: 0, observedAt: T2 }))

    expect(kinds).toEqual(['shop_order'])
    expect(state.updates[0].set).toMatchObject({
      refundedAmountCents: 0,
      refundedAt: null,
      status: 'paid',
      refundSyncedAt: T2,
    })
  })

  it('...and guards on the WATERMARK, so a racing writer holding a newer one wins', async () => {
    state.selectQueue = [refundedOrder(), [], []]
    await recordConnectRefund(event({ amountRefundedCents: 0, observedAt: T2 }))

    // `refund_synced_at is null or refund_synced_at < T2` — not the amount.
    expect(ltCalls).toHaveLength(1)
    expect(String(ltCalls[0].col)).toContain('refundSyncedAt')
    expect(ltCalls[0].val).toBe(T2)
    expect(isNullCalls.map(String)).toEqual(['shopOrder.refundSyncedAt'])
    expect(lteCalls, 'the monotonic guard must NOT also be applied').toHaveLength(0)
  })

  it('an unordered write still carries the monotonic guard and leaves the watermark alone', async () => {
    state.selectQueue = [
      [{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null, refundSyncedAt: null }],
      [],
      [],
    ]
    await recordConnectRefund(event())

    expect(lteCalls).toHaveLength(1)
    expect(String(lteCalls[0].col)).toContain('refundedAmountCents')
    expect(ltCalls).toHaveLength(0)
    expect(state.updates[0].set).not.toHaveProperty('refundSyncedAt')
  })

  it('hands loyalty the LOWERED total, so points taken back come back', async () => {
    // The whole point of following the money down: the patient earned those
    // points and the refund never happened.
    state.selectQueue = [
      [],
      [{ id: 'bp_1', status: 'paid', amountCents: 5_000, refundedAmountCents: 5_000, refundedAt: T0, refundSyncedAt: T1 }],
      [],
    ]
    await recordConnectRefund(event({ amountRefundedCents: 0, observedAt: T2 }))

    expect(syncLoyalty).toHaveBeenCalledWith(ORG, 'bp_1', { amountCents: 5_000, refundedAmountCents: 0 })
  })

  it('a STALE delivery touches nothing — no write, no status flip', async () => {
    // The end-to-end shape of the hole: the row already carries the failure's
    // verdict (0 / paid / watermark t40) and the original refund is
    // redelivered from t10.
    state.selectQueue = [
      [{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null, refundSyncedAt: T2 }],
      [],
      [],
    ]

    const kinds = await recordConnectRefund(event({ amountRefundedCents: 5_000, observedAt: T1 }))

    expect(kinds).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('the receipt carries the snapshot time so it can be ordered too', async () => {
    state.selectQueue = [[], [], []]
    await recordConnectRefund(event({ amountRefundedCents: 0, observedAt: T2 }))

    expect(state.receipts[0].values).toMatchObject({ refundSyncedAt: T2 })
  })
})

describe('recordConnectRefund — shop orders', () => {
  it('a fully refunded order is marked refunded', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual(['shop_order'])
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set).toMatchObject({ status: 'refunded', refundedAmountCents: 5_000 })
    expect(state.updates[0].set.refundedAt).toBeInstanceOf(Date)
  })

  it('a partly refunded order keeps its status and records the amount', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    await recordConnectRefund(event({ amountRefundedCents: 1_500 }))
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set).not.toHaveProperty('status')
    expect(state.updates[0].set).toMatchObject({ refundedAmountCents: 1_500 })
  })

  it('keeps the FIRST refundedAt — a second partial refund does not restamp it', async () => {
    const first = new Date('2026-09-01T00:00:00Z')
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 1_500, refundedAt: first }], [], []]
    await recordConnectRefund(event({ amountRefundedCents: 3_000 }))
    expect(state.updates[0].set.refundedAt).toBe(first)
  })
})

describe('recordConnectRefund — balance payments and deposits keep their status', () => {
  it('a fully refunded balance payment records the amount and does NOT restatus', async () => {
    state.selectQueue = [[], [{ id: 'bp_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], []]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual(['balance_payment'])
    expect(state.updates).toHaveLength(1)
    // The reconciliation list filters status='paid'. A 'refunded' status here
    // would remove the row the front desk has to reverse in the PMS.
    expect(state.updates[0].set).not.toHaveProperty('status')
    expect(state.updates[0].set).toMatchObject({ refundedAmountCents: 5_000 })
  })

  it('a fully refunded booking deposit records the amount and does NOT restatus', async () => {
    state.selectQueue = [[], [], [{ id: 'bd_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }]]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual(['booking_deposit'])
    expect(state.updates[0].set).not.toHaveProperty('status')
  })
})

describe('recordConnectRefund — safety', () => {
  it('writes nothing when no record of ours owns the charge', async () => {
    state.selectQueue = [...NO_ROWS]
    expect(await recordConnectRefund(event())).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('a replayed event writes nothing', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'refunded', refundedAmountCents: 5_000, refundedAt: new Date() }], [], []]
    expect(await recordConnectRefund(event())).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('no payment intent on the event → no lookup, no write', async () => {
    state.selectQueue = [...NO_ROWS]
    expect(await recordConnectRefund(event({ paymentIntentId: '' }))).toEqual([])
    expect(state.updates).toEqual([])
    expect(eqCalls).toEqual([])
  })

  it('every UPDATE is scoped to the organization', async () => {
    state.selectQueue = [
      [{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }],
      [{ id: 'bp_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }],
      [{ id: 'bd_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }],
    ]
    await recordConnectRefund(event())
    expect(state.updates).toHaveLength(3)
    for (const u of state.updates) {
      const conds = (u.where as { conds: Array<{ col: unknown; val: unknown }> }).conds
      expect(conds.some((c) => String(c.col).endsWith('.organizationId') && c.val === ORG)).toBe(true)
    }
  })

  it('every SELECT and UPDATE is keyed on the payment intent within that org', async () => {
    state.selectQueue = [...NO_ROWS]
    await recordConnectRefund(event())
    expect(eqCalls.filter((c) => String(c.col).endsWith('.stripePaymentIntentId') && c.val === PI)).toHaveLength(3)
    expect(eqCalls.filter((c) => String(c.col).endsWith('.organizationId') && c.val === ORG)).toHaveLength(3)
  })

  it('the UPDATE carries the monotonic guard, so a racing writer with MORE wins', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    await recordConnectRefund(event())
    expect(lteCalls).toHaveLength(1)
    expect(String(lteCalls[0].col)).toContain('refundedAmountCents')
    expect(lteCalls[0].val).toBe(5_000)
  })

  it('a lost race (0 rows updated) is not reported as a change', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    state.updateReturns = [[]]
    expect(await recordConnectRefund(event())).toEqual([])
  })
})

/**
 * EVERY REFUND REACHES A RECORD (`connect_refund`, DREAMCRM-32).
 *
 * A MEMBERSHIP subscription charge rides the same connected account and has a
 * row in none of the three tables above — the `membership` row tracks the
 * subscription, not its charges — so a refunded membership payment used to
 * reach a `console.warn` and nothing else. The practice's bank balance moved
 * and their software said nothing.
 *
 * (Payment-plan installments already matched: `chargePlanInstallment` records
 * each one as a `patient_balance_payment` with the PaymentIntent stamped. The
 * gap was membership alone — the ledger entry that named both was written
 * before that path existed to be re-read.)
 */
describe('recordConnectRefund — the refund receipt', () => {
  it('records a refund that matched nothing, marked as unattached', async () => {
    state.selectQueue = [...NO_ROWS]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual([])
    expect(state.receipts).toHaveLength(1)
    expect(state.receipts[0].values).toMatchObject({
      organizationId: ORG,
      stripePaymentIntentId: PI,
      refundedAmountCents: 5_000,
      chargeAmountCents: 5_000,
      attachedTo: 'none',
    })
  })

  it('says WHICH record a matched refund attached to', async () => {
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    await recordConnectRefund(event())
    expect(state.receipts[0].values).toMatchObject({ attachedTo: 'shop_order' })
  })

  it('claims on (org, payment intent) and only ever raises the amounts', async () => {
    state.selectQueue = [...NO_ROWS]
    await recordConnectRefund(event())
    const conflict = state.receipts[0].conflict as {
      target: unknown[]
      set: Record<string, string>
    }
    // The claim key — a redelivery updates its own row rather than minting a
    // second receipt for the same charge.
    expect(conflict.target).toHaveLength(2)
    // Monotonic, like every other write on this path.
    expect(conflict.set.refundedAmountCents).toContain('greatest(')
    expect(conflict.set.chargeAmountCents).toContain('greatest(')
    // `refundedAt` is NOT in the update set — the receipt keeps its first
    // sighting rather than restamping on every redelivery.
    expect(conflict.set).not.toHaveProperty('refundedAt')
  })

  it('never downgrades an attachment a later delivery could not make', async () => {
    // The finalizer may stamp the PaymentIntent between two deliveries, so the
    // first can be 'none' and the second real — but never the other way round.
    state.selectQueue = [...NO_ROWS]
    await recordConnectRefund(event())
    const conflict = state.receipts[0].conflict as { set: Record<string, string> }
    expect(conflict.set.attachedTo).toContain("excluded.attached_to = 'none'")
  })

  it('a failing receipt never costs us the money record', async () => {
    state.receiptFails = true
    state.selectQueue = [[{ id: 'so_1', status: 'paid', refundedAmountCents: 0, refundedAt: null }], [], []]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual(['shop_order'])
    expect(state.updates).toHaveLength(1)
  })
})

/**
 * LOYALTY FOLLOWS THE MONEY (DREAMCRM-32). The balance payment stays 'paid'
 * after a refund, so nothing else would have taken the points back.
 */
describe('recordConnectRefund — loyalty points', () => {
  const bp = (over: Record<string, unknown> = {}) => [
    {
      id: 'bp_1',
      status: 'paid',
      amountCents: 5_000,
      refundedAmountCents: 0,
      refundedAt: null,
      ...over,
    },
  ]

  it('hands the payment’s own amounts to the reversal on a full refund', async () => {
    state.selectQueue = [[], bp(), []]
    await recordConnectRefund(event())
    expect(syncLoyalty).toHaveBeenCalledWith(ORG, 'bp_1', {
      amountCents: 5_000,
      refundedAmountCents: 5_000,
    })
  })

  it('passes a PARTIAL refund through — the reversal decides, not the caller', async () => {
    state.selectQueue = [[], bp(), []]
    await recordConnectRefund(event({ amountRefundedCents: 1_500 }))
    expect(syncLoyalty).toHaveBeenCalledWith(ORG, 'bp_1', {
      amountCents: 5_000,
      refundedAmountCents: 1_500,
    })
  })

  it('uses the PLAN’s total, so an out-of-order event cannot un-refund', async () => {
    // The row already records the full $50; this stale $15 event must not make
    // the payment look partly refunded and leave the points in place.
    state.selectQueue = [[], bp({ refundedAmountCents: 5_000 }), []]
    await recordConnectRefund(event({ amountRefundedCents: 1_500 }))
    expect(syncLoyalty).toHaveBeenCalledWith(ORG, 'bp_1', {
      amountCents: 5_000,
      refundedAmountCents: 5_000,
    })
  })

  it('still reverses on a REDELIVERED refund the money record had already recorded', async () => {
    // planRefundWrite returns null here (nothing new to write), which is
    // exactly the delivery that would strand the points if a crash had
    // landed between the money write and the ledger write.
    state.selectQueue = [[], bp({ refundedAmountCents: 5_000 }), []]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual([]) // no MONEY record moved
    expect(syncLoyalty).toHaveBeenCalledTimes(1)
  })

  it('does not reach for the ledger when no balance payment owns the charge', async () => {
    state.selectQueue = [...NO_ROWS]
    await recordConnectRefund(event())
    expect(syncLoyalty).not.toHaveBeenCalled()
  })

  it('a failing loyalty write never costs us the refund record', async () => {
    syncLoyalty.mockRejectedValue(new Error('ledger down'))
    state.selectQueue = [[], bp(), []]
    const kinds = await recordConnectRefund(event())
    expect(kinds).toEqual(['balance_payment'])
    expect(state.updates).toHaveLength(1)
  })
})

describe('listUnmatchedRefunds', () => {
  it('leaves out a receipt the ordering rule drove to zero', async () => {
    // The receipt KEEPS its `refunded_at` when a refund fails — recording that
    // a refunded charge was seen stays true. But this list answers "what left
    // the clinic's Stripe account with nothing here to reconcile", and a
    // refund that failed at the bank left nothing. Without the filter it would
    // sit on the reconciliation page forever at $0 — the same lie the
    // failed-refund fix exists to stop, one surface further out.
    // (Sentinel's note 6 on #579.)
    state.selectQueue = [[]]
    await listUnmatchedRefunds(ORG)

    expect(gtCalls).toHaveLength(1)
    expect(String(gtCalls[0].col)).toContain('refundedAmountCents')
    expect(gtCalls[0].val).toBe(0)
  })

  it('still scopes to the organization and to unattached refunds only', async () => {
    state.selectQueue = [[]]
    await listUnmatchedRefunds(ORG)

    expect(eqCalls.map((c) => [String(c.col), c.val])).toEqual([
      ['connectRefund.organizationId', ORG],
      ['connectRefund.attachedTo', 'none'],
    ])
  })
})
