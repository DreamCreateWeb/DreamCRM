import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stripe mock — we control what each .list() call returns.
interface PaidInvoiceStub {
  id?: string
  amount_paid: number
  customer: string | null
  created: number
  status_transitions?: { paid_at?: number }
  lines: { data: Array<{ description: string }> }
}
const stripeStubs: {
  paid: PaidInvoiceStub[]
  paidPages: PaidInvoiceStub[][] | null
  open: Array<{ amount_remaining: number }>
  throwOn: null | 'list'
} = {
  paid: [],
  paidPages: null,
  open: [],
  throwOn: null,
}

vi.mock('@/lib/stripe', () => ({
  stripe: {
    invoices: {
      list: vi.fn(async (params: { status?: string; starting_after?: string }) => {
        if (stripeStubs.throwOn === 'list') {
          throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), {})
        }
        if (params.status === 'open') {
          return { data: stripeStubs.open, has_more: false }
        }
        // Paid invoices — support pagination if `paidPages` is set
        if (stripeStubs.paidPages) {
          const idx = params.starting_after
            ? stripeStubs.paidPages.findIndex(
                (p: PaidInvoiceStub[]) => p[p.length - 1]?.id === params.starting_after,
              ) + 1
            : 0
          const page = stripeStubs.paidPages[idx] ?? []
          return { data: page, has_more: idx < stripeStubs.paidPages.length - 1 }
        }
        return { data: stripeStubs.paid, has_more: false }
      }),
    },
  },
}))

// DB mock — same pattern as platform-metrics tests
const dbState: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => dbState.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(dbState.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain() } }
})

import {
  getStripeRevenueWindow,
  getProjectRevenueWindow,
  getOutstandingRevenue,
  getTopRevenueClinics,
  getRecentRevenueTransactions,
} from '@/lib/services/revenue'

beforeEach(() => {
  stripeStubs.paid = []
  stripeStubs.paidPages = null
  stripeStubs.open = []
  stripeStubs.throwOn = null
  dbState.selectQueue.length = 0
})

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

describe('getStripeRevenueWindow', () => {
  it('returns zero state when Stripe is unreachable', async () => {
    stripeStubs.throwOn = 'list'
    const w = await getStripeRevenueWindow(12)
    expect(w.stripeUnavailable).toBe(true)
    expect(w.totalCents).toBe(0)
    expect(w.paidInvoiceCount).toBe(0)
    expect(w.buckets).toHaveLength(12)
    expect(w.buckets.every((b) => b.value === 0)).toBe(true)
  })

  it('sums amount_paid across all paid invoices', async () => {
    stripeStubs.paid = [
      { amount_paid: 14_900, customer: 'cus_a', created: nowSec(), status_transitions: { paid_at: nowSec() }, lines: { data: [{ description: 'Pro' }] } },
      { amount_paid: 19_900, customer: 'cus_b', created: nowSec(), status_transitions: { paid_at: nowSec() }, lines: { data: [{ description: 'Premium' }] } },
    ]
    const w = await getStripeRevenueWindow(4)
    expect(w.totalCents).toBe(34_800)
    expect(w.paidInvoiceCount).toBe(2)
    expect(w.stripeUnavailable).toBe(false)
  })

  it('paginates Stripe results until has_more is false', async () => {
    const mkInv = (i: number) => ({
      id: `inv_${i}`,
      amount_paid: 100,
      customer: `cus_${i}`,
      created: nowSec(),
      status_transitions: { paid_at: nowSec() },
      lines: { data: [{ description: 'X' }] },
    })
    stripeStubs.paidPages = [
      Array.from({ length: 100 }, (_, i) => mkInv(i)),
      Array.from({ length: 50 }, (_, i) => mkInv(100 + i)),
    ]
    const w = await getStripeRevenueWindow(4)
    expect(w.paidInvoiceCount).toBe(150)
    expect(w.totalCents).toBe(15_000)
  })

  it('buckets paid invoices into their week-of', async () => {
    // Pick a date solidly within the last week
    const t = Math.floor(Date.now() / 1000) - 60
    stripeStubs.paid = [
      { amount_paid: 9_900, customer: 'cus_a', created: t, status_transitions: { paid_at: t }, lines: { data: [{ description: 'Basic' }] } },
    ]
    const w = await getStripeRevenueWindow(4)
    // Latest bucket should be where the money lands
    expect(w.buckets[w.buckets.length - 1].value).toBe(9_900)
  })
})

describe('getProjectRevenueWindow', () => {
  it('sums budgetCents from completed projects per bucket', async () => {
    // Compute current week iso
    const now = new Date()
    const dow = now.getDay()
    const off = dow === 0 ? -6 : 1 - dow
    const wk = new Date(now)
    wk.setHours(0, 0, 0, 0)
    wk.setDate(wk.getDate() + off)
    const wkIso = wk.toISOString().slice(0, 10)

    dbState.selectQueue.push([{ bucket: wkIso, sum: 250_000, count: 2 }])
    const r = await getProjectRevenueWindow(4)
    expect(r.totalCents).toBe(250_000)
    expect(r.completedCount).toBe(2)
    expect(r.buckets[r.buckets.length - 1].value).toBe(250_000)
  })

  it('zero-fills weeks with no completions', async () => {
    dbState.selectQueue.push([])
    const r = await getProjectRevenueWindow(4)
    expect(r.totalCents).toBe(0)
    expect(r.buckets).toHaveLength(4)
    expect(r.buckets.every((b) => b.value === 0)).toBe(true)
  })

  it('degrades gracefully when table is missing', async () => {
    const { db } = await import('@/lib/db')
    const orig = db.select
    ;(db as { select: () => unknown }).select = () => {
      throw Object.assign(new Error('relation "agency_project" does not exist'), {
        code: '42P01',
      })
    }
    try {
      const r = await getProjectRevenueWindow(4)
      expect(r.totalCents).toBe(0)
      expect(r.buckets).toHaveLength(4)
    } finally {
      ;(db as { select: unknown }).select = orig
    }
  })
})

describe('getOutstandingRevenue', () => {
  it('aggregates past-due Stripe + open project budgets', async () => {
    stripeStubs.open = [{ amount_remaining: 14_900 }, { amount_remaining: 9_900 }]
    dbState.selectQueue.push([{ sum: 500_000, count: 3 }])
    const o = await getOutstandingRevenue()
    expect(o.pastDueInvoiceCents).toBe(24_800)
    expect(o.pastDueInvoiceCount).toBe(2)
    expect(o.openProjectCents).toBe(500_000)
    expect(o.openProjectCount).toBe(3)
    expect(o.stripeUnavailable).toBe(false)
  })

  it('marks stripeUnavailable when invoices.list throws', async () => {
    stripeStubs.throwOn = 'list'
    dbState.selectQueue.push([{ sum: 0, count: 0 }])
    const o = await getOutstandingRevenue()
    expect(o.stripeUnavailable).toBe(true)
    expect(o.pastDueInvoiceCents).toBe(0)
  })
})

describe('getTopRevenueClinics', () => {
  it('ranks clinics by combined subscription + project revenue', async () => {
    stripeStubs.paid = [
      { id: 'i1', amount_paid: 14_900, customer: 'cus_a', created: nowSec(), status_transitions: {}, lines: { data: [{ description: 'x' }] } },
      { id: 'i2', amount_paid: 14_900, customer: 'cus_a', created: nowSec(), status_transitions: {}, lines: { data: [{ description: 'x' }] } },
      { id: 'i3', amount_paid: 9_900, customer: 'cus_b', created: nowSec(), status_transitions: {}, lines: { data: [{ description: 'x' }] } },
    ]
    // Project rows (grouped by org)
    dbState.selectQueue.push([
      { orgId: 'org_b', sum: 500_000 },
      { orgId: 'org_c', sum: 200_000 },
    ])
    // Clinic rows
    dbState.selectQueue.push([
      { orgId: 'org_a', name: 'Acme', slug: 'acme', displayName: 'Acme Dental', stripeCustomerId: 'cus_a' },
      { orgId: 'org_b', name: 'Bright', slug: 'bright', displayName: null, stripeCustomerId: 'cus_b' },
      { orgId: 'org_c', name: 'Cozy', slug: 'cozy', displayName: 'Cozy Dentistry', stripeCustomerId: null },
    ])

    const { rows } = await getTopRevenueClinics(5)
    // Acme: 2×14_900 = 29_800 subs + 0 proj
    // Bright: 9_900 subs + 500_000 proj = 509_900
    // Cozy: 0 subs + 200_000 proj
    expect(rows.map((r) => r.clinicName)).toEqual(['Bright', 'Cozy Dentistry', 'Acme Dental'])
    expect(rows[0].total).toBe(509_900)
    expect(rows[0].subscriptionCents).toBe(9_900)
    expect(rows[0].projectCents).toBe(500_000)
  })

  it('skips clinics with zero revenue', async () => {
    stripeStubs.paid = []
    dbState.selectQueue.push([])
    dbState.selectQueue.push([
      { orgId: 'org_a', name: 'A', slug: 'a', displayName: null, stripeCustomerId: null },
      { orgId: 'org_b', name: 'B', slug: 'b', displayName: null, stripeCustomerId: null },
    ])
    const { rows } = await getTopRevenueClinics(5)
    expect(rows).toHaveLength(0)
  })

  it('flags stripeUnavailable but still returns project revenue', async () => {
    stripeStubs.throwOn = 'list'
    dbState.selectQueue.push([{ orgId: 'org_a', sum: 100_000 }])
    dbState.selectQueue.push([
      { orgId: 'org_a', name: 'A', slug: 'a', displayName: null, stripeCustomerId: null },
    ])
    const { rows, stripeUnavailable } = await getTopRevenueClinics(5)
    expect(stripeUnavailable).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].projectCents).toBe(100_000)
  })
})

describe('getRecentRevenueTransactions', () => {
  it('returns a unified, sorted feed of Stripe + project transactions', async () => {
    const old = Math.floor(Date.now() / 1000) - 86_400
    const newer = Math.floor(Date.now() / 1000) - 60
    stripeStubs.paid = [
      {
        id: 'inv_old',
        amount_paid: 14_900,
        customer: 'cus_a',
        created: old,
        status_transitions: { paid_at: old },
        lines: { data: [{ description: 'Pro Monthly' }] },
      },
      {
        id: 'inv_new',
        amount_paid: 19_900,
        customer: 'cus_b',
        created: newer,
        status_transitions: { paid_at: newer },
        lines: { data: [{ description: 'Premium Monthly' }] },
      },
    ]
    // Customer → clinic lookup
    dbState.selectQueue.push([
      { custId: 'cus_a', name: 'Acme', orgName: 'Acme' },
      { custId: 'cus_b', name: 'Bright', orgName: 'Bright' },
    ])
    // Completed projects
    const projDate = new Date(Date.now() - 3600_000)
    dbState.selectQueue.push([
      {
        id: 'p1',
        title: 'New brand video',
        type: 'videography',
        budget: 250_000,
        completedAt: projDate,
        clinicName: 'Acme',
      },
    ])
    const { rows } = await getRecentRevenueTransactions(10)
    expect(rows).toHaveLength(3)
    expect(rows[0].id).toBe('inv_new') // most recent
    expect(rows[0].source).toBe('subscription')
    expect(rows[0].clinicName).toBe('Bright')
    // project sandwiched in the middle (60s ago vs 1hr ago vs 1day ago)
    const proj = rows.find((r) => r.source === 'project')
    expect(proj?.description).toContain('New brand video')
    expect(proj?.description).toContain('Videography')
  })

  it('drops project rows without a completedAt or budget', async () => {
    stripeStubs.paid = []
    dbState.selectQueue.push([]) // cust map
    dbState.selectQueue.push([
      { id: 'p1', title: 'No budget', type: 'website', budget: null, completedAt: new Date(), clinicName: 'X' },
      { id: 'p2', title: 'No date', type: 'website', budget: 100_000, completedAt: null, clinicName: 'X' },
    ])
    const { rows } = await getRecentRevenueTransactions(10)
    expect(rows).toHaveLength(0)
  })
})
