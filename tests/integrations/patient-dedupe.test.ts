import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PMS patient dedupe: linking an incoming PMS patient to an existing DreamCRM
 * row. Phone numbers are routinely SHARED across a household in dental (parent +
 * kids on one line), so a bare phone match must NOT link — it would bind a PMS
 * child to a DreamCRM parent and corrupt both identities.
 */

const state = { candidates: [] as Array<Record<string, unknown>> }

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => state.candidates }) }),
  },
  schema: {
    patient: { id: 'id', email: 'email', phone: 'phone', lastName: 'lastName', organizationId: 'org', isActive: 'isActive' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  desc: vi.fn((x) => x),
  eq: vi.fn(() => ({ _: 'eq' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
}))

import { findUnmappedPatientByContact } from '@/lib/services/pms/sync'

const NONE = new Set<string>()

beforeEach(() => {
  state.candidates = []
})

describe('findUnmappedPatientByContact', () => {
  it('links on an exact email match', async () => {
    state.candidates = [{ id: 'p_email', email: 'mia@x.com', phone: null, lastName: 'Hayes' }]
    expect(await findUnmappedPatientByContact('org', NONE, 'mia@x.com', null, 'Hayes')).toBe('p_email')
  })

  it('links on a phone match when the last name also matches and the phone is unique', async () => {
    state.candidates = [{ id: 'p_phone', email: null, phone: '5125559117', lastName: 'Hayes' }]
    expect(await findUnmappedPatientByContact('org', NONE, null, '5125559117', 'Hayes')).toBe('p_phone')
  })

  it('does NOT link a phone match with a DIFFERENT last name (the shared-family-phone bug)', async () => {
    // PMS row is the child "Aiden Hayes"; the only DreamCRM row on this phone is
    // the parent "Mom Hayes"? No — different surname here proves the guard:
    state.candidates = [{ id: 'p_parent', email: null, phone: '5125559117', lastName: 'Vega' }]
    expect(await findUnmappedPatientByContact('org', NONE, null, '5125559117', 'Hayes')).toBeNull()
  })

  it('does NOT link when two unmapped patients share the phone (ambiguous)', async () => {
    state.candidates = [
      { id: 'p_a', email: null, phone: '5125559117', lastName: 'Hayes' },
      { id: 'p_b', email: null, phone: '5125559117', lastName: 'Hayes' },
    ]
    expect(await findUnmappedPatientByContact('org', NONE, null, '5125559117', 'Hayes')).toBeNull()
  })

  it('prefers an email match over a phone-only candidate', async () => {
    state.candidates = [
      { id: 'p_phone', email: null, phone: '5125559117', lastName: 'Hayes' },
      { id: 'p_email', email: 'mia@x.com', phone: null, lastName: 'Hayes' },
    ]
    expect(await findUnmappedPatientByContact('org', NONE, 'mia@x.com', '5125559117', 'Hayes')).toBe('p_email')
  })

  it('skips already-mapped candidates', async () => {
    state.candidates = [{ id: 'p_mapped', email: 'mia@x.com', phone: null, lastName: 'Hayes' }]
    expect(await findUnmappedPatientByContact('org', new Set(['p_mapped']), 'mia@x.com', null, 'Hayes')).toBeNull()
  })

  it('returns null when neither email nor phone is provided', async () => {
    state.candidates = [{ id: 'p', email: 'x@x.com', phone: '111', lastName: 'Hayes' }]
    expect(await findUnmappedPatientByContact('org', NONE, null, null, 'Hayes')).toBeNull()
  })

  it('does NOT link a phone match when the PMS record has no last name to confirm', async () => {
    state.candidates = [{ id: 'p_phone', email: null, phone: '5125559117', lastName: 'Hayes' }]
    expect(await findUnmappedPatientByContact('org', NONE, null, '5125559117', null)).toBeNull()
  })
})
