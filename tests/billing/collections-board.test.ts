import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getCollectionsBoard — the AR workboard aggregation: balance rows sorted by
 * the query, latest-pay-link + latest-payment reduction, clinic-local
 * month-to-date collected total, and the header stats.
 */

const state = {
  selectQueue: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: { select: () => chain() },
    schema: {
      patient: {
        id: 'id', organizationId: 'org', firstName: 'fn', lastName: 'ln', email: 'email',
        isActive: 'active', mergedIntoPatientId: 'merged', pmsBalanceCents: 'bal',
      },
      balancePaymentRequest: { organizationId: 'org', patientId: 'pid', status: 'status', sentAt: 'sentAt' },
      patientBalancePayment: { organizationId: 'org', patientId: 'pid', status: 'status', amountCents: 'amt', paidAt: 'paidAt' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { getCollectionsBoard } from '@/lib/services/collections'

const NOW = new Date('2026-07-02T15:00:00Z')

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
})

describe('getCollectionsBoard', () => {
  it('assembles rows with dunning state and header totals', async () => {
    // 1: patients with balances (already sorted desc by the query)
    state.selectQueue.push([
      { id: 'p1', firstName: 'Marcus', lastName: 'Johnson', email: 'm@x.com', balanceCents: 42_000 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: null, balanceCents: 8_500 },
    ])
    // 2: pay-link requests, newest first — p1 has two (latest wins)
    state.selectQueue.push([
      { patientId: 'p1', status: 'sent', sentAt: new Date('2026-06-27T12:00:00Z') },
      { patientId: 'p1', status: 'paid', sentAt: new Date('2026-05-01T12:00:00Z') },
    ])
    // 3: completed payments, newest first
    state.selectQueue.push([
      { patientId: 'p1', amountCents: 5_000, paidAt: new Date('2026-06-01T12:00:00Z') },
    ])
    // 4: month-to-date collected sum
    state.selectQueue.push([{ total: 12_500 }])

    const board = await getCollectionsBoard('org_1', { now: NOW })

    expect(board.totalOutstandingCents).toBe(50_500)
    expect(board.patientCount).toBe(2)
    expect(board.collectedThisMonthCents).toBe(12_500)
    expect(board.withLinkOut).toBe(1)

    expect(board.rows[0]).toMatchObject({
      patientId: 'p1',
      name: 'Marcus Johnson',
      hasEmail: true,
      balanceCents: 42_000,
      payLink: { status: 'sent', sentAt: new Date('2026-06-27T12:00:00Z') }, // the LATEST request
      lastPaidCents: 5_000,
    })
    expect(board.rows[1]).toMatchObject({
      patientId: 'p2',
      hasEmail: false,
      payLink: null,
      lastPaidAt: null,
    })
  })

  it('renders the empty practice cleanly (no balances → zeroed board)', async () => {
    state.selectQueue.push([]) // no patients with balances
    state.selectQueue.push([{ total: 0 }]) // month-to-date sum still queried
    const board = await getCollectionsBoard('org_1', { now: NOW })
    expect(board).toMatchObject({
      totalOutstandingCents: 0,
      patientCount: 0,
      collectedThisMonthCents: 0,
      withLinkOut: 0,
      rows: [],
    })
  })
})
