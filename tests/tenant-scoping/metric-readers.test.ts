/**
 * ML-38 — every org-scoped metric reader filters by organization_id (ORG_A
 * and ORG_B each see only their own id in the captured where-clause), and the
 * PMS-sourced balance is null — no query at all — without a connected PMS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const wheres: string[] = []
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
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (c: unknown) => {
      wheres.push(captureSql(c))
      return Promise.resolve([{ n: 0, source: null }])
    },
  }
  return { schema, db: { select: () => chain } }
})
vi.mock('@/lib/services/recall-stats', () => ({ getRecallStats: vi.fn(async () => ({ recallDueReachableCount: 3 })) }))
const pms = vi.hoisted(() => ({ kind: 'connected' as 'connected' | 'none' }))
vi.mock('@/lib/services/pms-link', () => ({ getPmsLink: vi.fn(async () => ({ kind: pms.kind })) }))
vi.mock('@/lib/services/platform-metrics', () => ({ getMrrSnapshot: vi.fn() }))

import { ORG_READERS } from '@/lib/services/metric-readers'

const ctx = (organizationId: string) => ({ organizationId, from: new Date('2026-11-08T06:00:00Z'), to: new Date('2026-11-09T06:00:00Z') })

beforeEach(() => {
  wheres.length = 0
  pms.kind = 'connected'
})

describe('org metric readers are tenant-scoped', () => {
  const queried = Object.keys(ORG_READERS).filter((k) => k !== 'recall_due_reachable') as Array<keyof typeof ORG_READERS>
  for (const key of queried) {
    it(`${key} filters by its own org and never the other's`, async () => {
      await ORG_READERS[key](ctx('ORG_A'))
      await ORG_READERS[key](ctx('ORG_B'))
      expect(wheres.length).toBe(2)
      expect(wheres[0]).toContain('ORG_A')
      expect(wheres[0]).not.toContain('ORG_B')
      expect(wheres[1]).toContain('ORG_B')
      expect(wheres[1]).not.toContain('ORG_A')
    })
  }

  it('the outstanding balance is null, with no query, for a practice with no PMS', async () => {
    pms.kind = 'none'
    expect(await ORG_READERS.outstanding_balance(ctx('ORG_A'))).toBeNull()
    expect(wheres).toHaveLength(0)
  })

  it('due-and-reachable rides the recall service (already org-scoped)', async () => {
    expect(await ORG_READERS.recall_due_reachable(ctx('ORG_A'))).toBe(3)
  })
})
