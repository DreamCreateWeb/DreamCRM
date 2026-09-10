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
    obj.innerJoin = () => obj
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
    // 1: the whole-clinic snapshot (getCollectionsSnapshot)
    state.selectQueue.push([{ patientCount: 2, totalOutstandingCents: '50500' }])
    // 2: the whole-clinic pay-links-out count
    state.selectQueue.push([{ count: 1 }])
    // 3: patients with balances (already sorted desc by the query)
    state.selectQueue.push([
      { id: 'p1', firstName: 'Marcus', lastName: 'Johnson', email: 'm@x.com', balanceCents: 42_000 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: null, balanceCents: 8_500 },
    ])
    // 4: pay-link requests, newest first — p1 has two (latest wins)
    state.selectQueue.push([
      { patientId: 'p1', status: 'sent', sentAt: new Date('2026-06-27T12:00:00Z') },
      { patientId: 'p1', status: 'paid', sentAt: new Date('2026-05-01T12:00:00Z') },
    ])
    // 5: completed payments, newest first
    state.selectQueue.push([
      { patientId: 'p1', amountCents: 5_000, paidAt: new Date('2026-06-01T12:00:00Z') },
    ])
    // 6: month-to-date collected sum
    state.selectQueue.push([{ total: 12_500 }])

    const board = await getCollectionsBoard('org_1', { now: NOW })

    expect(board.totalOutstandingCents).toBe(50_500)
    expect(board.patientCount).toBe(2)
    expect(board.collectedThisMonthCents).toBe(12_500)
    expect(board.withLinkOut).toBe(1)
    expect(board.truncated).toBe(false)

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
    state.selectQueue.push([{ patientCount: 0, totalOutstandingCents: '0' }])
    state.selectQueue.push([{ count: 0 }])
    state.selectQueue.push([]) // no patients with balances
    state.selectQueue.push([{ total: 0 }]) // month-to-date sum still queried
    const board = await getCollectionsBoard('org_1', { now: NOW })
    expect(board).toMatchObject({
      totalOutstandingCents: 0,
      patientCount: 0,
      collectedThisMonthCents: 0,
      withLinkOut: 0,
      truncated: false,
      rows: [],
    })
  })

  /**
   * THE TRUNCATION DEFECT (R1·S2 ledger line): the header used to reduce over
   * the 200-row PAGE, so a practice with 340 open balances was told its
   * outstanding AR was whatever its top 200 debtors owed — and the number
   * disagreed with the Payments hub's doorway card, which had always
   * aggregated in SQL. These pin that the header is a whole-clinic fact and
   * the page says when it is showing less than all of it.
   */
  it('the header totals count the WHOLE clinic, not the visible page', async () => {
    // 340 patients carry a balance; the board only ever fetches the top 2 here.
    state.selectQueue.push([{ patientCount: 340, totalOutstandingCents: '9876500' }])
    state.selectQueue.push([{ count: 120 }])
    state.selectQueue.push([
      { id: 'p1', firstName: 'Marcus', lastName: 'Johnson', email: 'm@x.com', balanceCents: 42_000 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: null, balanceCents: 8_500 },
    ])
    state.selectQueue.push([]) // no pay-link requests among the visible rows
    state.selectQueue.push([]) // no completed payments among the visible rows
    state.selectQueue.push([{ total: 0 }])

    const board = await getCollectionsBoard('org_1', { now: NOW })

    expect(board.totalOutstandingCents).toBe(9_876_500) // NOT 50_500
    expect(board.patientCount).toBe(340) // NOT 2
    // "N of M" has to count the same M — this is whole-clinic too, even
    // though not one visible row has a link out.
    expect(board.withLinkOut).toBe(120)
    expect(board.truncated).toBe(true)
    expect(board.rows).toHaveLength(2)
  })

  it('a clinic-sized total survives the sum cast (bigint, not int4)', async () => {
    // sum() over an int4 column returns bigint; pg hands it back as a STRING.
    // Casting back to ::int would ERROR above ~$21M rather than wrap.
    state.selectQueue.push([{ patientCount: 3, totalOutstandingCents: '3000000000' }])
    state.selectQueue.push([{ count: 0 }])
    state.selectQueue.push([])
    state.selectQueue.push([{ total: 0 }])
    const board = await getCollectionsBoard('org_1', { now: NOW })
    expect(board.totalOutstandingCents).toBe(3_000_000_000)
  })
})
