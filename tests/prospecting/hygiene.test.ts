import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE HYGIENE PASS (P-03) — decay in the service, the wake, the re-verify
 * reconcile, the one sweep with its order, caps, counters and the fail-open
 * `hygiene` strike, the tile's numbers, and the cron wiring.
 */

type Op = { op: string; table: string; values: Record<string, unknown>; where?: unknown }
const state = { selectQueue: [] as unknown[][], ops: [] as Op[] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'orderBy', 'limit', 'groupBy', 'having']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: (t: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            state.ops.push({ op: 'update', table: tableName(t), values, where })
          },
        }),
      }),
    },
    schema,
  }
})

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  bump: vi.fn(async (_p: string, _k: string, _by?: number) => {}),
  counter: vi.fn(async () => 0),
  dedupe: vi.fn(async () => ({ groups: 0, merged: 0, skipped: 0, errors: 0 })),
  refresh: vi.fn(async () => null as null | Record<string, unknown>),
  strike: vi.fn(async () => true),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: mocks.config,
  bumpProspectingCounter: mocks.bump,
  getProspectingCounter: mocks.counter,
  counterDay: (d: Date) => d.toISOString().slice(0, 10),
}))
vi.mock('@/lib/services/prospect-dedupe', () => ({ runExactDedupeSweep: mocks.dedupe }))
vi.mock('@/lib/services/prospect-discovery', () => ({ refreshStaleTerritory: mocks.refresh }))
vi.mock('@/lib/services/engine-failures', () => ({ reportProspectingFailure: mocks.strike }))

import {
  DECAY_PER_RUN,
  MERGES_PER_RUN,
  getHygieneStats,
  reconcileDormantAfterVerify,
  runDecay,
  runProspectHygiene,
  wakeDormantProspect,
} from '@/lib/services/prospect-hygiene'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false, enabledStates: ['GA'] }
const prospectUpdates = () => state.ops.filter((o) => o.table === 'prospect')
const render = (q: unknown) => new PgDialect().sqlToQuery(q as never)

beforeEach(() => {
  state.selectQueue = []
  state.ops = []
  vi.clearAllMocks()
  mocks.config.mockResolvedValue(LIVE)
  mocks.counter.mockResolvedValue(0)
  mocks.dedupe.mockResolvedValue({ groups: 0, merged: 0, skipped: 0, errors: 0 })
  mocks.refresh.mockResolvedValue(null)
})

describe('runDecay', () => {
  it('rests each candidate with the status it came from and the resting sentence FIRST', async () => {
    state.selectQueue.push([
      {
        id: 'pros_1',
        status: 'contacted',
        createdAt: new Date(NOW.getTime() - 300 * DAY),
        nextFollowUpAt: null,
        qualityReasons: ['Google listing matched and open', 'NPI active'],
        lastTouchAt: new Date(NOW.getTime() - 120 * DAY).toISOString(),
      },
      {
        id: 'pros_2',
        status: 'enriched',
        createdAt: new Date(NOW.getTime() - 100 * DAY),
        nextFollowUpAt: null,
        qualityReasons: null,
        lastTouchAt: null, // never touched — anchored on its birth
      },
    ])
    const r = await runDecay({ now: NOW, staleAfterDays: 90 })
    expect(r).toEqual({ scanned: 2, rested: 2 })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'dormant', dormantFromStatus: 'contacted' })
    expect(prospectUpdates()[0].values.qualityReasons).toEqual([
      'No touch since Jul 13, 2026 UTC — resting',
      'Google listing matched and open',
      'NPI active',
    ])
    expect(prospectUpdates()[1].values).toMatchObject({ status: 'dormant', dormantFromStatus: 'enriched' })
    expect(prospectUpdates()[1].values.qualityReasons).toEqual(['No touch since Aug 2, 2026 UTC — resting'])
  })

  it('the pure verdict is the last word — a row the SQL picked but a touch inside the window keeps stays awake', async () => {
    state.selectQueue.push([
      { id: 'pros_1', status: 'enriched', createdAt: new Date(NOW.getTime() - 300 * DAY), nextFollowUpAt: null, qualityReasons: [], lastTouchAt: new Date(NOW.getTime() - 10 * DAY) },
    ])
    const r = await runDecay({ now: NOW, staleAfterDays: 90 })
    expect(r).toEqual({ scanned: 1, rested: 0 })
    expect(prospectUpdates()).toHaveLength(0)
  })

  it('caps a run', () => {
    expect(DECAY_PER_RUN).toBe(200)
  })

  it('a row a cold caller holds (P-02) is being worked — never rested, whatever the clock says', async () => {
    state.selectQueue.push([
      { id: 'pros_1', status: 'call_list', createdAt: new Date(NOW.getTime() - 300 * DAY), nextFollowUpAt: null, qualityReasons: [], assignedCallerId: 'pcal_1', lastTouchAt: new Date(NOW.getTime() - 200 * DAY) },
    ])
    expect(await runDecay({ now: NOW, staleAfterDays: 90 })).toEqual({ scanned: 1, rested: 0 })
    expect(prospectUpdates()).toHaveLength(0)
  })
})

describe('the wake', () => {
  it('wakeDormantProspect writes the restore in one statement, clearing the memory', async () => {
    await wakeDormantProspect('pros_1', NOW)
    expect(prospectUpdates()).toHaveLength(1)
    expect(prospectUpdates()[0].values).toMatchObject({ dormantFromStatus: null, updatedAt: NOW })
    expect(prospectUpdates()[0].values.status).toBeTruthy() // the SQL CASE — rendered for real in hygiene-sql.test.ts
  })

  it('reconcileDormantAfterVerify: not dormant → nothing; improved → wakes; unchanged → the resting sentence goes back in front', async () => {
    state.selectQueue.push([{ status: 'enriched', qualityScore: 70, qualityReasons: [] }])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW)).toBe('not_dormant')
    expect(prospectUpdates()).toHaveLength(0)

    state.selectQueue.push([{ status: 'dormant', qualityScore: 70, qualityReasons: ['Google listing matched and open'] }])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW)).toBe('woke')
    expect(prospectUpdates()).toHaveLength(1)
    expect(prospectUpdates()[0].values).toMatchObject({ dormantFromStatus: null })

    state.ops = []
    state.selectQueue.push([
      {
        status: 'dormant',
        qualityScore: 50,
        qualityReasons: ['Google listing matched and open', 'No touch since Jul 13, 2026 UTC — resting'],
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastTouchAt: null,
      },
    ])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW)).toBe('resting')
    expect(prospectUpdates()[0].values.qualityReasons).toEqual([
      'No touch since Jul 13, 2026 UTC — resting',
      'Google listing matched and open',
    ])
  })

  it('V7: the resting write re-asserts status = dormant — a wake landing between the read and the write wins, and no resting sentence lands first on an awake row', async () => {
    state.selectQueue.push([{ status: 'dormant', qualityScore: 50, qualityReasons: ['NPI active'], createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: null }])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW)).toBe('resting')
    const { sql: text, params } = render(prospectUpdates()[0].where)
    expect(text).toBe('("prospect"."id" = $1 and "prospect"."status" = $2)')
    expect(params).toEqual(['pros_1', 'dormant'])
  })

  it('a first-ever score is news, not an improvement: a never-verified resting row with a dead number stays resting', async () => {
    // Grader row, never verified (prior null); the pass parks it at 0.
    state.selectQueue.push([{ status: 'dormant', qualityScore: 0, qualityReasons: ['Number disconnected'], createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: null }])
    expect(await reconcileDormantAfterVerify('pros_1', null, NOW)).toBe('resting')
    expect(prospectUpdates()[0].values).not.toHaveProperty('status')
    // Nor is a first-ever 40.
    state.ops = []
    state.selectQueue.push([{ status: 'dormant', qualityScore: 40, qualityReasons: [], createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: null }])
    expect(await reconcileDormantAfterVerify('pros_1', null, NOW)).toBe('resting')
  })

  it('the resting sentence is handed over from BEFORE the pass rewrote quality_reasons; a missing one is regenerated from the last real touch, never the enrichment stamp alone', async () => {
    // The verify pass already replaced quality_reasons with the signals; the
    // caller passes what the row carried before.
    state.selectQueue.push([{ status: 'dormant', qualityScore: 50, qualityReasons: ['Google listing matched and open'], createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: new Date('2026-06-01T00:00:00Z').toISOString() }])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW, { priorReasons: ['No touch since Jul 13, 2026 UTC — resting', 'NPI active'] })).toBe('resting')
    expect(prospectUpdates()[0].values.qualityReasons).toEqual(['No touch since Jul 13, 2026 UTC — resting', 'Google listing matched and open'])

    // No sentence anywhere: the anchor is the GREATEST touch (a sent email on
    // Jul 13), not enriched_at (Jun 1).
    state.ops = []
    state.selectQueue.push([{ status: 'dormant', qualityScore: 50, qualityReasons: ['Google listing matched and open'], createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: '2026-07-13T15:00:00.000Z' }])
    expect(await reconcileDormantAfterVerify('pros_1', 50, NOW)).toBe('resting')
    expect((prospectUpdates()[0].values.qualityReasons as string[])[0]).toBe('No touch since Jul 13, 2026 UTC — resting')
  })
})

describe('runProspectHygiene — the one pass', () => {
  it('no-ops on the kill switch', async () => {
    mocks.config.mockResolvedValue({ ...LIVE, killSwitch: true })
    expect(await runProspectHygiene({ now: NOW })).toMatchObject({ merged: 0, rested: 0, refreshed: null, skipped: 'kill_switch' })
    expect(mocks.dedupe).not.toHaveBeenCalled()
  })

  it('runs merges → decay → refresh in that order, under the caps, and bumps each day counter', async () => {
    const order: string[] = []
    mocks.dedupe.mockImplementation(async () => {
      order.push('dedupe')
      return { groups: 4, merged: 3, skipped: 1, errors: 0 }
    })
    state.selectQueue.push([
      { id: 'pros_1', status: 'queued', createdAt: new Date(NOW.getTime() - 300 * DAY), nextFollowUpAt: null, qualityReasons: [], lastTouchAt: new Date(NOW.getTime() - 200 * DAY) },
    ])
    mocks.refresh.mockImplementation(async () => {
      order.push('refresh')
      return { taskId: 'pdt_1', state: 'GA', zipPrefix: '303', found: 180, imported: 2, requests: 2, capped: false }
    })
    const r = await runProspectHygiene({ now: NOW })
    expect(r).toEqual({ merged: 3, rested: 1, refreshed: { state: 'GA', zipPrefix: '303', found: 180, imported: 2 }, errors: 0 })
    expect(order).toEqual(['dedupe', 'refresh'])
    expect(prospectUpdates()[0].values.status).toBe('dormant') // decay ran between them
    expect(mocks.dedupe).toHaveBeenCalledWith({ now: NOW, cap: MERGES_PER_RUN, config: LIVE }) // the config rides along: a verdict that travels rescores with its clock
    expect(MERGES_PER_RUN).toBe(25)
    expect(mocks.bump.mock.calls).toEqual([
      ['2026-11-10', 'dedupe_merge', 3],
      ['2026-11-10', 'decay', 1],
      ['2026-11-10', 'discovery_refresh'],
    ])
    expect(mocks.strike).not.toHaveBeenCalled()
  })

  it('a broken step is a logged zero + ONE hygiene strike; the next steps still run', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.dedupe.mockRejectedValue(new Error('boom'))
    mocks.refresh.mockRejectedValue(new Error('NPPES 503'))
    const r = await runProspectHygiene({ now: NOW })
    expect(r).toMatchObject({ merged: 0, rested: 0, refreshed: null, errors: 2 })
    expect(mocks.strike).toHaveBeenCalledTimes(1)
    expect(mocks.strike).toHaveBeenCalledWith('hygiene', NOW)
    quiet.mockRestore()
  })

  it('reads the clocks from config.hygiene', async () => {
    mocks.config.mockResolvedValue({ ...LIVE, hygiene: { ...LIVE.hygiene, staleAfterDays: 30 } })
    state.selectQueue.push([
      { id: 'pros_1', status: 'enriched', createdAt: new Date(NOW.getTime() - 300 * DAY), nextFollowUpAt: null, qualityReasons: [], lastTouchAt: new Date(NOW.getTime() - 45 * DAY) },
    ])
    const r = await runProspectHygiene({ now: NOW })
    expect(r.rested).toBe(1)
  })
})

describe('getHygieneStats', () => {
  it('merged today from the day counter, resting from the table, the last refresh UTC-stamped upstream', async () => {
    mocks.counter.mockResolvedValue(3)
    state.selectQueue.push([{ n: 41 }], [{ state: 'TX', zipPrefix: '787', at: new Date('2026-11-10T06:00:00Z') }])
    expect(await getHygieneStats(NOW)).toEqual({
      mergedToday: 3,
      resting: 41,
      lastRefresh: { state: 'TX', zipPrefix: '787', at: new Date('2026-11-10T06:00:00Z') },
    })
    expect(mocks.counter).toHaveBeenCalledWith('2026-11-10', 'dedupe_merge')
  })
})

describe('the wiring', () => {
  it('the enrich cron runs the hygiene pass AFTER the verification sweep, fail-open — no new cron route', () => {
    const src = readFileSync('app/api/cron/prospect-enrich/route.ts', 'utf8')
    expect(src.indexOf('runVerificationSweep()')).toBeGreaterThan(-1)
    expect(src.indexOf('runProspectHygiene()')).toBeGreaterThan(src.indexOf('runVerificationSweep()'))
    expect(src).toMatch(/runProspectHygiene\(\)\.catch\(/)
  })

  it('every inbound signal wakes a resting row where it already writes, and the drawer’s Verify feeds the reconcile', () => {
    expect(readFileSync('lib/services/prospecting.ts', 'utf8')).toContain('...wakeSetSql()')
    const intent = readFileSync('lib/services/prospect-intent.ts', 'utf8')
    expect(intent).toContain('wakeDormantProspect(prospect.id)')
    // The reply itself is the signal — the wake stands BEFORE the AI gate.
    expect(intent.indexOf('wakeDormantProspect(prospect.id)')).toBeLessThan(intent.indexOf('if (!verdict) continue'))
    // The reply wakes BEFORE its event is recorded (a kill between the two re-processes the message).
    expect(intent.indexOf('wakeDormantProspect(prospect.id)')).toBeLessThan(intent.indexOf("type: 'reply'"))
    // The engagement rollup's promotion is a wake too (contacted, resting or not).
    expect(intent.match(/stripRestingReasonSql\(\)/g)?.length).toBe(3)
    // An open and a click wake the survivor in the tracking routes, before the event lands.
    for (const route of ['app/api/track/open/[token]/route.ts', 'app/api/track/click/[token]/route.ts']) {
      const src = readFileSync(route, 'utf8')
      expect(src.indexOf('await wakeDormantProspect(prospectId)'), route).toBeGreaterThan(-1)
      expect(src.indexOf('await wakeDormantProspect(prospectId)'), route).toBeLessThan(src.indexOf('db.insert(schema.outreachEvent)'))
    }
    expect(readFileSync('lib/services/event-capture.ts', 'utf8')).toContain('stripRestingReasonSql()')
    const verify = readFileSync('lib/services/prospect-verify.ts', 'utf8')
    expect(verify).toContain('reconcileDormantAfterVerify(p.id, priorQuality, ctx.now, { priorReasons: p.qualityReasons })')
    // A self-booked demo wakes, inside the booking's own write; a manual
    // Re-enrich on a resting row reconciles like the verify pass.
    expect(readFileSync('lib/services/prospect-meetings.ts', 'utf8')).toContain('...wakeSetSql()')
    expect(readFileSync('lib/services/prospect-enrich.ts', 'utf8')).toContain("restoreStatus === 'dormant'")
  })
})
