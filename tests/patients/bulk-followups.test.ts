import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  ownedRows: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
}))

vi.mock('@/lib/db', () => {
  function chain() {
    const o: Record<string, unknown> = {}
    o.from = () => o
    // select(patient).where(inArray) is awaited directly (no .limit) — make the
    // chain a thenable resolving to the owned patient rows.
    o.where = () => o
    o.then = (res: (v: unknown) => unknown) => Promise.resolve(h.ownedRows).then(res)
    o.values = (v: unknown) => { h.inserts.push(v); return Promise.resolve(undefined) }
    return o
  }
  // Permissive schema: any table.column resolves to a stub (the service's
  // SELECT_SHAPE touches several columns at module load).
  const tableProxy = new Proxy({}, { get: (_t, col) => ({ __col: String(col) }) })
  const schema = new Proxy({}, { get: () => tableProxy })
  return {
    db: { select: () => chain(), insert: () => chain() },
    schema,
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  asc: (x: unknown) => x,
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }),
  ne: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { bulkCreateFollowups } from '@/lib/services/patient-followups'

beforeEach(() => {
  h.ownedRows = []
  h.inserts = []
})

describe('bulkCreateFollowups', () => {
  it('creates one follow-up per in-org patient', async () => {
    h.ownedRows = [{ id: 'p1' }, { id: 'p2' }]
    const res = await bulkCreateFollowups('org_1', ['p1', 'p2', 'p_foreign'], { title: 'Call about recall' }, 'u1')
    expect(res.created).toBe(2)
    const inserted = h.inserts[0] as unknown[]
    expect(inserted.length).toBe(2)
    expect((inserted[0] as { title: string }).title).toBe('Call about recall')
  })

  it('is a no-op for an empty id list (no insert)', async () => {
    const res = await bulkCreateFollowups('org_1', [], { title: 'x' }, null)
    expect(res.created).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('rejects an empty title before touching the db', async () => {
    await expect(bulkCreateFollowups('org_1', ['p1'], { title: '   ' }, null)).rejects.toThrow(/title/i)
    expect(h.inserts).toHaveLength(0)
  })

  it('returns 0 when none of the ids belong to the org', async () => {
    h.ownedRows = []
    const res = await bulkCreateFollowups('org_1', ['p_foreign'], { title: 'x' }, null)
    expect(res.created).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })
})
