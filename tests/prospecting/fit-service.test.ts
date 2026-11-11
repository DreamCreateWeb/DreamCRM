import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FIT — the group work (P-04): the chain sweep over shared hosts / phones
 * (every member flagged, a customer never, an overridden row never, a
 * generic host never; the drip stopped and the caller's slot freed), the
 * owner's "Not a chain" (the override stored for good, the row back where
 * it was, the quality recomputed), the chains count, and the callers'
 * freshness pull (a hot territory's refresh pulled forward with its
 * reason; a cold one untouched; a pulled task never pulled twice).
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  returning: [] as unknown[][],
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'groupBy', 'having', 'limit', 'innerJoin', 'orderBy']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            const w: any = {
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
                state.updates.push({ table: tableName(table), values })
                return Promise.resolve(undefined).then(onF, onR)
              },
              returning: async () => {
                state.updates.push({ table: tableName(table), values })
                return state.returning.shift() ?? []
              },
            }
            return w
          },
        }),
      }),
    },
    schema,
  }
})

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  stop: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
  clear: vi.fn(async (_id: string, _now?: Date) => {}),
  release: vi.fn(async (_id: string, _now?: Date) => true),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: mocks.config,
  stopActiveEnrollments: mocks.stop,
  clearSystemFollowUp: mocks.clear,
}))
vi.mock('@/lib/services/prospect-caller-release', () => ({
  releaseIfUnservable: mocks.release,
  callerServableWhere: vi.fn(() => undefined),
  releaseCooldownUntil: vi.fn((d: Date) => d),
}))
vi.mock('@/lib/services/prospect-dedupe', async () => {
  const { sql } = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return { tenDigitPhoneSql: () => sql`phone_key` }
})

import { clearChainFlag, countChains, findChainGroups, sweepChains } from '@/lib/services/prospect-fit'
import { pullForwardHotTerritories } from '@/lib/services/prospect-discovery'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false, enabledStates: ['TX'] }
const AT = '2026-11-01T00:00:00.000Z'
const prospectUpdates = () => state.updates.filter((u) => u.table === 'prospect')

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.returning = []
  vi.clearAllMocks()
  mocks.config.mockResolvedValue(LIVE)
})

describe('findChainGroups', () => {
  it('reads the host groups then the phone groups, drops a generic host, keeps the ids', async () => {
    state.selectQueue.push(
      [
        { key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] },
        { key: 'facebook.com', addresses: 12, ids: ['f1', 'f2', 'f3'] },
        { key: null, addresses: 5, ids: ['n'] },
      ],
      [{ key: '4045551212', addresses: 4, ids: ['p1', 'p2', 'p3', 'p4'] }],
    )
    const groups = await findChainGroups()
    expect(groups).toEqual([
      { kind: 'shared_host', key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] },
      { kind: 'shared_phone', key: '4045551212', addresses: 4, ids: ['p1', 'p2', 'p3', 'p4'] },
    ])
  })
})

describe('sweepChains', () => {
  it('flags every live member (status, reason, zero quality, the stored signal with its prior status), notes a row that already said no, skips an overridden one', async () => {
    state.selectQueue.push(
      [{ key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] }],
      [],
      [
        { id: 'a', status: 'contacted', suppressedReason: null, verification: { npi: { status: 'active', detail: null, checkedAt: AT, source: 'nppes' } } },
        { id: 'b', status: 'not_interested', suppressedReason: null, verification: null },
        { id: 'c', status: 'enriched', suppressedReason: null, verification: { fit: { chainOverride: { status: 'not_a_chain', detail: null, checkedAt: AT, source: 'owner' } } } },
      ],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toEqual({ groups: 1, flagged: 1, noted: 1, errors: 0 })
    const writes = prospectUpdates()
    expect(writes).toHaveLength(2)
    const a = writes[0].values
    expect(a).toMatchObject({ status: 'disqualified', suppressedReason: 'chain', suppressedAt: NOW, qualityScore: 0, qualityBand: 'parked' })
    expect(a.qualityReasons).toEqual(["Shares its website with 2 other practices at different addresses — a chain; we'll target chains later"])
    const fitA = (a.verification as { fit: Record<string, unknown>; npi: unknown }).fit
    expect(fitA.chain).toMatchObject({ status: 'shared_host', kind: 'shared_host', count: 3, key: 'aspen.com', priorStatus: 'contacted', source: 'our_data', checkedAt: NOW.toISOString() })
    // The prior signals survive the flag.
    expect((a.verification as { npi: { status: string } }).npi.status).toBe('active')
    // The hold: the drip stops, the system follow-up clears, the caller's slot frees.
    expect(mocks.stop).toHaveBeenCalledWith('a', 'verify_chain', NOW)
    expect(mocks.clear).toHaveBeenCalledWith('a', NOW)
    expect(mocks.release).toHaveBeenCalledWith('a', NOW)
    // b keeps its status — only the signal lands (with the status it kept, for the record).
    const b = writes[1].values
    expect(b).not.toHaveProperty('status')
    expect((b.verification as { fit: { chain: { priorStatus: string | null } } }).fit.chain.priorStatus).toBe('not_interested')
    expect(mocks.stop).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a row already set aside as a chain only refreshes its signal and keeps the status it had before the flag', async () => {
    state.selectQueue.push(
      [],
      [{ key: '4045551212', addresses: 3, ids: ['p1'] }],
      [{ id: 'p1', status: 'disqualified', suppressedReason: 'chain', verification: { fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'queued' } } } }],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toEqual({ groups: 1, flagged: 0, noted: 1, errors: 0 })
    const w = prospectUpdates()[0].values
    expect(w).not.toHaveProperty('status')
    expect((w.verification as { fit: { chain: { priorStatus: string } } }).fit.chain.priorStatus).toBe('queued')
    expect(mocks.stop).not.toHaveBeenCalled()
  })

  it('no groups, no writes', async () => {
    state.selectQueue.push([], [])
    expect(await sweepChains({ now: NOW })).toEqual({ groups: 0, flagged: 0, noted: 0, errors: 0 })
    expect(state.updates).toHaveLength(0)
  })
})

describe('clearChainFlag — "Not a chain"', () => {
  const GOOD = {
    places: { status: 'matched', detail: null, checkedAt: AT, source: 'places' },
    business: { status: 'open', detail: null, checkedAt: AT, source: 'places' },
    npi: { status: 'active', detail: null, checkedAt: AT, source: 'nppes' },
    website: { status: 'alive', detail: null, checkedAt: AT, source: 'crawl' },
    phone: { status: 'well_formed', detail: null, checkedAt: AT, source: 'nanp', sources: ['nppes', 'places'], standing: 'corroborated' },
  }
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'pros_1',
    status: 'disqualified',
    suppressedReason: 'chain',
    verification: { ...GOOD, fit: { dso: { status: 'match', detail: 'x', checkedAt: AT, source: 'dso_list', name: 'Aspen Dental', matchedOn: 'practice', priorStatus: 'contacted' } } },
    verifiedAt: new Date(AT),
    phoneStatus: 'unknown',
    phoneLineType: null,
    businessStatus: 'OPERATIONAL',
    reviewCount: 40,
    websiteUrl: 'https://smile.com',
    ...over,
  })

  it('refuses an unknown id, a merged shell and a row that is not flagged', async () => {
    state.selectQueue.push([])
    expect(await clearChainFlag('nope', NOW)).toEqual({ ok: false, reason: 'not_found' })
    state.selectQueue.push([row({ status: 'merged' })])
    expect(await clearChainFlag('pros_1', NOW)).toEqual({ ok: false, reason: 'merged' })
    state.selectQueue.push([row({ status: 'enriched', suppressedReason: null, verification: GOOD })])
    expect(await clearChainFlag('pros_1', NOW)).toEqual({ ok: false, reason: 'not_flagged' })
    expect(state.updates).toHaveLength(0)
  })

  it('stores the override, returns the row to where it was, clears the suppression and recomputes quality from the stored signals', async () => {
    state.selectQueue.push([row()])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'contacted' })
    const w = prospectUpdates()[0].values
    expect(w).toMatchObject({ status: 'contacted', suppressedReason: null, suppressedAt: null, updatedAt: NOW })
    const fit = (w.verification as { fit: Record<string, { status: string; source: string; checkedAt: string }> }).fit
    expect(fit.chainOverride).toMatchObject({ status: 'not_a_chain', source: 'owner', checkedAt: NOW.toISOString() })
    expect(fit.dso.status).toBe('match') // the record of what was found stays; the override outranks it
    // 35 + 20 + 15 + 10 + 10 = 90 — the pass's signals, scored again under the restored status.
    expect(w).toMatchObject({ qualityScore: 90, qualityBand: 'best' })
  })

  it('a never-verified row reads "not verified yet" again; a sweep flag with no prior status goes back to enriched', async () => {
    state.selectQueue.push([
      row({
        verifiedAt: null,
        verification: { fit: { chain: { status: 'shared_host', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: null } } },
      }),
    ])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'enriched' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'enriched', qualityScore: null, qualityBand: null, qualityReasons: null })
  })

  it('an override on a row that kept its status (a customer the sweep only noted) writes the override and nothing else', async () => {
    state.selectQueue.push([row({ status: 'not_interested', suppressedReason: null, verification: { fit: { chain: { status: 'shared_host', detail: null, checkedAt: AT, source: 'our_data', count: 3 } } } })])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'not_interested' })
    const w = prospectUpdates()[0].values
    expect(w).not.toHaveProperty('suppressedReason')
    expect(w).not.toHaveProperty('qualityScore')
  })
})

describe('countChains', () => {
  it('rows disqualified with reason chain', async () => {
    state.selectQueue.push([{ n: 4 }])
    expect(await countChains()).toBe(4)
    state.selectQueue.push([])
    expect(await countChains()).toBe(0)
  })
})

describe('pullForwardHotTerritories — callers steer freshness', () => {
  it('pulls a territory with ≥3 closed practices forward: the refresh stamp set back past the clock, the pull stamped with its reason; a cold one untouched', async () => {
    state.selectQueue.push([
      { state: 'TX', zipPrefix: '787', closed: 3 },
      { state: 'GA', zipPrefix: '303', closed: 2 },
      { state: null, zipPrefix: '111', closed: 9 },
    ])
    state.returning.push([{ id: 'pdt_1' }, { id: 'pdt_2' }])
    const r = await pullForwardHotTerritories({ now: NOW, config: LIVE })
    expect(r).toEqual([{ state: 'TX', zipPrefix: '787', closed: 3, tasks: 2 }])
    const w = state.updates.filter((u) => u.table === 'prospectDiscoveryTask')
    expect(w).toHaveLength(1)
    expect(w[0].values).toEqual({
      lastRefreshedAt: new Date(NOW.getTime() - (LIVE.hygiene.discoveryRefreshDays + 1) * DAY),
      refreshPulledAt: NOW,
      refreshPulledReason: '3 closed practices this month',
    })
  })
  it('a territory whose tasks were all already pulled or already due reports nothing', async () => {
    state.selectQueue.push([{ state: 'TX', zipPrefix: '787', closed: 5 }])
    state.returning.push([])
    expect(await pullForwardHotTerritories({ now: NOW, config: LIVE })).toEqual([])
  })
  it('no-ops on the kill switch', async () => {
    expect(await pullForwardHotTerritories({ now: NOW, config: { ...LIVE, killSwitch: true } })).toEqual([])
    expect(state.updates).toHaveLength(0)
  })
})
