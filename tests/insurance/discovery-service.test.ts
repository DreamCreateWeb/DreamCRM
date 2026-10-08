import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * runInsuranceDiscovery / resumeInsuranceDiscovery — the server half.
 * Pins: the gates in order (switch, test mode, NPI, this feature's OWN
 * allowance) each refuse BEFORE any row or network call; the sandbox stores
 * its practice candidates; the live driver POSTs Stedi's body, polls a
 * PENDING answer and stores the ranked cards; THE SSN NEVER REACHES THE
 * ROW; a foreign patient id is stored as null; every outcome narrates under
 * `insurance_check`; a pending search resumes once and expires after 24h.
 */

const state = {
  patients: [] as Array<{ id: string; firstName: string; lastName: string }>,
  discoveries: [] as Array<Record<string, unknown>>,
  count: 0,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  failInsert: false,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    let joined = false
    const rows = () => {
      if (table === schema.patient) return state.patients
      if (table === schema.user) return [{ name: 'Dana Whitfield' }]
      if (table === schema.insuranceDiscovery) return joined ? state.discoveries.map((d) => ({ d, requestedByName: 'Dana Whitfield' })) : [{ n: state.count }]
      return []
    }
    obj.from = (t: unknown) => {
      table = t
      return obj
    }
    obj.leftJoin = () => {
      joined = true
      return obj
    }
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => rows()
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(rows()).then(res, rej)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (vals: Record<string, unknown>) => {
          if (state.failInsert) throw new Error('db down')
          state.inserts.push(vals)
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(vals)
          },
        }),
      }),
    },
    schema,
  }
})
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: async () => 'America/Chicago' }))

const setup = {
  enabled: true,
  driver: 'sandbox' as 'sandbox' | 'stedi' | 'stedi_test',
  needsNpi: false,
  npi: '1999999984' as string | null,
  usage: null as unknown,
}
vi.mock('@/lib/services/insurance-eligibility', () => ({ getInsuranceSetup: async () => setup }))

const stediFetch = vi.fn(async (_path: string, _init?: unknown): Promise<unknown> => new Response('{}', { status: 200 }))
const resolveProvider = vi.fn(async () => ({ npi: '1999999984', mode: 'live' }))
vi.mock('@/lib/services/insurance-eligibility/stedi', () => ({
  stediFetch: (...a: unknown[]) => stediFetch(...(a as [string, unknown])),
  resolveProvider: (...a: unknown[]) => resolveProvider(...(a as [])),
}))

const recordAction = vi.fn(async (_input: Record<string, unknown>) => true)
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: (input: Record<string, unknown>) => recordAction(input) }))

import { getDiscoveryUsage, includedMonthlyDiscoveries, resumeInsuranceDiscovery, runInsuranceDiscovery } from '@/lib/services/insurance-eligibility/discovery'
import { DISCOVERY_COPY } from '@/lib/insurance-discovery'

const NOW = new Date('2026-10-08T15:00:00Z')
const ASK = { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'AR', postalCode: '72554', ssn: '123-45-6789' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const FOUND = {
  discoveryId: 'disc-abc',
  status: 'COMPLETE',
  coveragesFound: 1,
  items: [
    {
      payerId: '77777',
      payer: { name: { organization: 'Delta Dental of California' }, payorIdentification: '77777' },
      subscriber: { memberId: 'DD-100', firstName: 'MIA', lastName: 'HAYES', dateOfBirth: '19880312' },
      benefitsInformation: [{ code: '1', serviceTypeCodes: ['35'] }],
      confidence: { level: 'REVIEW_NEEDED' },
    },
  ],
}

beforeEach(() => {
  state.patients = [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes' }]
  state.discoveries = []
  state.count = 0
  state.inserts = []
  state.updates = []
  state.failInsert = false
  setup.enabled = true
  setup.driver = 'sandbox'
  setup.needsNpi = false
  stediFetch.mockReset()
  stediFetch.mockImplementation(async () => json(FOUND))
  resolveProvider.mockClear()
  recordAction.mockClear()
  delete process.env.INSURANCE_INCLUDED_MONTHLY_DISCOVERIES
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('runInsuranceDiscovery — the gates', () => {
  it('a malformed ask is refused with field errors and nothing stored', async () => {
    const r = await runInsuranceDiscovery('org_1', { input: { firstName: '' }, now: NOW })
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()
  })

  it('refuses when the tool is off, under test mode, and without an NPI — in that order, before any row', async () => {
    setup.enabled = false
    expect(await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })).toMatchObject({ ok: false, reason: 'not_enabled' })
    setup.enabled = true
    setup.driver = 'stedi_test'
    setup.needsNpi = true
    expect(await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })).toMatchObject({ ok: false, reason: 'live_only', errors: { _form: DISCOVERY_COPY.liveOnly } })
    setup.driver = 'stedi'
    expect(await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })).toMatchObject({ ok: false, reason: 'npi' })
    expect(state.inserts).toHaveLength(0)
    expect(stediFetch).not.toHaveBeenCalled()
  })

  it('refuses at this feature’s own allowance under the live driver, and the count reads only live rows', async () => {
    setup.driver = 'stedi'
    state.count = 20
    const r = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(r).toMatchObject({ ok: false, reason: 'over_allowance' })
    expect(r.ok === false && r.errors._form).toContain('20 of 20')
    expect(stediFetch).not.toHaveBeenCalled()
    expect(includedMonthlyDiscoveries({})).toBe(20)
    expect(includedMonthlyDiscoveries({ INSURANCE_INCLUDED_MONTHLY_DISCOVERIES: '50' })).toBe(50)
    expect(includedMonthlyDiscoveries({ INSURANCE_INCLUDED_MONTHLY_DISCOVERIES: 'x' })).toBe(20)
  })

  it('the sandbox never counts against the allowance', async () => {
    state.count = 99
    const r = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(r.ok).toBe(true)
  })
})

describe('runInsuranceDiscovery — the sandbox', () => {
  it('stores practice candidates, never the SSN, narrates under insurance_check, and ties the org’s patient', async () => {
    const r = await runInsuranceDiscovery('org_1', { input: ASK, patientId: 'pat_1', userId: 'u_1', now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.discovery.driver).toBe('sandbox')
    expect(['found', 'none']).toContain(r.discovery.status)
    expect(r.discovery.patientId).toBe('pat_1')
    expect(r.discovery.requestedByName).toBe('Dana Whitfield')
    expect(state.inserts).toHaveLength(1)
    const row = state.inserts[0]
    expect(row.organizationId).toBe('org_1')
    expect(row.driver).toBe('sandbox')
    expect(row.input).toEqual({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: 'AR', postalCode: '72554', hasSsn: true })
    expect(JSON.stringify(row)).not.toContain('123456789')
    expect(JSON.stringify(row)).not.toContain('123-45')
    expect(recordAction).toHaveBeenCalledTimes(1)
    expect(recordAction.mock.calls[0][0]).toMatchObject({ organizationId: 'org_1', capability: 'insurance_check', patientId: 'pat_1', detail: { driver: 'sandbox', initiatedBy: 'staff', userId: 'u_1' } })
    expect(String(recordAction.mock.calls[0][0].summary)).toContain('Mia Hayes’ insurance')
    expect(String(recordAction.mock.calls[0][0].summary)).toContain('practice answer')
    expect(stediFetch).not.toHaveBeenCalled()
  })

  it('a patient id outside the org is stored as nothing', async () => {
    state.patients = []
    const r = await runInsuranceDiscovery('org_1', { input: ASK, patientId: 'pat_other', now: NOW })
    expect(r.ok).toBe(true)
    expect(state.inserts[0].patientId).toBeNull()
  })

  it('a database failure is a typed refusal, not a throw', async () => {
    state.failInsert = true
    const r = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(r).toMatchObject({ ok: false, errors: { _form: expect.stringContaining('Could not save') } })
  })
})

describe('runInsuranceDiscovery — the live driver', () => {
  beforeEach(() => {
    setup.driver = 'stedi'
  })

  it('POSTs Stedi’s body with the SSN, stores the ranked cards and the discovery id, bills the live row', async () => {
    const r = await runInsuranceDiscovery('org_1', { input: ASK, patientId: 'pat_1', now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(resolveProvider).toHaveBeenCalledWith('org_1', 'live')
    expect(stediFetch).toHaveBeenCalledTimes(1)
    const [path, init] = stediFetch.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/2024-04-01/insurance-discovery/check/v1')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      provider: { npi: '1999999984' },
      subscriber: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '19880312', ssn: '123456789', address: { state: 'AR', postalCode: '72554' } },
      encounter: { serviceTypeCodes: ['35'], dateOfService: '20261008' },
    })
    expect(r.discovery).toMatchObject({ driver: 'stedi', status: 'found', coveragesFound: 1, discoveryId: 'disc-abc' })
    expect(r.discovery.candidates[0]).toMatchObject({ payerId: '77777', memberId: 'DD-100', status: 'active', dental: true })
    expect(state.inserts[0].driver).toBe('stedi')
    expect(JSON.stringify(state.inserts[0])).not.toContain('123456789')
  })

  it('a PENDING answer is polled on its id; a complete poll stores the cards', async () => {
    stediFetch.mockImplementationOnce(async () => json({ status: 'PENDING', discoveryId: 'disc-p' }, 202)).mockImplementationOnce(async () => json({ ...FOUND, discoveryId: 'disc-p' }))
    const r = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(stediFetch).toHaveBeenCalledTimes(2)
    expect((stediFetch.mock.calls[1] as [string])[0]).toBe('/2024-04-01/insurance-discovery/check/v1/disc-p')
    expect(r.discovery.status).toBe('found')
  })

  it('a search still pending after the polls is stored as pending with its id, and narrated as such', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    stediFetch.mockImplementation(async () => json({ status: 'PENDING', discoveryId: 'disc-p' }, 202))
    const p = runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(stediFetch).toHaveBeenCalledTimes(1 + 3)
    expect(r.discovery).toMatchObject({ status: 'pending', discoveryId: 'disc-p', candidates: [] })
    expect(String(recordAction.mock.calls[0][0].summary)).toContain('still answering')
  })

  it('no coverage is an honest "none" row; an ERROR answer and a refused key are error rows with the reason', async () => {
    stediFetch.mockImplementationOnce(async () => json({ status: 'COMPLETE', coveragesFound: 0, items: [] }))
    const none = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(none.ok && none.discovery.status).toBe('none')
    stediFetch.mockImplementationOnce(async () => json({ status: 'ERROR', errors: [{ code: '42', description: 'Unable to respond' }] }))
    const err = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(err.ok && err.discovery).toMatchObject({ status: 'error', error: 'Unable to respond (42)' })
    stediFetch.mockImplementationOnce(async () => json({ message: 'Insurance Discovery is not available in Test Mode' }, 403))
    const test = await runInsuranceDiscovery('org_1', { input: ASK, now: NOW })
    expect(test.ok && test.discovery).toMatchObject({ status: 'error', error: DISCOVERY_COPY.liveOnly })
    expect(state.inserts).toHaveLength(3)
    expect(recordAction).toHaveBeenCalledTimes(3)
  })
})

describe('getDiscoveryUsage', () => {
  it('counts live rows and fails open on an unreadable count', async () => {
    state.count = 4
    expect(await getDiscoveryUsage('org_1', NOW)).toEqual({ used: 4, included: 20, unreadable: false })
  })
})

describe('resumeInsuranceDiscovery', () => {
  const pendingRow = {
    id: 'disc_1',
    organizationId: 'org_1',
    patientId: 'pat_1',
    requestedByUserId: 'u_1',
    driver: 'stedi',
    status: 'pending',
    input: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: null, postalCode: null, hasSsn: true },
    candidates: [],
    coveragesFound: 0,
    discoveryId: 'disc-p',
    error: null,
    createdAt: new Date('2026-10-08T14:00:00Z'),
    updatedAt: new Date('2026-10-08T14:00:00Z'),
  }

  it('polls once, stores the settled answer and narrates it as resumed', async () => {
    state.discoveries = [pendingRow]
    stediFetch.mockImplementationOnce(async () => json({ ...FOUND, discoveryId: 'disc-p' }))
    const r = await resumeInsuranceDiscovery('org_1', 'disc_1', NOW)
    expect(r.ok && r.discovery).toMatchObject({ status: 'found', coveragesFound: 1 })
    expect(state.updates[0]).toMatchObject({ status: 'found', coveragesFound: 1 })
    expect(recordAction.mock.calls[0][0]).toMatchObject({ patientId: 'pat_1', detail: { resumed: true, status: 'found' } })
  })

  it('still pending: returns the row untouched; a failed poll is a refusal that leaves it pending', async () => {
    state.discoveries = [pendingRow]
    stediFetch.mockImplementationOnce(async () => json({ status: 'PENDING', discoveryId: 'disc-p' }, 202))
    const r = await resumeInsuranceDiscovery('org_1', 'disc_1', NOW)
    expect(r.ok && r.discovery.status).toBe('pending')
    expect(state.updates).toHaveLength(0)
    stediFetch.mockImplementationOnce(async () => json({}, 503))
    const failed = await resumeInsuranceDiscovery('org_1', 'disc_1', NOW)
    expect(failed.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
    expect(recordAction).not.toHaveBeenCalled()
  })

  it('a day-old pending search expires into an error row without asking Stedi', async () => {
    state.discoveries = [pendingRow]
    const r = await resumeInsuranceDiscovery('org_1', 'disc_1', new Date('2026-10-09T15:00:00Z'))
    expect(r.ok && r.discovery).toMatchObject({ status: 'error', error: expect.stringContaining('expired') })
    expect(stediFetch).not.toHaveBeenCalled()
  })

  it('a settled or unknown search is handed back as-is', async () => {
    state.discoveries = [{ ...pendingRow, status: 'found', coveragesFound: 1 }]
    const r = await resumeInsuranceDiscovery('org_1', 'disc_1', NOW)
    expect(r.ok && r.discovery.status).toBe('found')
    expect(stediFetch).not.toHaveBeenCalled()
    state.discoveries = []
    expect((await resumeInsuranceDiscovery('org_1', 'nope', NOW)).ok).toBe(false)
  })
})
