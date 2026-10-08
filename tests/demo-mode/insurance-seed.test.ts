import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * seedDemoInsuranceChecks — persona-anchored, idempotent, honest rows: every
 * seed carries the org, driver 'sandbox', an `ins_demo` id, and the error row
 * has no result.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
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
      update: (t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: t === schema.patient ? 'patient' : 'other', values: vals })
          },
        }),
      }),
    },
    schema,
  }
})

const savePayerNote = vi.fn(async () => null)
vi.mock('@/lib/services/insurance-eligibility/payer-notebook', () => ({
  savePayerNote: (...a: unknown[]) => savePayerNote(...(a as [])),
}))

import { seedDemoInsuranceChecks } from '@/lib/services/demo-clinic/seed-insurance'

const NOW = new Date('2026-09-30T15:00:00Z')
const IDS: Array<string | null> = Array.from({ length: 15 }, (_, i) => `pat_${i}`)

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
  savePayerNote.mockClear()
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
    // The record remembers the card: Mia's detail is stamped once, keyed on the
    // member id her seeded checks carry, and it touches ONLY the detail column.
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].table).toBe('patient')
    expect(Object.keys(state.updates[0].values)).toEqual(['insuranceDetail'])
    expect(state.updates[0].values.insuranceDetail).toMatchObject({ memberId: 'DD-100-2231', planName: 'Delta Dental PPO', source: 'check' })

    state.inserts.length = 0
    state.selectQueue.push([{ id: 'pat_0' }])
    state.selectQueue.push(state.inserts.length === 0 ? Object.keys(byId).map((id) => ({ id })) : [])
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    expect(state.inserts).toHaveLength(0)
  })

  it('the verification sheet (2026-10-08): the demo’s payer notebook is written every run, org-scoped, and older seeded answers self-heal in place', async () => {
    state.selectQueue.push([{ id: 'pat_0' }])
    // Two rows already stored: one from before the sheet (no procedure lines) and one with them.
    state.selectQueue.push([
      { id: 'ins_demo_mia_2', result: { status: 'active', notes: [] }, checkedAt: new Date('2026-09-18T15:00:00Z') },
      { id: 'ins_demo_marcus_1', result: { status: 'active', procedures: [] }, checkedAt: new Date('2026-09-27T15:00:00Z') },
      { id: 'ins_demo_aiden_1', result: null, checkedAt: new Date('2026-08-01T15:00:00Z') },
    ])
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    const healed = state.updates.filter((u) => u.table === 'other')
    expect(healed).toHaveLength(1)
    const result = healed[0].values.result as { asOf: string; procedures: unknown[]; plan: { groupName: string } }
    expect(result.procedures.length).toBeGreaterThan(5)
    expect(result.plan.groupName).toBeTruthy()
    // Re-rendered at the ROW's own instant, not now.
    expect(result.asOf).toBe('2026-09-18T15:00:00.000Z')
    expect(savePayerNote).toHaveBeenCalledTimes(1)
    expect(savePayerNote).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_demo', payerName: 'Delta Dental', fields: expect.objectContaining({ feeSchedule: 'PPO', network: 'in', paysOn: 'seat' }) }))
    // The three missing rows are inserted as before.
    expect(state.inserts.map((i) => i.values.id)).toEqual(['ins_demo_mia_1', 'ins_demo_sophia_1', 'ins_demo_emma_1'])
  })

  it('Mia’s seeded checks carry HER on-file policy number, and an existing detail is left alone', async () => {
    state.selectQueue.push([{ id: 'pat_0', policy: 'POL-4455667', detail: { memberId: 'POL-4455667' } }])
    state.selectQueue.push([])
    await seedDemoInsuranceChecks('org_demo', NOW, IDS)
    const mia = state.inserts.find((i) => i.values.id === 'ins_demo_mia_2')!
    expect((mia.values.input as { memberId: string }).memberId).toBe('POL-4455667')
    expect(state.updates).toHaveLength(0)
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
