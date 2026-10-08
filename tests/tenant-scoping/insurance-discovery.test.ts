/**
 * Insurance Discovery readers/writers — every query carries the calling
 * org's id (ORG_A/ORG_B pattern): the two readers, the allowance count, and
 * the resume's update. Real drizzle-orm + the real schema; only @/lib/db is
 * mocked, so the captured where-clause is the genuine eq(...) fragments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
}

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
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
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push(captureSql(clause))
      return obj
    }
    obj.orderBy = () => obj
    obj.limit = async () => state.rows
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve([{ n: 0 }]).then(res, rej)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: () => ({
          where: async (clause: unknown) => {
            state.wheres.push(captureSql(clause))
          },
        }),
      }),
    },
    schema,
  }
})
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: async () => 'America/Chicago' }))
vi.mock('@/lib/services/insurance-eligibility', () => ({ getInsuranceSetup: async () => ({ enabled: true, driver: 'sandbox', needsNpi: false }) }))
const stediFetch = vi.fn(async () => new Response(JSON.stringify({ status: 'COMPLETE', items: [] }), { status: 200 }))
vi.mock('@/lib/services/insurance-eligibility/stedi', () => ({ stediFetch: (...a: unknown[]) => stediFetch(...(a as [])), resolveProvider: async () => ({ npi: '1' }) }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: async () => true }))

import { getDiscoveryUsage, getInsuranceDiscovery, getLatestDiscoveryForPatient, resumeInsuranceDiscovery } from '@/lib/services/insurance-eligibility/discovery'

const PENDING = {
  id: 'disc_1',
  organizationId: 'org_a',
  patientId: 'pat_1',
  requestedByUserId: null,
  driver: 'stedi',
  status: 'pending',
  input: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', state: null, postalCode: null, hasSsn: false },
  candidates: [],
  coveragesFound: 0,
  discoveryId: 'disc-p',
  error: null,
  createdAt: new Date('2026-10-08T14:00:00Z'),
  updatedAt: new Date('2026-10-08T14:00:00Z'),
}

beforeEach(() => {
  state.wheres = []
  state.rows = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('insurance discovery — tenant scoping', () => {
  it('getInsuranceDiscovery scopes by org and id', async () => {
    await getInsuranceDiscovery('org_a', 'disc_1')
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).toContain('disc_1')
    expect(state.wheres[0]).not.toContain('org_b')
  })

  it('getLatestDiscoveryForPatient scopes by org and patient', async () => {
    await getLatestDiscoveryForPatient('org_a', 'pat_1')
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).toContain('pat_1')
  })

  it('getDiscoveryUsage counts this org’s live rows only', async () => {
    await getDiscoveryUsage('org_a', new Date('2026-10-08T15:00:00Z'))
    expect(state.wheres[0]).toContain('org_a')
    expect(state.wheres[0]).toContain('stedi')
  })

  it('resumeInsuranceDiscovery reads AND writes under the org', async () => {
    state.rows = [{ d: PENDING, requestedByName: null }]
    await resumeInsuranceDiscovery('org_a', 'disc_1', new Date('2026-10-08T15:00:00Z'))
    expect(state.wheres).toHaveLength(2)
    for (const w of state.wheres) {
      expect(w).toContain('org_a')
      expect(w).toContain('disc_1')
    }
  })
})
