import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * seedDemoInsuranceChecks — persona-anchored, idempotent, honest rows: every
 * seed carries the org, driver 'sandbox', an `ins_demo` id, and the error row
 * has no result.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: async (vals: Record<string, unknown>) => {
          state.inserts.push({ table: t === schema.insuranceVerification ? 'insurance_verification' : 'other', values: vals })
        },
      }),
    },
    schema,
  }
})

import { seedDemoInsuranceChecks } from '@/lib/services/demo-clinic/seed-insurance'

const NOW = new Date('2026-09-30T15:00:00Z')
const IDS: Array<string | null> = Array.from({ length: 15 }, (_, i) => `pat_${i}`)

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
})

describe('seedDemoInsuranceChecks', () => {
  it('inserts the persona-anchored history on first run, nothing on the second', async () => {
    state.selectQueue.push([{ id: 'pat_0' }]) // Mia exists
    state.selectQueue.push([]) // no seeded ids yet
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    expect(state.inserts).toHaveLength(6)
    for (const ins of state.inserts) {
      expect(ins.table).toBe('insurance_verification')
      expect(ins.values.organizationId).toBe('org_demo')
      expect(ins.values.driver).toBe('sandbox')
      expect(String(ins.values.id)).toMatch(/^ins_demo/)
      expect(ins.values.patientId).toBeTruthy()
    }
    const byId = Object.fromEntries(state.inserts.map((i) => [i.values.id as string, i.values]))
    expect(byId.ins_demo_mia_2.status).toBe('active')
    expect(byId.ins_demo_sophia_1.status).toBe('inactive')
    expect(byId.ins_demo_emma_1.status).toBe('not_found')
    expect(byId.ins_demo_aiden_1.status).toBe('error')
    expect(byId.ins_demo_aiden_1.result).toBeNull()
    expect(byId.ins_demo_aiden_1.error).toMatch(/timeout/i)
    // The seeded answer is rendered at the row's own instant, not "now".
    const mia = byId.ins_demo_mia_2.result as { asOf: string }
    expect(mia.asOf).toBe(new Date(NOW.getTime() - 12 * 86_400_000).toISOString())

    state.inserts.length = 0
    state.selectQueue.push([{ id: 'pat_0' }])
    state.selectQueue.push(state.inserts.length === 0 ? Object.keys(byId).map((id) => ({ id })) : [])
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    expect(state.inserts).toHaveLength(0)
  })

  it('skips entirely when Mia is missing — never falls back to a real patient', async () => {
    await seedDemoInsuranceChecks('org_demo', NOW, [null, ...IDS.slice(1)])
    expect(state.inserts).toHaveLength(0)
    state.selectQueue.push([]) // Mia's row is gone
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    expect(state.inserts).toHaveLength(0)
  })

  it('a missing persona skips its own rows only', async () => {
    state.selectQueue.push([{ id: 'pat_0' }])
    state.selectQueue.push([])
    const ids = [...IDS]
    ids[4] = null // Sophia
    await seedDemoInsuranceChecks('org_demo', NOW, ids)
    expect(state.inserts.map((i) => i.values.id)).not.toContain('ins_demo_sophia_1')
    expect(state.inserts).toHaveLength(5)
  })
})
