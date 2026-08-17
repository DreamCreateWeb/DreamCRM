import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Commission reversal — the refund/dispute counterpart of accrual (R2 money
 * hardening). A clinic that pays and is then refunded never produced that
 * revenue, so an accrued partner commission on it must not survive.
 *
 * The laws under test:
 *  - an 'accrued' row flips to 'reversed' (kept as audit, never deleted)
 *  - a 'paid' row is NOT rewritten — the transfer already left the platform,
 *    so it surfaces for a human clawback decision instead
 *  - unknown invoice / replayed event → a quiet no-op (idempotent)
 *  - a DB failure never throws (this rides a best-effort webhook branch)
 */

const state = {
  row: null as Record<string, unknown> | null,
  updateReturns: [{ id: 1 }] as Array<{ id: number }>,
  updates: [] as Array<Record<string, unknown>>,
  throwOnSelect: false,
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ deliver: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (state.throwOnSelect) throw new Error('db down')
            return state.row ? [state.row] : []
          },
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.updates.push(vals)
            return state.updateReturns
          },
        }),
      }),
    }),
  },
  schema: {
    referralCommission: {
      stripeInvoiceId: 'stripeInvoiceId',
      status: 'status',
      amountCents: 'amountCents',
      partnerId: 'partnerId',
      id: 'id',
    },
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _k: 'and' })),
  eq: vi.fn(() => ({ _k: 'eq' })),
  desc: vi.fn((x) => x),
  inArray: vi.fn(() => ({ _k: 'inArray' })),
  sql: Object.assign(vi.fn(() => ({ _k: 'sql' })), { raw: vi.fn() }),
}))

import { reverseCommissionForInvoice } from '@/lib/services/referrals'

beforeEach(() => {
  state.row = null
  state.updateReturns = [{ id: 1 }]
  state.updates = []
  state.throwOnSelect = false
})

describe('reverseCommissionForInvoice', () => {
  it('flips an accrued commission to reversed and reports the cents', async () => {
    state.row = { amountCents: 2000, status: 'accrued', partnerId: 'rp_1' }
    const r = await reverseCommissionForInvoice('in_1', 'refund')
    expect(r).toEqual({ reversedCents: 2000, needsClawbackCents: 0 })
    expect(state.updates[0]).toMatchObject({ status: 'reversed' })
  })

  it('does NOT rewrite an already-paid commission — surfaces it for clawback', async () => {
    state.row = { amountCents: 2000, status: 'paid', partnerId: 'rp_1' }
    const r = await reverseCommissionForInvoice('in_1', 'dispute')
    expect(r).toEqual({ reversedCents: 0, needsClawbackCents: 2000 })
    // Settled money is never silently rewritten.
    expect(state.updates).toHaveLength(0)
  })

  it('is a quiet no-op for an invoice with no commission', async () => {
    state.row = null
    const r = await reverseCommissionForInvoice('in_unknown', 'refund')
    expect(r).toEqual({ reversedCents: 0, needsClawbackCents: 0 })
    expect(state.updates).toHaveLength(0)
  })

  it('is idempotent — a replayed event matches no accrued row the second time', async () => {
    state.row = { amountCents: 2000, status: 'accrued', partnerId: 'rp_1' }
    state.updateReturns = [] // the CAS on status='accrued' matches nothing now
    const r = await reverseCommissionForInvoice('in_1', 'refund')
    expect(r).toEqual({ reversedCents: 0, needsClawbackCents: 0 })
  })

  it('never throws — a DB failure degrades to a no-op (best-effort webhook)', async () => {
    state.throwOnSelect = true
    await expect(reverseCommissionForInvoice('in_1', 'refund')).resolves.toEqual({
      reversedCents: 0,
      needsClawbackCents: 0,
    })
  })
})
