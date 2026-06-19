import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  patientRows: [] as Record<string, unknown>[],
  threadRows: [] as Record<string, unknown>[],
  sets: [] as Array<{ table: string | undefined; value: Record<string, unknown> }>,
  repointedTables: [] as (string | undefined)[],
  execCount: 0,
}))

vi.mock('@/lib/db', () => {
  // Read chain: select().from(t).where() awaited → rows; with .limit() for threads.
  function readChain() {
    const ctx: { tbl?: string } = {}
    const result = () =>
      Promise.resolve(ctx.tbl === 'patientThread' ? h.threadRows : h.patientRows)
    const o: Record<string, unknown> = {}
    o.from = (t: { __t?: string }) => { ctx.tbl = t?.__t; return o }
    o.where = () => o
    o.limit = () => result()
    o.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej)
    return o
  }
  function writeChain(kind: string, table?: string) {
    const o: Record<string, unknown> = {}
    o.set = (v: Record<string, unknown>) => {
      h.sets.push({ table, value: v })
      if ('patientId' in v) h.repointedTables.push(table)
      const p: Record<string, unknown> = {}
      p.where = () => Promise.resolve(undefined)
      return p
    }
    o.where = () => Promise.resolve(undefined)
    return o
  }
  const tx = {
    update: (t: { __t?: string }) => writeChain('update', t?.__t),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
    select: () => readChain(),
    execute: () => { h.execCount++; return Promise.resolve(undefined) },
  }
  const t = (name: string) => ({ __t: name })
  const tableNames = [
    'patient', 'appointment', 'patientNote', 'patientDocument', 'patientFollowup', 'patientMessage',
    'emailMessage', 'formSubmission', 'reviewRequest', 'shopCoupon', 'shopOrder', 'membership',
    'patientBalancePayment', 'platformReview', 'customers', 'campaignEvents', 'patientTagAssignment',
    'lead', 'patientThread',
  ]
  const schema: Record<string, unknown> = {}
  for (const n of tableNames) schema[n] = Object.assign(t(n), { id: 'id', patientId: 'patientId', organizationId: 'organizationId', convertedToPatientId: 'c', guardianPatientId: 'g', threadId: 'threadId', mergedIntoPatientId: 'm' })
  return {
    db: {
      select: () => readChain(),
      transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    },
    schema,
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  ne: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { mergePatients } from '@/lib/services/patient-merge'

beforeEach(() => {
  h.patientRows = []
  h.threadRows = []
  h.sets = []
  h.repointedTables = []
  h.execCount = 0
})

describe('mergePatients guards', () => {
  it('rejects merging a record into itself', async () => {
    const r = await mergePatients('org_1', 'p1', 'p1', 'u1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/different/i)
  })

  it('rejects when a patient is missing', async () => {
    h.patientRows = [{ id: 'p1', mergedIntoPatientId: null }]
    const r = await mergePatients('org_1', 'p1', 'p2', 'u1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not found/i)
  })

  it('rejects when one record is already merged', async () => {
    h.patientRows = [
      { id: 'p1', mergedIntoPatientId: null },
      { id: 'p2', mergedIntoPatientId: 'p9' },
    ]
    const r = await mergePatients('org_1', 'p1', 'p2', 'u1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/already merged/i)
  })
})

describe('mergePatients success', () => {
  beforeEach(() => {
    h.patientRows = [
      { id: 'p1', mergedIntoPatientId: null, email: 'mia@x.com', phone: null, firstSeenAt: new Date('2026-02-01'), lastActivityAt: new Date('2026-05-01') },
      { id: 'p2', mergedIntoPatientId: null, email: 'other@x.com', phone: '555-1212', firstSeenAt: new Date('2026-01-01'), lastActivityAt: new Date('2026-06-01') },
    ]
  })

  it('re-points the patient-attached tables to the survivor', async () => {
    const r = await mergePatients('org_1', 'p1', 'p2', 'u1')
    expect(r.ok).toBe(true)
    // A representative sample of the simple re-points happened.
    for (const tbl of ['appointment', 'patientDocument', 'patientFollowup', 'shopOrder', 'reviewRequest']) {
      expect(h.repointedTables).toContain(tbl)
    }
    // The tag move uses a raw execute.
    expect(h.execCount).toBeGreaterThan(0)
  })

  it('fills the survivor’s empty fields (phone) but keeps its existing ones (email), then tombstones the duplicate', async () => {
    await mergePatients('org_1', 'p1', 'p2', 'u1')
    // The survivor fill update: phone filled from the dup, email NOT overwritten.
    const fill = h.sets.find((s) => s.table === 'patient' && 'phone' in s.value)
    expect(fill?.value.phone).toBe('555-1212')
    expect(fill?.value.email).toBeUndefined()
    // Earliest first-seen carried over.
    expect(fill?.value.firstSeenAt).toEqual(new Date('2026-01-01'))
    // The tombstone update on the duplicate.
    const tomb = h.sets.find((s) => s.table === 'patient' && s.value.mergedIntoPatientId === 'p1')
    expect(tomb).toBeTruthy()
    expect(tomb?.value.lifecycle).toBe('archived')
  })
})
