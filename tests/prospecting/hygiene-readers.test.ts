import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * READERS THAT MEET A RESTING ROW (P-03 fix pass). A row that rested was
 * contacted — that is why it could rest — so the territory coverage counts
 * it where it came from (`dormant_from_status`) instead of as an unworked
 * row: a territory whose contacted rows rest does not slide from 100% worked
 * to 10%.
 */

const h = vi.hoisted(() => ({ selectQueue: [] as unknown[][] }))

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'orderBy', 'limit', 'groupBy']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(h.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return { schema, db: { select: () => selectChain() } }
})

import { readFileSync } from 'node:fs'
import { BAND_COUNT_EXCLUDED_STATUSES, getTerritoryCoverage } from '@/lib/services/prospecting'

beforeEach(() => {
  h.selectQueue = []
})

describe('getTerritoryCoverage', () => {
  it('counts a resting row in the bucket it rested from — contacted stays worked, enriched stays enriched', async () => {
    h.selectQueue.push(
      [
        { state: 'GA', status: 'contacted', dormantFromStatus: null, band: 'hot', n: 10 },
        { state: 'GA', status: 'dormant', dormantFromStatus: 'contacted', band: 'warm', n: 90 },
        { state: 'GA', status: 'dormant', dormantFromStatus: 'enriched', band: null, n: 5 },
        { state: 'GA', status: 'dormant', dormantFromStatus: null, band: null, n: 1 }, // a memory lost → enriched
      ],
      [], // no discovery tasks
    )
    const [ga] = await getTerritoryCoverage(['GA'])
    expect(ga).toMatchObject({ state: 'GA', total: 106, enriched: 106, contacted: 100, hot: 10, warm: 90 })
    expect(ga.workedPct).toBe(100) // enriched-or-further over total — nothing "unworked" appeared
    expect(ga.convertPct).toBe(0) // over the 100 that were contacted, resting ones included
  })

  it('a chain the sweep set aside (or any disqualified row) is not in the territory at all, and a row that said no / unsubscribed never reads as hot or warm — exactly as getBandCounts counts (J.1)', async () => {
    h.selectQueue.push(
      [
        { state: 'TX', status: 'enriched', dormantFromStatus: null, band: 'hot', n: 4 },
        { state: 'TX', status: 'suppressed', dormantFromStatus: null, band: 'hot', n: 3 },
        { state: 'TX', status: 'not_interested', dormantFromStatus: null, band: 'warm', n: 2 },
        { state: 'TX', status: 'discovered', dormantFromStatus: null, band: 'hot', n: 1 },
      ],
      [],
    )
    const [tx] = await getTerritoryCoverage(['TX'])
    expect(tx).toMatchObject({ state: 'TX', total: 10, hot: 4, warm: 2 })
    // The disqualified rows never reach the reader: the query leaves them out beside the merged shells.
    const src = readFileSync('lib/services/prospecting.ts', 'utf8')
    expect(src).toContain("notInArray(schema.prospect.status, ['merged', 'disqualified'])")
    expect(BAND_COUNT_EXCLUDED_STATUSES).toEqual(['discovered', 'enriching', 'disqualified', 'suppressed', 'merged'])
    expect(src).toContain("notInArray(schema.prospect.status, [...BAND_COUNT_EXCLUDED_STATUSES, 'dormant'])")
  })
})
