import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getThreadPatientContext maps the patients-list header derivation down to a
 * slim, serializable shape for the message-thread context strip. It must reuse
 * getPatientHeader (the single source of truth for next/last visit, the honest
 * PMS-balance framing, and the missing-intake flag) — not re-derive it.
 */

const getPatientHeader = vi.fn()
vi.mock('@/lib/services/patients', () => ({ getPatientHeader }))
// patient-messaging imports these at module load; stub so the import resolves.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))

import { getThreadPatientContext } from '@/lib/services/patient-messaging'

const NEXT = new Date('2026-06-18T15:00:00.000Z')
const LAST = new Date('2026-01-10T15:00:00.000Z')
const ASOF = new Date('2026-06-01T00:00:00.000Z')

function header(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pat_1',
    nextVisitAt: NEXT,
    nextVisitType: 'Cleaning',
    lastVisitAt: LAST,
    outstandingBalanceCents: 12300,
    balanceAsOf: ASOF,
    flags: { missingIntakeBeforeAppt: true },
    ...overrides,
  }
}

beforeEach(() => getPatientHeader.mockReset())

describe('getThreadPatientContext', () => {
  it('maps the header into the slim strip shape with ISO dates', async () => {
    getPatientHeader.mockResolvedValue(header())
    const ctx = await getThreadPatientContext('org_1', 'pat_1')
    expect(getPatientHeader).toHaveBeenCalledWith('org_1', 'pat_1')
    expect(ctx).toEqual({
      patientId: 'pat_1',
      nextVisitAt: NEXT.toISOString(),
      nextVisitType: 'Cleaning',
      lastVisitAt: LAST.toISOString(),
      outstandingBalanceCents: 12300,
      balanceAsOf: ASOF.toISOString(),
      missingIntake: true,
    })
  })

  it('returns null when the patient is not in the org', async () => {
    getPatientHeader.mockResolvedValue(null)
    expect(await getThreadPatientContext('org_1', 'ghost')).toBeNull()
  })

  it('passes through nulls (no visits / no PMS balance) without fabricating', async () => {
    getPatientHeader.mockResolvedValue(
      header({
        nextVisitAt: null,
        nextVisitType: null,
        lastVisitAt: null,
        outstandingBalanceCents: null, // honest "no PMS balance", never $0
        balanceAsOf: null,
        flags: { missingIntakeBeforeAppt: false },
      }),
    )
    const ctx = await getThreadPatientContext('org_1', 'pat_1')
    expect(ctx).toEqual({
      patientId: 'pat_1',
      nextVisitAt: null,
      nextVisitType: null,
      lastVisitAt: null,
      outstandingBalanceCents: null,
      balanceAsOf: null,
      missingIntake: false,
    })
  })
})
