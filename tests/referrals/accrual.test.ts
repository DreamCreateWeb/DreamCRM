import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ───────────────────────────────────────────────────────────────
const state = {
  profile: null as Record<string, unknown> | null,
  partner: null as Record<string, unknown> | null,
  /** rows the unique-invoice insert "returns" — [] simulates ON CONFLICT DO
   *  NOTHING hitting an existing invoice (duplicate). */
  insertReturns: [{ id: 1 }] as Array<{ id: number }>,
  inserts: [] as Array<Record<string, unknown>>,
}

function dbMethods(): any {
  return {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'clinicProfile') return state.profile ? [state.profile] : []
            if (t === 'referralPartner') return state.partner ? [state.partner] : []
            return []
          },
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.insertReturns.length > 0) state.inserts.push(vals)
            return state.insertReturns
          },
        }),
      }),
    }),
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ deliver: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: dbMethods(),
  schema: {
    clinicProfile: 'clinicProfile',
    referralPartner: 'referralPartner',
    referralCommission: { stripeInvoiceId: 'stripeInvoiceId' },
    referralPayout: 'referralPayout',
    organization: 'organization',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _k: 'and' })),
  eq: vi.fn(() => ({ _k: 'eq' })),
  desc: vi.fn((x) => x),
  inArray: vi.fn(() => ({ _k: 'inArray' })),
  sql: Object.assign(vi.fn(() => ({ _k: 'sql' })), { raw: vi.fn() }),
}))

import {
  accrueCommissionForInvoice,
  commissionCents,
  monthsElapsed,
  withinTerm,
} from '@/lib/services/referrals'

beforeEach(() => {
  state.profile = null
  state.partner = null
  state.insertReturns = [{ id: 1 }]
  state.inserts = []
})

describe('commissionCents — bps math, rounds down', () => {
  it('10% of $199.00', () => {
    expect(commissionCents(19900, 1000)).toBe(1990)
  })
  it('rounds DOWN (no fractional cents)', () => {
    // 12.5% of $99.00 = 1237.5 → floor 1237
    expect(commissionCents(9900, 1250)).toBe(1237)
    // 7% of 333 cents = 23.31 → 23
    expect(commissionCents(333, 700)).toBe(23)
  })
  it('zero / negative inputs → 0', () => {
    expect(commissionCents(0, 1000)).toBe(0)
    expect(commissionCents(-5, 1000)).toBe(0)
    expect(commissionCents(19900, 0)).toBe(0)
  })
})

describe('monthsElapsed', () => {
  it('same month → 0', () => {
    expect(monthsElapsed(new Date('2026-01-05'), new Date('2026-01-20'))).toBe(0)
  })
  it('day-of-month not yet reached → previous whole month', () => {
    // Jan 15 → Feb 14 is still "0 months in"
    expect(monthsElapsed(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0)
    // Jan 15 → Feb 15 ticks to 1
    expect(monthsElapsed(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1)
  })
  it('spans a year', () => {
    expect(monthsElapsed(new Date('2025-06-10'), new Date('2026-06-10'))).toBe(12)
  })
  it('never negative', () => {
    expect(monthsElapsed(new Date('2026-06-10'), new Date('2026-01-01'))).toBe(0)
  })
})

describe('withinTerm — the accrual gate', () => {
  it('null term = forever → always true', () => {
    expect(withinTerm({ startedAt: new Date('2020-01-01'), termMonths: null })).toBe(true)
  })
  it('null startedAt → false (defensive)', () => {
    expect(withinTerm({ startedAt: null, termMonths: 12 })).toBe(false)
  })
  it('inside the term window', () => {
    const start = new Date('2026-01-01')
    expect(withinTerm({ startedAt: start, termMonths: 12, now: new Date('2026-06-01') })).toBe(true)
  })
  it('boundary: at exactly termMonths elapsed → expired', () => {
    const start = new Date('2026-01-01')
    // 12 months elapsed on 2027-01-01 → NOT < 12 → false
    expect(withinTerm({ startedAt: start, termMonths: 12, now: new Date('2027-01-01') })).toBe(false)
    // one day before → still 11 months in → true
    expect(withinTerm({ startedAt: start, termMonths: 12, now: new Date('2026-12-31') })).toBe(true)
  })
})

describe('accrueCommissionForInvoice', () => {
  const base = { organizationId: 'org1', stripeInvoiceId: 'in_1', amountPaidCents: 19900 }

  it('no partner on the clinic → no-op', async () => {
    state.profile = { partnerId: null, percentBps: null, termMonths: null, startedAt: null }
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('no_partner')
    expect(state.inserts).toHaveLength(0)
  })

  it('suspended partner → no-op', async () => {
    state.profile = { partnerId: 'p1', percentBps: 1000, termMonths: null, startedAt: new Date() }
    state.partner = { status: 'suspended', defaultPercentBps: 1000, defaultTermMonths: null }
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('suspended')
    expect(state.inserts).toHaveLength(0)
  })

  it('zero amount → no-op', async () => {
    const r = await accrueCommissionForInvoice({ ...base, amountPaidCents: 0 })
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('zero_amount')
  })

  it('out of term → no-op', async () => {
    state.profile = {
      partnerId: 'p1',
      percentBps: 1000,
      termMonths: 6,
      startedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // a year ago, 6mo term
    }
    state.partner = { status: 'active', defaultPercentBps: 1000, defaultTermMonths: 6 }
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('out_of_term')
    expect(state.inserts).toHaveLength(0)
  })

  it('happy path: accrues 10% of the invoice', async () => {
    state.profile = { partnerId: 'p1', percentBps: 1000, termMonths: null, startedAt: new Date() }
    state.partner = { status: 'active', defaultPercentBps: 1000, defaultTermMonths: null }
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(true)
    expect(r.amountCents).toBe(1990)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      partnerId: 'p1',
      organizationId: 'org1',
      stripeInvoiceId: 'in_1',
      invoiceTotalCents: 19900,
      percentBps: 1000,
      amountCents: 1990,
      status: 'accrued',
    })
  })

  it('per-clinic override beats the partner default', async () => {
    state.profile = { partnerId: 'p1', percentBps: 1500, termMonths: null, startedAt: new Date() }
    state.partner = { status: 'active', defaultPercentBps: 1000, defaultTermMonths: null }
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(true)
    expect(r.amountCents).toBe(2985) // 15% of 19900
    expect(state.inserts[0].percentBps).toBe(1500)
  })

  it('falls back to partner default when the clinic has no override', async () => {
    state.profile = { partnerId: 'p1', percentBps: null, termMonths: null, startedAt: new Date() }
    state.partner = { status: 'active', defaultPercentBps: 800, defaultTermMonths: null }
    const r = await accrueCommissionForInvoice(base)
    expect(r.amountCents).toBe(1592) // 8% of 19900
  })

  it('idempotency: ON CONFLICT DO NOTHING (no returned row) → duplicate, no double-accrue', async () => {
    state.profile = { partnerId: 'p1', percentBps: 1000, termMonths: null, startedAt: new Date() }
    state.partner = { status: 'active', defaultPercentBps: 1000, defaultTermMonths: null }
    state.insertReturns = [] // simulate the unique-constraint conflict
    const r = await accrueCommissionForInvoice(base)
    expect(r.accrued).toBe(false)
    expect(r.reason).toBe('duplicate')
    expect(state.inserts).toHaveLength(0)
  })
})
