import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * updatePatient guardian linkage enforces a ONE-LEVEL family tree:
 *  - a patient can't be their own guardian
 *  - the guardian can't themselves be a dependent (no D→X→B chains)
 *  - the patient being modified can't ALREADY be a guardian (no X→B with an
 *    existing D→X, which the one-hop access resolver would silently orphan)
 */

const state = { selectQueue: [] as unknown[][], updates: 0 }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.where = () => o
    o.limit = async () => state.selectQueue.shift() ?? []
    o.then = (r: (v: unknown) => void) => r(state.selectQueue.shift() ?? [])
    return o
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: () => ({ where: async () => { state.updates++ } }) }),
    },
    schema: new Proxy({}, { get: () => ({}) }),
  }
})

vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))

import { updatePatient } from '@/lib/services/patients'

const call = (patientId: string, guardianPatientId: string) =>
  updatePatient({ organizationId: 'org_1', patientId, patch: { guardianPatientId } })

beforeEach(() => {
  state.selectQueue = []
  state.updates = 0
})

describe('updatePatient — guardian linkage', () => {
  it('rejects a patient as their own guardian', async () => {
    await expect(call('p1', 'p1')).rejects.toThrow(/own guardian/i)
    expect(state.updates).toBe(0)
  })

  it('rejects a guardian who is themselves a dependent', async () => {
    state.selectQueue.push([{ id: 'g', guardianPatientId: 'someoneElse' }])
    await expect(call('p1', 'g')).rejects.toThrow(/dependent themselves/i)
    expect(state.updates).toBe(0)
  })

  it('rejects giving a guardian to a patient who already HAS dependents (no 2-level tree)', async () => {
    state.selectQueue.push([{ id: 'g', guardianPatientId: null }]) // valid guardian
    state.selectQueue.push([{ id: 'dep1' }]) // p1 already has a dependent
    await expect(call('p1', 'g')).rejects.toThrow(/account holder/i)
    expect(state.updates).toBe(0)
  })

  it('allows a valid link (guardian is an account holder; patient has no dependents)', async () => {
    state.selectQueue.push([{ id: 'g', guardianPatientId: null }]) // valid guardian
    state.selectQueue.push([]) // p1 has no dependents
    await call('p1', 'g')
    expect(state.updates).toBe(1)
  })
})
