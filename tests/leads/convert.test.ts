import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture mutations inside the convert transaction. Patient-dupe and
// lead-not-found cases are also exercised via `state.dupesResult` +
// `state.leadResult`.
const state = {
  leadResult: null as Array<Record<string, unknown>> | null,
  dupesResult: null as Array<Record<string, unknown>> | null,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

// convertLeadToPatient no longer uses db.transaction() — the Neon HTTP
// driver doesn't support transactions (calls fail at runtime with "No
// transactions support in neon-http driver"). The writes run directly off
// the top-level `db`, so the mock routes select/insert/update through the
// shared `state` capture. NB: there is intentionally NO `transaction`
// method here — if the implementation ever reintroduces one, these tests
// will throw "transaction is not a function", catching the regression.
function dbMethods() {
  return {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'lead') return state.leadResult ?? []
            if (t === 'patient') return state.dupesResult ?? []
            return []
          },
        }),
      }),
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: String(t), set: s })
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: String(t), values })
      },
    }),
  }
}

vi.mock('@/lib/db', () => ({
  db: dbMethods(),
  schema: {
    lead: 'lead',
    patient: 'patient',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _kind: 'and' })),
  eq: vi.fn(() => ({ _kind: 'eq' })),
  or: vi.fn(() => ({ _kind: 'or' })),
  isNull: vi.fn(() => ({ _kind: 'isNull' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _kind: 'count' })),
  sql: Object.assign(vi.fn(() => ({ _kind: 'sql' })), { raw: vi.fn() }),
}))

import { convertLeadToPatient, findConvertDedupeMatch } from '@/lib/services/leads'

beforeEach(() => {
  state.leadResult = null
  state.dupesResult = null
  state.updates = []
  state.inserts = []
})

describe('convertLeadToPatient — lead → patient lifecycle bridge', () => {
  it('throws when the lead does not exist', async () => {
    state.leadResult = []
    await expect(convertLeadToPatient('org_1', 'lead_missing')).rejects.toThrow(/not found/i)
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('creates a new patient + flips lead status when no dupe exists', async () => {
    state.leadResult = [{
      id: 'lead_1',
      organizationId: 'org_1',
      name: 'Olivia Chen',
      phone: '(415) 555-0188',
      email: 'olivia@example.com',
      convertedToPatientId: null,
      createdAt: new Date('2026-05-01T10:00:00Z'),
    }]
    state.dupesResult = []

    const out = await convertLeadToPatient('org_1', 'lead_1')

    // New patient row inserted with source = 'lead_form'
    expect(state.inserts).toHaveLength(1)
    const patientInsert = state.inserts[0]
    expect(patientInsert.table).toBe('patient')
    expect(patientInsert.values.source).toBe('lead_form')
    expect(patientInsert.values.firstName).toBe('Olivia')
    expect(patientInsert.values.lastName).toBe('Chen')
    expect(patientInsert.values.email).toBe('olivia@example.com')
    expect(patientInsert.values.phone).toBe('(415) 555-0188')
    expect(patientInsert.values.lifecycle).toBe('new')
    // firstSeenAt copied from the lead's createdAt
    expect(patientInsert.values.firstSeenAt).toEqual(new Date('2026-05-01T10:00:00Z'))

    // Lead row flipped to converted with pointer back
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].table).toBe('lead')
    expect(state.updates[0].set.status).toBe('converted')
    expect(state.updates[0].set.convertedToPatientId).toBe(out.patientId)
    expect(state.updates[0].set.convertedAt).toBeInstanceOf(Date)

    expect(out.leadId).toBe('lead_1')
    expect(out.patientId).toMatch(/^pat_/)
    // New patient → not deduped, name reflects the lead's split name
    expect(out.deduped).toBe(false)
    expect(out.patientName).toBe('Olivia Chen')
  })

  it('reuses an existing patient when email or phone matches (no duplicate)', async () => {
    state.leadResult = [{
      id: 'lead_2',
      organizationId: 'org_1',
      name: 'Daniel Park',
      phone: '(415) 555-0119',
      email: null,
      convertedToPatientId: null,
      createdAt: new Date(),
    }]
    state.dupesResult = [{ id: 'pat_existing_dan', firstName: 'Daniel', lastName: 'Park' }]

    const out = await convertLeadToPatient('org_1', 'lead_2')

    // No new patient inserted — we reused the dupe
    expect(state.inserts).toHaveLength(0)
    // Lead still flips to converted, pointing at the existing patient
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set.convertedToPatientId).toBe('pat_existing_dan')
    expect(out.patientId).toBe('pat_existing_dan')
    // Deduped → flag set + name comes from the matched patient
    expect(out.deduped).toBe(true)
    expect(out.patientName).toBe('Daniel Park')
  })

  it('forceNewPatient skips the dedupe and inserts a separate patient', async () => {
    state.leadResult = [{
      id: 'lead_2b',
      organizationId: 'org_1',
      name: 'Danny Park Jr',
      phone: '(415) 555-0119', // same phone as an existing patient
      email: null,
      convertedToPatientId: null,
      createdAt: new Date(),
    }]
    state.dupesResult = [{ id: 'pat_existing_dan', firstName: 'Daniel', lastName: 'Park' }]

    const out = await convertLeadToPatient('org_1', 'lead_2b', { forceNewPatient: true })

    // A NEW patient row is inserted despite the phone match
    expect(state.inserts).toHaveLength(1)
    expect(out.deduped).toBe(false)
    expect(out.patientId).toMatch(/^pat_/)
    expect(out.patientId).not.toBe('pat_existing_dan')
    expect(out.patientName).toBe('Danny Park Jr')
  })

  it('is idempotent — re-converting an already-converted lead returns the same patient', async () => {
    state.leadResult = [{
      id: 'lead_3',
      organizationId: 'org_1',
      name: 'Emma Lopez',
      phone: '(415) 555-0234',
      email: 'emma@example.com',
      convertedToPatientId: 'pat_emma_already',
      createdAt: new Date(),
    }]

    const out = await convertLeadToPatient('org_1', 'lead_3')

    expect(out.patientId).toBe('pat_emma_already')
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('handles single-word names by defaulting lastName to empty string', async () => {
    state.leadResult = [{
      id: 'lead_4',
      organizationId: 'org_1',
      name: 'Cher',
      phone: '(415) 555-0000',
      email: null,
      convertedToPatientId: null,
      createdAt: new Date(),
    }]
    state.dupesResult = []

    await convertLeadToPatient('org_1', 'lead_4')

    const patientInsert = state.inserts.find((i) => i.table === 'patient')!
    expect(patientInsert.values.firstName).toBe('Cher')
    expect(patientInsert.values.lastName).toBe('')
  })

  it('splits multi-word names on the first space (last+middle stays in lastName)', async () => {
    state.leadResult = [{
      id: 'lead_5',
      organizationId: 'org_1',
      name: 'Maria del Carmen Rodriguez',
      phone: '(415) 555-0099',
      email: null,
      convertedToPatientId: null,
      createdAt: new Date(),
    }]
    state.dupesResult = []

    await convertLeadToPatient('org_1', 'lead_5')

    const patientInsert = state.inserts.find((i) => i.table === 'patient')!
    expect(patientInsert.values.firstName).toBe('Maria')
    expect(patientInsert.values.lastName).toBe('del Carmen Rodriguez')
  })
})

describe('findConvertDedupeMatch — pre-convert dry run', () => {
  it('returns the matched patient when email/phone collides', async () => {
    state.leadResult = [{
      email: 'shared@example.com',
      phone: '(415) 555-0119',
      convertedToPatientId: null,
    }]
    state.dupesResult = [{ id: 'pat_parent', firstName: 'Parent', lastName: 'Smith' }]

    const match = await findConvertDedupeMatch('org_1', 'lead_x')
    expect(match).toEqual({ id: 'pat_parent', name: 'Parent Smith' })
    // Pure read — no writes
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('returns null when no patient matches', async () => {
    state.leadResult = [{ email: 'fresh@example.com', phone: '(999) 999-9999', convertedToPatientId: null }]
    state.dupesResult = []
    const match = await findConvertDedupeMatch('org_1', 'lead_y')
    expect(match).toBeNull()
  })

  it('returns null for an already-converted lead (no double-merge prompt)', async () => {
    state.leadResult = [{ email: 'x@example.com', phone: '(415) 555-0119', convertedToPatientId: 'pat_already' }]
    state.dupesResult = [{ id: 'pat_parent', firstName: 'Parent', lastName: 'Smith' }]
    const match = await findConvertDedupeMatch('org_1', 'lead_z')
    expect(match).toBeNull()
  })
})
