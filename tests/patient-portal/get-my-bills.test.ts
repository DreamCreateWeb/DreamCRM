import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Shape-level coverage for `getMyBills`. The service is the single source
 * of truth for the patient `/patient/invoices` page; verifying its return
 * shape against the three branches (PMS balance / membership / shop
 * orders) prevents shipping a regression where one branch's data drops
 * silently.
 */

const state = {
  patient: null as { pmsBalanceCents: number | null; pmsBalanceUpdatedAt: Date | null } | null,
  membership: null as Record<string, unknown> | null,
  orders: [] as Array<Record<string, unknown>>,
  items: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  type ChainShape = Promise<unknown[]> & {
    from: (t: unknown) => ChainShape
    innerJoin: () => ChainShape
    where: () => ChainShape
    orderBy: () => ChainShape
    limit: () => ChainShape
  }
  function chain(rows: unknown[]): ChainShape {
    const p = Promise.resolve(rows) as ChainShape
    p.from = () => p
    p.innerJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.limit = () => p
    return p
  }
  return {
    db: {
      select: (sel?: Record<string, unknown>) => {
        const keys = sel ? Object.keys(sel) : []
        if (keys.includes('pmsBalanceCents')) {
          return chain(state.patient ? [state.patient] : [])
        }
        if (keys.includes('benefits') || keys.includes('planName')) {
          return chain(state.membership ? [state.membership] : [])
        }
        if (keys.includes('orderId')) {
          return chain(state.items)
        }
        // Default: shop order rows
        return chain(state.orders)
      },
    },
  }
})

vi.mock('@/lib/db/schema/clinic', () => ({
  patient: { id: 'p.id', organizationId: 'p.org' },
  appointment: {},
  shopOrder: { id: 'so.id', patientId: 'so.pat', organizationId: 'so.org', status: 'so.status', fulfillmentStatus: 'so.fs', fulfillmentType: 'so.ft', totalCents: 'so.total', trackingNumber: 'so.tn', createdAt: 'so.ca', paidAt: 'so.pa' },
  shopOrderItem: { id: 'soi.id', orderId: 'soi.oid', productName: 'soi.pn', variantName: 'soi.vn', quantity: 'soi.q', unitPriceCents: 'soi.u' },
  membership: { id: 'm.id', planId: 'm.pid', patientId: 'm.pat', organizationId: 'm.org', status: 'm.status', currentPeriodEnd: 'm.cpe', benefitsUsed: 'm.bu', createdAt: 'm.ca' },
  membershipPlan: { id: 'mp.id', name: 'mp.name', billingInterval: 'mp.bi', priceCents: 'mp.pc', benefits: 'mp.b' },
  // Portal v2 additions — referenced at module level by patient-portal.ts.
  formSubmission: {},
  formTemplate: {},
  clinicProvider: {},
  patientBalancePayment: {},
}))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: {} }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn(() => ({ _: 'desc' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  lt: vi.fn(() => ({ _: 'lt' })),
}))

beforeEach(() => {
  state.patient = null
  state.membership = null
  state.orders = []
  state.items = []
})

async function callGetMyBills() {
  const { getMyBills } = await import('@/lib/services/patient-portal')
  return getMyBills('pat_1', 'org_1')
}

describe('getMyBills', () => {
  it('returns the all-null shape when patient has no rows anywhere', async () => {
    const r = await callGetMyBills()
    expect(r.pmsBalanceCents).toBe(null)
    expect(r.pmsBalanceUpdatedAt).toBe(null)
    expect(r.membership).toBe(null)
    expect(r.orders).toEqual([])
  })

  it('surfaces a non-zero PMS balance and its updatedAt', async () => {
    state.patient = { pmsBalanceCents: 12500, pmsBalanceUpdatedAt: new Date('2026-05-20T10:00:00Z') }
    const r = await callGetMyBills()
    expect(r.pmsBalanceCents).toBe(12500)
    expect(r.pmsBalanceUpdatedAt?.toISOString()).toBe('2026-05-20T10:00:00.000Z')
  })

  it('shapes an active membership with benefits + remaining calculation', async () => {
    state.membership = {
      id: 'mem_1',
      planName: 'Smile Club',
      planBillingInterval: 'annual',
      priceCents: 39900,
      status: 'active',
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      benefits: [{ label: '2 cleanings per year', qty: 2 }],
      benefitsUsed: { '2 cleanings per year': 1 },
    }
    const r = await callGetMyBills()
    expect(r.membership).not.toBeNull()
    expect(r.membership?.planName).toBe('Smile Club')
    expect(r.membership?.status).toBe('active')
    expect(r.membership?.benefits).toEqual([{ label: '2 cleanings per year', qty: 2 }])
    expect(r.membership?.benefitsUsed['2 cleanings per year']).toBe(1)
  })

  it('shapes shop orders with their line items grouped per order', async () => {
    state.orders = [
      {
        id: 'so_1',
        status: 'paid',
        fulfillmentStatus: 'ready_for_pickup',
        fulfillmentType: 'pickup',
        totalCents: 14900,
        trackingNumber: null,
        createdAt: new Date('2026-05-25T00:00:00Z'),
        paidAt: new Date('2026-05-25T00:00:00Z'),
      },
    ]
    state.items = [
      { orderId: 'so_1', productName: 'Whitening Kit', variantName: 'Standard', quantity: 1, unitPriceCents: 14900 },
    ]
    const r = await callGetMyBills()
    expect(r.orders).toHaveLength(1)
    expect(r.orders[0].id).toBe('so_1')
    expect(r.orders[0].status).toBe('paid')
    expect(r.orders[0].items).toHaveLength(1)
    expect(r.orders[0].items[0].productName).toBe('Whitening Kit')
    expect(r.orders[0].items[0].quantity).toBe(1)
  })

  it('returns empty items array when an order has no shop_order_item rows', async () => {
    state.orders = [
      {
        id: 'so_orphan',
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        fulfillmentType: 'pickup',
        totalCents: 2900,
        trackingNumber: null,
        createdAt: new Date(),
        paidAt: null,
      },
    ]
    state.items = []
    const r = await callGetMyBills()
    expect(r.orders[0].items).toEqual([])
  })
})
