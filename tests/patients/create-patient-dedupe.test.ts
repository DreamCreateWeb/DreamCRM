import { describe, it, expect, vi, beforeEach } from 'vitest'

// Candidate patients the dedupe pre-scan returns.
const candidates = { rows: [] as Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }> }
const inserted: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => candidates.rows }),
      }),
    }),
    insert: () => ({
      values: async (vals: Record<string, unknown>) => {
        inserted.push(vals)
      },
    }),
  },
  schema: {
    patient: {
      id: 'id',
      organizationId: 'organizationId',
      email: 'email',
      phone: 'phone',
      isActive: 'isActive',
      firstName: 'firstName',
      lastName: 'lastName',
    },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  asc: (x: unknown) => x,
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ _eq: a }),
  gte: () => ({}),
  inArray: () => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
  lte: () => ({}),
  ne: () => ({}),
  or: (...a: unknown[]) => ({ _or: a }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}))

vi.mock('@/lib/services/recall-status', () => ({
  derivePatientRecallStatus: () => 'na',
}))

import { createPatient } from '@/lib/services/patients'

beforeEach(() => {
  candidates.rows = []
  inserted.length = 0
})

describe('createPatient dedupe', () => {
  it('inserts and returns { id } when no duplicate exists', async () => {
    const r = await createPatient({ organizationId: 'org_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' })
    expect('id' in r).toBe(true)
    expect(inserted).toHaveLength(1)
  })

  it('returns { duplicateOf } when an existing patient matches by email (case-insensitive)', async () => {
    candidates.rows = [{ id: 'pat_existing', firstName: 'Jane', lastName: 'Doe', email: 'JANE@X.COM', phone: null }]
    const r = await createPatient({ organizationId: 'org_1', firstName: 'Janie', lastName: 'Doe', email: 'jane@x.com' })
    expect(r).toEqual({ duplicateOf: { id: 'pat_existing', name: 'Jane Doe' } })
    expect(inserted).toHaveLength(0)
  })

  it('returns { duplicateOf } when an existing patient matches by phone (formatting-insensitive)', async () => {
    candidates.rows = [{ id: 'pat_existing', firstName: 'John', lastName: 'Roe', email: null, phone: '(555) 111-2222' }]
    const r = await createPatient({ organizationId: 'org_1', firstName: 'Jon', lastName: 'Roe', phone: '1-555-111-2222' })
    expect('duplicateOf' in r && r.duplicateOf.id).toBe('pat_existing')
    expect(inserted).toHaveLength(0)
  })

  it('inserts anyway (skips the scan) when forceNew is set', async () => {
    candidates.rows = [{ id: 'pat_existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com', phone: null }]
    const r = await createPatient({ organizationId: 'org_1', firstName: 'Janie', lastName: 'Doe', email: 'jane@x.com', forceNew: true })
    expect('id' in r).toBe(true)
    expect(inserted).toHaveLength(1)
  })

  it('inserts without a scan when no email or phone is supplied', async () => {
    candidates.rows = [{ id: 'pat_existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com', phone: '5551112222' }]
    const r = await createPatient({ organizationId: 'org_1', firstName: 'Anon', lastName: 'Ymous' })
    expect('id' in r).toBe(true)
    expect(inserted).toHaveLength(1)
  })
})
