import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runEligibilityCheck — the service's one entry point. Pins: validation
 * failures never insert; a provider throw still inserts an `error` row and
 * returns ok; a client-supplied patient id outside the org is stored as null;
 * the ledger is narrated under `insurance_check`; a DB failure returns a typed
 * refusal rather than throwing.
 */

const state = {
  patients: [] as Array<{ id: string; firstName: string; lastName: string; insurancePolicyNumber?: string | null }>,
  org: [{ isDemo: false }] as Array<{ isDemo: boolean }>,
  profile: [] as Array<{ npi: string | null; enabledAt: Date | null }>,
  usage: { used: 0, included: 200, unreadable: false },
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
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
      if (table === schema.clinicProfile) return state.profile
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
      update: (t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              state.updates.push({ table: t === schema.patient ? 'patient' : 'other', values: vals })
              return [{ id: 'pat_1' }]
            },
          }),
        }),
      }),
    },
    schema,
  }
})

// The allowance counter is its own module (one query, fail-open) with its own test.
const getInsuranceUsage = vi.fn(async () => state.usage)
vi.mock('@/lib/services/insurance-eligibility/allowance', () => ({ getInsuranceUsage: (...a: unknown[]) => getInsuranceUsage(...(a as [])) }))

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

import { getInsuranceSetup, runEligibilityCheck } from '@/lib/services/insurance-eligibility'

const NOW = new Date('2026-09-30T15:00:00Z')
const ENABLED = new Date('2026-09-29T15:00:00Z')

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
  state.profile = [{ npi: null, enabledAt: ENABLED }]
  state.usage = { used: 0, included: 200, unreadable: false }
  getInsuranceUsage.mockClear()
  delete process.env.INSURANCE_DRIVER
  delete process.env.STEDI_MODE
  delete process.env.STEDI_DEFAULT_NPI
  state.inserts = []
  state.updates = []
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

  it('the demo org gets the configured driver like any other org once it can reach a payer — no silent sandbox swap', async () => {
    // Only a platform admin can act in the demo org, and a check is a
    // deliberate click; swapping their test to the sandbox (the first draft)
    // turned a real answer into a fake one without saying so.
    state.org = [{ isDemo: true }]
    state.profile = [{ npi: '1234567893', enabledAt: ENABLED }]
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    const r = await runEligibilityCheck('org_demo', { input: input(), now: NOW })
    expect(r.ok && r.check.driver).toBe('stedi')
    expect(r.ok && r.check.status).toBe('active')
  })

  it('the demo org with NO NPI under the live driver falls back to the LABELLED sandbox — the one honest swap', async () => {
    state.org = [{ isDemo: true }]
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    const r = await runEligibilityCheck('org_demo', { input: input(), now: NOW })
    expect(r.ok && r.check.driver).toBe('sandbox')
    expect(state.inserts[0].values.driver).toBe('sandbox')
    // A free answer is never counted against the allowance.
    expect(getInsuranceUsage).not.toHaveBeenCalled()
  })

  it('READINESS: a real clinic with no NPI under the live driver is refused BEFORE any row or any network call', async () => {
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    const r = await runEligibilityCheck('org_a', { input: input(), patientId: 'pat_1', now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('npi')
    expect(r.errors._form).toMatch(/NPI/)
    expect(state.inserts).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()
    expect(getInsuranceUsage).not.toHaveBeenCalled()
  })

  it('READINESS: the platform fallback NPI or test mode never refuses', async () => {
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    process.env.STEDI_DEFAULT_NPI = '1999999984'
    expect((await runEligibilityCheck('org_a', { input: input(), now: NOW })).ok).toBe(true)
    // A live check under the fallback NPI is still a BILLED check — counted.
    expect(getInsuranceUsage).toHaveBeenCalledTimes(1)
    getInsuranceUsage.mockClear()
    delete process.env.STEDI_DEFAULT_NPI
    process.env.STEDI_MODE = 'test'
    const r = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(r.ok && r.check.driver).toBe('stedi_test')
    expect(getInsuranceUsage).not.toHaveBeenCalled()
  })

  it('THE ALLOWANCE: a live check past the included count is refused before the payer is asked; under it, it runs', async () => {
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    state.profile = [{ npi: '1234567893', enabledAt: ENABLED }]
    state.usage = { used: 200, included: 200, unreadable: false }
    const refused = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toBe('over_allowance')
    expect(refused.errors._form).toMatch(/All 200 included checks used this month/)
    expect(state.inserts).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()

    state.usage = { used: 199, included: 200, unreadable: false }
    const ran = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(ran.ok && ran.check.driver).toBe('stedi')
    expect(state.inserts).toHaveLength(1)
  })

  it('THE ALLOWANCE fails OPEN: an unreadable count never refuses a check at the desk', async () => {
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    state.profile = [{ npi: '1234567893', enabledAt: ENABLED }]
    state.usage = { used: 0, included: 200, unreadable: true }
    const r = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(r.ok).toBe(true)
  })

  it('getInsuranceSetup: the one read the page, the rail card and the check share', async () => {
    expect(await getInsuranceSetup('org_a')).toEqual({ enabled: true, npi: null, driver: 'sandbox', needsNpi: false, usage: null })
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    expect(await getInsuranceSetup('org_a')).toEqual({ enabled: true, npi: null, driver: 'stedi', needsNpi: true, usage: null })
    state.profile = [{ npi: '123-456-7893', enabledAt: ENABLED }]
    state.usage = { used: 7, included: 200, unreadable: false }
    expect(await getInsuranceSetup('org_a')).toEqual({ enabled: true, npi: '1234567893', driver: 'stedi', needsNpi: false, usage: { used: 7, included: 200, unreadable: false } })
    state.profile = [{ npi: null, enabledAt: ENABLED }]
    state.org = [{ isDemo: true }]
    expect(await getInsuranceSetup('org_demo')).toEqual({ enabled: true, npi: null, driver: 'sandbox', needsNpi: false, usage: null })
  })

  it('THE SWITCH: a clinic that has not turned the tool on is refused before any row, network or usage read', async () => {
    state.profile = [{ npi: '1234567893', enabledAt: null }]
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    expect(await getInsuranceSetup('org_a')).toEqual({ enabled: false, npi: '1234567893', driver: 'stedi', needsNpi: false, usage: null })
    const r = await runEligibilityCheck('org_a', { input: input(), patientId: 'pat_1', now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not_enabled')
    expect(state.inserts).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()
    expect(getInsuranceUsage).not.toHaveBeenCalled()
    // A missing profile row reads as OFF, never as on by accident.
    state.profile = []
    expect((await getInsuranceSetup('org_a')).enabled).toBe(false)
  })

  it('a database failure returns a typed refusal instead of throwing', async () => {
    state.failInsert = true
    const r = await runEligibilityCheck('org_a', { input: input(), now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors._form).toMatch(/could not save/i)
    expect(recordAction).not.toHaveBeenCalled()
  })

  it('a recognised answer for the card on file is REMEMBERED on the patient — detail only, never the flat columns', async () => {
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: 'DD-100-2231' }]
    const r = await runEligibilityCheck('org_1', { input: { ...input(), payerId: '77777', payerName: 'Delta Dental of California' }, patientId: 'pat_1', now: NOW })
    expect(r.ok).toBe(true)
    expect(state.updates).toHaveLength(1)
    const vals = state.updates[0].values
    expect(state.updates[0].table).toBe('patient')
    expect(Object.keys(vals).sort()).toEqual(['insuranceDetail', 'updatedAt'])
    expect(vals.insuranceDetail).toMatchObject({ memberId: 'DD-100-2231', payerId: '77777', source: 'check', relationship: 'self' })
  })

  it('a card that is NOT the one on file is not remembered (edits don’t change the record until saved)', async () => {
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: 'OTHER-999' }]
    await runEligibilityCheck('org_1', { input: input('DD-100-2231'), patientId: 'pat_1', now: NOW })
    expect(state.updates).toHaveLength(0)
  })

  it('an empty policy number on file lets the first recognised check fill the card', async () => {
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: null }]
    await runEligibilityCheck('org_1', { input: input('DD-100-2231'), patientId: 'pat_1', now: NOW })
    expect(state.updates).toHaveLength(1)
  })

  it('a not-found or failed answer remembers nothing — the payer said nothing about the card', async () => {
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: 'DD-100-9999' }]
    await runEligibilityCheck('org_1', { input: input('DD-100-9999'), patientId: 'pat_1', now: NOW })
    state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: 'DD-100-0001' }]
    await runEligibilityCheck('org_1', { input: input('DD-100-0001'), patientId: 'pat_1', now: NOW })
    expect(state.updates).toHaveLength(0)
  })

  it('an unattached check (no patient) remembers nothing', async () => {
    await runEligibilityCheck('org_1', { input: input(), patientId: null, now: NOW })
    expect(state.updates).toHaveLength(0)
  })
})
