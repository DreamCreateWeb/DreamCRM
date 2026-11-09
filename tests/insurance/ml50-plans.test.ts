import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-50 — two plans on a record. The slot reads (primary from the flat
 * columns, secondary from its own row), the ONE writer that mirrors the
 * primary, the org on every statement, and the merge carry.
 */
const h = vi.hoisted(() => ({
  selects: [] as Array<Record<string, unknown>[]>,
  updates: [] as Array<{ set: Record<string, unknown> }>,
  inserts: [] as Array<{ values: Record<string, unknown>; conflictSet?: Record<string, unknown> }>,
  deletes: 0,
  wheres: [] as string[],
  returning: [] as Array<Record<string, unknown>[]>,
}))

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
  const readChain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.where = (c: unknown) => { h.wheres.push(dump(c)); return o }
    o.limit = async () => h.selects.shift() ?? []
    return o
  }
  return {
    schema,
    db: {
      select: () => readChain(),
      update: () => ({
        set: (set: Record<string, unknown>) => {
          h.updates.push({ set })
          return { where: (c: unknown) => { h.wheres.push(dump(c)); const p = Promise.resolve(undefined) as Promise<unknown> & { returning?: unknown }; p.returning = async () => h.returning.shift() ?? []; return p } }
        },
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          const rec: { values: Record<string, unknown>; conflictSet?: Record<string, unknown> } = { values }
          h.inserts.push(rec)
          return { onConflictDoUpdate: async (a: { set: Record<string, unknown> }) => { rec.conflictSet = a.set } }
        },
      }),
      delete: () => ({ where: async (c: unknown) => { h.deletes++; h.wheres.push(dump(c)) } }),
    },
  }
})

import { listPatientInsurance, upsertPatientInsurance, carrySecondaryOnMerge } from '@/lib/services/insurance-eligibility/plans'

beforeEach(() => {
  h.selects = []
  h.updates = []
  h.inserts = []
  h.deletes = 0
  h.wheres = []
  h.returning = []
})

describe('listPatientInsurance — [primary, secondary?]', () => {
  it('reads the primary from the flat columns and the secondary from its own slot, each with its own card', async () => {
    h.selects = [
      [{ provider: 'Delta Dental', policy: 'DD-100', group: 'G1', detail: { memberId: 'DD-100', relationship: 'self' } }],
      [{ provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null, detail: { memberId: 'OLD-1', relationship: 'self' } }],
    ]
    const cards = await listPatientInsurance('org_1', 'pat_1')
    expect(cards.map((c) => c.rank)).toEqual(['primary', 'secondary'])
    expect(cards[0]).toMatchObject({ provider: 'Delta Dental', policyNumber: 'DD-100', groupNumber: 'G1' })
    expect(cards[0].detail?.memberId).toBe('DD-100')
    expect(cards[1]).toMatchObject({ provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null })
    // A remembered card is trusted only while it matches THAT slot's member id.
    expect(cards[1].detail).toBeNull()
    expect(h.wheres.every((w) => w.includes('org_1'))).toBe(true)
  })

  it('omits an empty slot, and a record with no patient reads as no plans', async () => {
    h.selects = [[{ provider: null, policy: ' ', group: null, detail: null }], []]
    expect(await listPatientInsurance('org_1', 'pat_1')).toEqual([])
    h.selects = [[]]
    expect(await listPatientInsurance('org_1', 'nobody')).toEqual([])
  })
})

describe('upsertPatientInsurance', () => {
  it('a secondary writes only its own row (never the patient columns) with the org on the statement', async () => {
    h.selects = [[{ id: 'pat_1' }]]
    const ok = await upsertPatientInsurance('org_1', 'pat_1', 'secondary', { provider: ' Cigna ', policyNumber: 'CG-200', groupNumber: '' })
    expect(ok).toBe(true)
    expect(h.updates).toHaveLength(0)
    expect(h.inserts[0].values).toMatchObject({ organizationId: 'org_1', patientId: 'pat_1', rank: 'secondary', provider: 'Cigna', policyNumber: 'CG-200', groupNumber: null })
    expect(h.inserts[0].conflictSet).toMatchObject({ provider: 'Cigna', policyNumber: 'CG-200' })
  })

  it('a primary writes the flat columns (the display truth) AND mirrors into its slot — the one place both happen', async () => {
    h.selects = [[{ id: 'pat_1' }]]
    await upsertPatientInsurance('org_1', 'pat_1', 'primary', { provider: 'Delta', policyNumber: 'DD-1', groupNumber: 'G' })
    expect(h.updates[0].set).toMatchObject({ insuranceProvider: 'Delta', insurancePolicyNumber: 'DD-1', insuranceGroupNumber: 'G' })
    expect(h.inserts[0].values).toMatchObject({ rank: 'primary', provider: 'Delta', policyNumber: 'DD-1' })
  })

  it('refuses a patient that is not this org’s — nothing is written', async () => {
    h.selects = [[]]
    expect(await upsertPatientInsurance('org_2', 'pat_1', 'secondary', { provider: 'X', policyNumber: 'Y', groupNumber: null })).toBe(false)
    expect(h.inserts).toHaveLength(0)
    expect(h.updates).toHaveLength(0)
  })

  it('an empty secondary clears the slot instead of storing a blank row', async () => {
    h.selects = [[{ id: 'pat_1' }]]
    await upsertPatientInsurance('org_1', 'pat_1', 'secondary', { provider: null, policyNumber: ' ', groupNumber: null })
    expect(h.deletes).toBe(1)
    expect(h.inserts).toHaveLength(0)
  })
})

describe('carrySecondaryOnMerge', () => {
  it('moves the duplicate’s second plan only when the survivor has none', async () => {
    h.selects = [[]]
    h.returning = [[{ id: 'pins_1' }]]
    expect(await carrySecondaryOnMerge('org_1', 'surv', 'dup')).toBe(true)
    expect(h.updates[0].set).toMatchObject({ patientId: 'surv' })
    expect(h.wheres.every((w) => w.includes('org_1'))).toBe(true)
  })

  it('never replaces the survivor’s own second plan', async () => {
    h.selects = [[{ id: 'pins_s' }]]
    expect(await carrySecondaryOnMerge('org_1', 'surv', 'dup')).toBe(false)
    expect(h.updates).toHaveLength(0)
  })
})
