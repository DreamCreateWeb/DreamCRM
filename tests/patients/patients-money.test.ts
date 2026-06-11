import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Patients money derivation. Under test: outstanding balance reads
 * patient.pms_balance_cents (NULL stays NULL — never a fabricated $0), the $
 * glyph fires only on a positive PMS balance, and shop spend sums paid
 * shop_order totals (NOT the dead legacy invoices table).
 */

const state = {
  patient: [] as Array<Record<string, unknown>>,
  shopOrder: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const c = await import('@/lib/db/schema/clinic')
  const schema = await import('@/lib/db/schema')
  function rowsFor(table: unknown): unknown[] {
    if (table === c.patient) return state.patient
    if (table === c.shopOrder) return state.shopOrder
    // appointment / formSubmission / messages / etc → empty (no visits/contacts)
    return []
  }
  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(rows: unknown[]): Chain {
    const p = Promise.resolve(rows) as Chain
    p.from = (t: unknown) => chain(rowsFor(t))
    p.innerJoin = () => p
    p.leftJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.groupBy = () => p
    p.limit = () => p
    return p
  }
  return { db: { select: () => chain([]) }, schema }
})

vi.mock('@/lib/services/recall-status', () => ({
  derivePatientRecallStatus: () => 'na',
}))

import { listPatients, getPatientHeader } from '@/lib/services/patients'

function patientRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pat_1',
    organizationId: 'org_1',
    firstName: 'Mia',
    lastName: 'Hayes',
    email: 'mia@x.com',
    phone: null,
    dateOfBirth: null,
    source: 'booking',
    lifecycle: 'active',
    isActive: 1,
    firstSeenAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    lastActivityAt: null,
    userId: null,
    marketingEmailOptIn: 1,
    pmsBalanceCents: null,
    pmsBalanceUpdatedAt: null,
    pmsRecallDueAt: null,
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    insuranceProvider: null,
    insurancePolicyNumber: null,
    insuranceGroupNumber: null,
    notes: null,
    guardianPatientId: null,
    ...over,
  }
}

beforeEach(() => {
  state.patient = []
  state.shopOrder = []
})

describe('listPatients money derivation', () => {
  it('null PMS balance stays null (no fabricated $0) and the $ glyph stays off', async () => {
    state.patient = [patientRow({ pmsBalanceCents: null })]
    const [row] = await listPatients('org_1')
    expect(row.outstandingBalanceCents).toBeNull()
    expect(row.flags.hasOutstandingBalance).toBe(false)
  })

  it('a positive PMS balance flows through + fires the $ glyph', async () => {
    const asOf = new Date('2026-05-01')
    state.patient = [patientRow({ pmsBalanceCents: 12500, pmsBalanceUpdatedAt: asOf })]
    const [row] = await listPatients('org_1')
    expect(row.outstandingBalanceCents).toBe(12500)
    expect(row.balanceAsOf).toEqual(asOf)
    expect(row.flags.hasOutstandingBalance).toBe(true)
  })

  it('a zero PMS balance is a real 0 (synced, paid up) — glyph off', async () => {
    state.patient = [patientRow({ pmsBalanceCents: 0, pmsBalanceUpdatedAt: new Date() })]
    const [row] = await listPatients('org_1')
    expect(row.outstandingBalanceCents).toBe(0)
    expect(row.flags.hasOutstandingBalance).toBe(false)
  })

  it('shop spend sums paid shop_order totals for the patient', async () => {
    state.patient = [patientRow()]
    state.shopOrder = [{ patientId: 'pat_1', totalCents: 9500 }]
    const [row] = await listPatients('org_1')
    expect(row.shopSpendCents).toBe(9500)
  })
})

describe('getPatientHeader money derivation', () => {
  it('reads the PMS balance + shop spend, keeps null balance null', async () => {
    state.patient = [patientRow({ pmsBalanceCents: null })]
    state.shopOrder = [{ totalCents: 24000 }]
    const header = await getPatientHeader('org_1', 'pat_1')
    expect(header).not.toBeNull()
    expect(header!.outstandingBalanceCents).toBeNull()
    expect(header!.shopSpendCents).toBe(24000)
    expect(header!.flags.hasOutstandingBalance).toBe(false)
  })
})
