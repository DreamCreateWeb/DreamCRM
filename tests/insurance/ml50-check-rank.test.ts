import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-50 — a check says WHICH plan it verified. The secondary's check is
 * stamped rank 'secondary', judges "the card on file" against the SECONDARY's
 * member id, and remembers its card on the secondary slot only; the primary's
 * reads (latest check, the pre-visit batch) never see it.
 */
const state = {
  inserts: [] as Array<Record<string, unknown>>,
  wheres: [] as string[],
  remembered: [] as Array<{ rank: string; detail: Record<string, unknown> }>,
  cards: [] as Array<Record<string, unknown>>,
  rows: [] as Array<Record<string, unknown>>,
}

function dump(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { parts.push(String(v)); continue }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    obj.from = (t: unknown) => { table = t; return obj }
    obj.leftJoin = () => obj
    obj.where = (c: unknown) => { state.wheres.push(dump(c)); return obj }
    obj.orderBy = () => obj
    const result = async () => {
      if (table === schema.patient) return [{ id: 'pat_1', firstName: 'Mia', lastName: 'Hayes', insurancePolicyNumber: 'DD-100' }]
      if (table === schema.organization) return [{ isDemo: false }]
      if (table === schema.clinicProfile) return [{ npi: null, enabledAt: new Date('2026-09-29T15:00:00Z') }]
      if (table === schema.insuranceVerification) return state.rows
      return []
    }
    obj.limit = result
    obj.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej)
    return obj
  }
  return {
    schema,
    db: { select: () => chain(), insert: () => ({ values: async (v: Record<string, unknown>) => { state.inserts.push(v) } }) },
  }
})
vi.mock('@/lib/services/insurance-eligibility/allowance', () => ({ getInsuranceUsage: async () => ({ used: 0, included: 200, unreadable: false }) }))
vi.mock('@/lib/services/insurance-eligibility/plans', () => ({
  listPatientInsurance: async () => state.cards,
  // the primary card on file is DD-100 (as the patient row used to say) unless a test sets one
  getPatientInsurance: async (_o: string, _p: string, rank: string) =>
    state.cards.find((c) => c.rank === rank) ?? (rank === 'primary' ? { rank: 'primary', provider: null, policyNumber: 'DD-100', groupNumber: null, detail: null } : null),
  rememberSlotCard: async (_o: string, _p: string, rank: string, detail: Record<string, unknown>) => { state.remembered.push({ rank, detail }); return true },
  upsertPatientInsurance: async () => true,
  removeSecondaryInsurance: async () => undefined,
  patientsWithSecondary: async () => new Set(),
}))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: async () => true }))

import { runEligibilityCheck, getLatestInsuranceCheckForPatient, getLatestInsuranceChecksForPatients } from '@/lib/services/insurance-eligibility'

const NOW = new Date('2026-11-01T15:00:00Z')
const input = (memberId: string) => ({
  patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
  carrierName: 'Cigna',
  memberId,
  groupNumber: null,
  relationship: 'self',
  subscriber: null,
})

beforeEach(() => {
  state.inserts = []
  state.wheres = []
  state.remembered = []
  state.cards = []
  state.rows = []
  delete process.env.INSURANCE_DRIVER
  delete process.env.STEDI_MODE
})

describe('a check carries its plan', () => {
  it('defaults to primary', async () => {
    const r = await runEligibilityCheck('org_a', { input: input('DD-100'), patientId: 'pat_1', now: NOW })
    expect(r.ok).toBe(true)
    expect(state.inserts[0].rank).toBe('primary')
    expect(state.remembered[0]?.rank).toBe('primary')
  })

  it('a secondary check is stamped secondary, and a recognised answer is remembered on the SECONDARY slot only', async () => {
    state.cards = [{ rank: 'secondary', provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null, detail: null }]
    const r = await runEligibilityCheck('org_a', { input: input('CG-200'), patientId: 'pat_1', rank: 'secondary', now: NOW })
    expect(r.ok && r.check.rank).toBe('secondary')
    expect(state.inserts[0].rank).toBe('secondary')
    expect(state.remembered.map((x) => x.rank)).toEqual(['secondary'])
  })

  it('judges "the card on file" against the secondary’s own member id: a different id is not remembered', async () => {
    state.cards = [{ rank: 'secondary', provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null, detail: null }]
    await runEligibilityCheck('org_a', { input: input('SOMEONE-ELSE'), patientId: 'pat_1', rank: 'secondary', now: NOW })
    expect(state.inserts[0].rank).toBe('secondary')
    expect(state.remembered).toHaveLength(0)
  })

  it('an unknown rank word floors at primary', async () => {
    await runEligibilityCheck('org_a', { input: input('DD-100'), patientId: 'pat_1', rank: 'tertiary' as never, now: NOW })
    expect(state.inserts[0].rank).toBe('primary')
  })
})

describe('the reads keep the plans apart', () => {
  it('the latest check is asked FOR a rank, org-scoped; primary by default', async () => {
    await getLatestInsuranceCheckForPatient('org_a', 'pat_1')
    await getLatestInsuranceCheckForPatient('org_a', 'pat_1', 'secondary')
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).toContain('primary')
    expect(state.wheres[1]).toContain('secondary')
  })

  it('the pre-visit batch only ever reads the primary', async () => {
    await getLatestInsuranceChecksForPatients('org_a', ['pat_1'])
    expect(state.wheres[0]).toContain('primary')
    expect(state.wheres[0]).not.toContain('secondary')
  })
})
