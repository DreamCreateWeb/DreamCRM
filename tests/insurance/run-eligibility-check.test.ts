import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runEligibilityCheck — the service's one entry point. Pins: validation
 * failures never insert; a provider throw still inserts an `error` row and
 * returns ok; a client-supplied patient id outside the org is stored as null;
 * the ledger is narrated under `insurance_check`; a DB failure returns a typed
 * refusal rather than throwing.
 */

const state = {
  patients: [] as Array<{ id: string; firstName: string; lastName: string }>,
  org: [{ isDemo: false }] as Array<{ isDemo: boolean }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  failInsert: false,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    obj.from = (t: unknown) => {
      table = t
      return obj
    }
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => {
      if (table === schema.patient) return state.patients
      if (table === schema.organization) return state.org
      return []
    }
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: async (vals: Record<string, unknown>) => {
          if (state.failInsert) throw new Error('db down')
          state.inserts.push({ table: t === schema.insuranceVerification ? 'insurance_verification' : 'other', values: vals })
        },
      }),
    },
    schema,
  }
})

// The Stedi driver's network half is replaced so the resolver can be exercised
// under INSURANCE_DRIVER=stedi without a key or a payer.
vi.mock('@/lib/services/insurance-eligibility/stedi', () => ({
  makeStediProvider: (id: string) => ({
    id,
    check: async () => ({
      status: 'active',
      payerName: 'Ameritas',
      planName: null,
      coverage: { effective: '2026-01-01', termination: null },
      network: 'unknown',
      annualMax: null,
      deductible: null,
      coveragePct: null,
      waitingPeriods: [],
      frequencies: [],
      missingToothClause: null,
      notes: [],
      asOf: '2026-09-30T15:00:00.000Z',
    }),
  }),
  searchStediPayers: async () => [],
}))

const recordAction = vi.fn(async (_input: Record<string, unknown>) => true)
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: (input: Record<string, unknown>) => recordAction(input) }))

import { runEligibilityCheck } from '@/lib/services/insurance-eligibility'

const NOW = new Date('2026-09-30T15:00:00Z')

function input(memberId = 'DD-100-2231') {
  return {
    patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
    carrierName: 'Delta Dental',
    memberId,
    groupNumber: null,
    relationship: 'self',
    subscriber: null,
  }
}

beforeEach(() => {
  state.patients = []
  state.org = [{ isDemo: false }]
  state.inserts = []
  state.failInsert = false
  recordAction.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runEligibilityCheck', () => {
  it('stores an active answer, narrates it, and returns the view', async () => {
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes' }]
    const r = await runEligibilityCheck('org_a', { input: input(), patientId: 'pat_1', userId: 'u_1', now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.check.driver).toBe('sandbox')
    expect(r.check.patientId).toBe('pat_1')
    expect(r.check.patientName).toBe('Mia Hayes')
    expect(r.check.status).not.toBe('error')
    expect(r.check.checkedAtIso).toBe(NOW.toISOString())
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].table).toBe('insurance_verification')
    expect(state.inserts[0].values.organizationId).toBe('org_a')
    expect(recordAction).toHaveBeenCalledTimes(1)
    const call = recordAction.mock.calls[0][0] as Record<string, unknown>
    expect(call.capability).toBe('insurance_check')
    expect(call.patientId).toBe('pat_1')
    expect(call.organizationId).toBe('org_a')
    expect(String(call.summary)).toMatch(/^Looked up Mia Hayes/)
    expect((call.detail as Record<string, unknown>).initiatedBy).toBe('staff')
  })

  it('a validation failure returns field errors and inserts NOTHING', async () => {
    const r = await runEligibilityCheck('org_a', { input: { ...input(), memberId: '' }, now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.memberId).toBeTruthy()
    expect(state.inserts).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()
  })

  it('a provider throw becomes a stored error row and still returns ok', async () => {
    const r = await runEligibilityCheck('org_a', { input: input('DD-100-0001'), now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.check.status).toBe('error')
    expect(r.check.result).toBeNull()
    expect(r.check.error).toMatch(/timeout/i)
    expect(state.inserts[0].values.status).toBe('error')
    expect(state.inserts[0].values.result).toBeNull()
    expect(recordAction).toHaveBeenCalledTimes(1)
    expect(String((recordAction.mock.calls[0][0] as Record<string, unknown>).summary)).toMatch(/couldn’t check/i)
  })

  it('a patient id the org does not own is stored as null, never trusted', async () => {
    state.patients = []
    const r = await runEligibilityCheck('org_a', { input: input(), patientId: 'pat_of_another_org', now: NOW })
    expect(r.ok && r.check.patientId).toBeNull()
    expect(state.inserts[0].values.patientId).toBeNull()
  })

  it('the demo org gets the configured driver like any other org — no silent sandbox swap', async () => {
    // Only a platform admin can act in the demo org, and a check is a
    // deliberate click; swapping their test to the sandbox (the first draft)
    // turned a real answer into a fake one without saying so.
    state.org = [{ isDemo: true }]
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    const r = await runEligibilityCheck('org_demo', { input: input(), now: NOW })
    delete process.env.INSURANCE_DRIVER
    delete process.env.STEDI_MODE
    expect(r.ok && r.check.driver).toBe('stedi')
    expect(r.ok && r.check.status).toBe('active')
  })

  it('a database failure returns a typed refusal instead of throwing', async () => {
    state.failInsert = true
    const r = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors._form).toMatch(/could not save/i)
    expect(recordAction).not.toHaveBeenCalled()
  })
})
