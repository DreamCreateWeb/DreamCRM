import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Shape coverage for getMyRecords. The CRM "My Records" page shows
 * three distinct sources — patient row, form submissions, completed
 * visits. Each branch is mocked + asserted independently so a missing
 * source never silently drops.
 */

const state = {
  patient: null as Record<string, unknown> | null,
  forms: [] as Array<Record<string, unknown>>,
  visits: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  type ChainShape = Promise<unknown[]> & {
    from: (t: unknown) => ChainShape
    innerJoin: () => ChainShape
    leftJoin: () => ChainShape
    where: () => ChainShape
    orderBy: () => ChainShape
    limit: () => ChainShape
  }
  function chain(rows: unknown[]): ChainShape {
    const p = Promise.resolve(rows) as ChainShape
    p.from = () => p
    p.innerJoin = () => p
    p.leftJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.limit = () => p
    return p
  }
  return {
    db: {
      select: (sel?: Record<string, unknown>) => {
        const keys = sel ? Object.keys(sel) : []
        if (keys.includes('insuranceProvider')) {
          return chain(state.patient ? [state.patient] : [])
        }
        if (keys.includes('formTitle')) {
          return chain(state.forms)
        }
        if (keys.includes('startTime')) {
          return chain(state.visits)
        }
        return chain([])
      },
    },
  }
})

vi.mock('@/lib/db/schema/clinic', () => ({
  patient: { id: 'p.id', organizationId: 'p.org', firstName: 'p.fn', lastName: 'p.ln', email: 'p.em', phone: 'p.ph', dateOfBirth: 'p.dob', addressLine1: 'p.a1', city: 'p.city', state: 'p.state', postalCode: 'p.zip', insuranceProvider: 'p.ip', insurancePolicyNumber: 'p.ipn', insuranceGroupNumber: 'p.ign' },
  appointment: { id: 'a.id', patientId: 'a.pat', organizationId: 'a.org', status: 'a.st', type: 'a.t', startTime: 'a.start', notes: 'a.n' },
  shopOrder: {},
  shopOrderItem: {},
  membership: {},
  membershipPlan: {},
  formSubmission: { id: 'fs.id', patientId: 'fs.pat', organizationId: 'fs.org', formTemplateId: 'fs.ft', submittedAt: 'fs.sa' },
  formTemplate: { id: 'ft.id', title: 'ft.title' },
  // Portal v2 additions — referenced at module level by patient-portal.ts
  // (visitSelection / balance payments); empty objects satisfy the import.
  clinicProvider: { id: 'cp.id', displayName: 'cp.dn' },
  patientBalancePayment: {},
}))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: {} }))
vi.mock('@/lib/services/patient-messaging', () => ({
  getOrCreatePatientThread: vi.fn(),
  listMessagesInThread: vi.fn(),
  recordInboundMessage: vi.fn(),
}))
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
  state.forms = []
  state.visits = []
})

async function callGetMyRecords() {
  const { getMyRecords } = await import('@/lib/services/patient-portal')
  return getMyRecords('pat_1', 'org_1')
}

describe('getMyRecords', () => {
  it('returns null when the patient row is missing', async () => {
    const r = await callGetMyRecords()
    expect(r).toBeNull()
  })

  it('returns the patient block + empty sections when nothing else on file', async () => {
    state.patient = {
      firstName: 'Mia',
      lastName: 'Hayes',
      email: 'mia@example.com',
      phone: '555-0100',
      dateOfBirth: '1990-04-15',
      addressLine1: '12 Linden Ave',
      city: 'Brooklyn',
      state: 'NY',
      postalCode: '11201',
      insuranceProvider: null,
      insurancePolicyNumber: null,
      insuranceGroupNumber: null,
    }
    const r = await callGetMyRecords()
    expect(r).not.toBeNull()
    expect(r?.patient.firstName).toBe('Mia')
    expect(r?.patient.insuranceProvider).toBe(null)
    expect(r?.forms).toEqual([])
    expect(r?.visits).toEqual([])
  })

  it('includes form submissions joined to the template title', async () => {
    state.patient = { firstName: 'M', lastName: 'H', email: null, phone: null, dateOfBirth: null, addressLine1: null, city: null, state: null, postalCode: null, insuranceProvider: 'Delta', insurancePolicyNumber: 'POL-1', insuranceGroupNumber: null }
    state.forms = [
      { submissionId: 'sub_1', formTitle: 'New Patient Intake', submittedAt: new Date('2026-04-01T00:00:00Z') },
      { submissionId: 'sub_2', formTitle: 'Health History Update', submittedAt: new Date('2026-05-01T00:00:00Z') },
    ]
    const r = await callGetMyRecords()
    expect(r?.forms).toHaveLength(2)
    expect(r?.forms[0].formTitle).toBe('New Patient Intake')
    expect(r?.patient.insuranceProvider).toBe('Delta')
  })

  it('only includes completed visits in the visit history', async () => {
    // The SQL filters status='completed' at query time, so the mock just
    // simulates what the DB would have returned.
    state.patient = { firstName: 'M', lastName: 'H', email: null, phone: null, dateOfBirth: null, addressLine1: null, city: null, state: null, postalCode: null, insuranceProvider: null, insurancePolicyNumber: null, insuranceGroupNumber: null }
    state.visits = [
      { id: 'apt_1', type: 'cleaning', startTime: new Date('2026-03-15T09:00:00Z'), notes: null, providerName: 'Dr. Reyes' },
      { id: 'apt_2', type: 'checkup', startTime: new Date('2025-10-12T09:00:00Z'), notes: 'Sealants placed' },
    ]
    const r = await callGetMyRecords()
    expect(r?.visits).toHaveLength(2)
    expect(r?.visits[0].type).toBe('cleaning')
    expect(r?.visits[1].notes).toBe('Sealants placed')
    // Provider name flows from the left join; null when no provider was assigned.
    expect(r?.visits[0].providerName).toBe('Dr. Reyes')
    expect(r?.visits[1].providerName).toBe(null)
  })
})
