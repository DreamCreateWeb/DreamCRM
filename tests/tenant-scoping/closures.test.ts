/**
 * ML-51's closure service — every read filters by organization_id and every
 * insert sets it. Real drizzle-orm + the real schema; only @/lib/db is mocked,
 * so the captured where-clause is the genuine eq(...) fragments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as string[],
  inserts: [] as Array<Record<string, unknown>>,
  dupe: false,
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
    if (typeof obj.name === 'string') parts.push(obj.name)
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const { clinicClosure } = await import('@/lib/db/schema/clinic')
  const rows = (): unknown[] => []
  const where = (clause: unknown) => {
    state.wheres.push(captureSql(clause))
    const chain = {
      orderBy: async () => rows(),
      limit: async () => (state.dupe ? [{ id: 'clo_existing' }] : []),
      returning: async () => [{ id: 'clo_1' }],
      then: (resolve: (v: unknown) => void) => resolve(rows()),
    }
    return chain
  }
  return {
    db: {
      select: () => ({ from: () => ({ where }) }),
      insert: (t: unknown) => ({
        values: async (v: Record<string, unknown>) => {
          expect(t).toBe(clinicClosure)
          state.inserts.push(v)
        },
      }),
      delete: () => ({ where }),
    },
  }
})

import { addClosure, closureOnDay, listClosures, listUpcomingClosures, removeClosure } from '@/lib/services/closures'

const ORG_A = 'org_A'

beforeEach(() => {
  state.wheres.length = 0
  state.inserts.length = 0
  state.dupe = false
})

describe('ML-51 closure service carries the org id', () => {
  it('every read names the organization', async () => {
    await listClosures(ORG_A, '2026-11-01', '2026-12-31')
    await listUpcomingClosures(ORG_A, 'America/Chicago', new Date('2026-11-09T12:00:00Z'))
    await closureOnDay(ORG_A, '2026-11-26')
    expect(state.wheres).toHaveLength(3)
    for (const w of state.wheres) {
      expect(w).toContain(ORG_A)
      expect(w).toContain('organization_id')
    }
  })

  it('addClosure sets organization_id on the insert and dedupes inside the org', async () => {
    const res = await addClosure(ORG_A, { startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' })
    expect(res.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ organizationId: ORG_A, startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' })
    expect(state.wheres[0]).toContain(ORG_A)

    state.dupe = true
    const again = await addClosure(ORG_A, { startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' })
    expect(again).toMatchObject({ ok: true, closure: { id: 'clo_existing' } })
    expect(state.inserts).toHaveLength(1)
  })

  it('an invalid closure writes nothing', async () => {
    const res = await addClosure(ORG_A, { startsOn: '2026-11-27', endsOn: '2026-11-26', label: 'x' })
    expect(res.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })

  it('removeClosure is scoped to the org AND the id', async () => {
    expect(await removeClosure(ORG_A, 'clo_9')).toBe(true)
    const w = state.wheres.at(-1)!
    expect(w).toContain(ORG_A)
    expect(w).toContain('clo_9')
  })
})
