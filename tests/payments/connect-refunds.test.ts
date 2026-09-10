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
 *  3. The recorded total only ever goes up, so out-of-order webhook delivery
 *     cannot walk a refund backwards, and a replay writes nothing.
 *  4. Every UPDATE is scoped to the organization.
 */

const state = {
  // One queued result per table lookup, in service order:
  // shop_order, patient_balance_payment, booking_deposit.
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
  updateReturns: [] as Array<Array<{ id: string }>>,
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

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ _kind: 'and', conds })),
  eq: vi.fn((col: unknown, val: unknown) => {
    eqCalls.push({ col, val })
    return { _kind: 'eq', col, val }
  }),
  lte: vi.fn((col: unknown, val: unknown) => {
    lteCalls.push({ col, val })
    return { _kind: 'lte', col, val }
  }),
}))

import { recordConnectRefund, planRefundWrite } from '@/lib/services/refunds'

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
})

describe('planRefundWrite', () => {
  it('a full refund on a paid row marks it refunded (when the table allows it)', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, true)
    expect(plan).toEqual({ refundedAmountCents: 5_000, markRefunded: true })
  })

  it('a PARTIAL refund records the amount but never marks it refunded', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 1_500, chargeAmountCents: 5_000 }, true)
    expect(plan).toEqual({ refundedAmountCents: 1_500, markRefunded: false })
  })

  it('a table whose status has no "refunded" value only records the amount', () => {
    const plan = planRefundWrite({ refundedAmountCents: 0, status: 'paid' }, { amountRefundedCents: 5_000, chargeAmountCents: 5_000 }, false)
    expect(plan).toEqual({ refundedAmountCents: 5_000, markRefunded: false })
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
    expect(plan).toEqual({ refundedAmountCents: 3_000, markRefunded: false })
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
