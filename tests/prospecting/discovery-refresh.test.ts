import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE DISCOVERY REFRESH + THE MATCHER AT THE DOOR (P-03). A finished
 * territory older than the clock is re-swept with the same parameters,
 * both phases from skip 0, under the NPPES cap; only NEW practices enter —
 * the matcher drops a registry row that is an EXACT duplicate of a practice
 * already held (same phone AND same name — the sweep's own bar), including
 * a merged one. A fuzzy likeness ENTERS: a human can only judge it on a row
 * that exists (fix pass, 2026-11-10).
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Array<Record<string, unknown>> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'orderBy', 'limit']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const list = Array.isArray(values) ? values : [values]
          state.inserts.push({ table: tableName(table), values: list })
          return {
            onConflictDoNothing: () => {
              const p: any = Promise.resolve(undefined)
              p.returning = async () => list.map((v) => ({ id: v.id }))
              return p
            },
          }
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: tableName(table), values })
          },
        }),
      }),
    },
    schema,
  }
})

const { searchMock, configMock } = vi.hoisted(() => ({ searchMock: vi.fn(), configMock: vi.fn() }))
vi.mock('@/lib/nppes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nppes')>()
  return { ...actual, searchNppesOrgs: searchMock }
})
vi.mock('@/lib/services/prospecting', () => ({ getProspectingConfig: configMock }))

import { filterAlreadyHeld, refreshStaleTerritory, REFRESH_NPPES_PER_RUN } from '@/lib/services/prospect-discovery'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false, enabledStates: ['GA'] }
const TASK = {
  id: 'pdt_1', state: 'GA', zipPrefix: '303', skip: 1400, status: 'done', found: 900, imported: 850,
  error: null, entityPhase: 'individual', lastRefreshedAt: null, createdAt: NOW, updatedAt: new Date('2026-09-01T00:00:00Z'),
}

function org(n: number, over: Record<string, unknown> = {}) {
  return {
    npiNumber: String(1000000000 + n),
    name: `Practice ${n}`,
    addressLine1: `${n} Main St`,
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30309',
    phone: `40455512${String(n % 100).padStart(2, '0')}`,
    taxonomyCode: '122300000X',
    authorizedOfficialName: 'Jane Doe',
    authorizedOfficialTitle: 'OWNER',
    ...over,
  }
}
const existing = (over: Record<string, unknown>) => ({
  id: 'pros_held', name: 'Smile Dental PC', phone: '4045550001', googlePlaceId: null, postalCode: '30309',
  qualityScore: 70, verifiedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), ...over,
})

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE)
})

describe('filterAlreadyHeld — the matcher at the door', () => {
  it('drops ONLY an exact duplicate of a practice already held (same phone AND same name); a fuzzy likeness enters for the drawer', async () => {
    state.selectQueue.push([existing({})])
    const { fresh, held } = await filterAlreadyHeld(
      [
        org(0, { name: 'Smile Dental, P.C.', phone: '4045550001' }), // the held practice under a second NPI — exact
        org(1, { name: 'Jane Roe DDS', phone: '4045550001' }), // same phone, other name — a human's question
        org(2, { name: 'Smile Dental, P.C.', phone: '4045559999' }), // same name at the ZIP, other phone — a human's question
        org(3, { name: 'Bright Orthodontics', phone: '4045558888' }), // new
      ],
      NOW,
    )
    expect(fresh.map((r) => r.npiNumber)).toEqual(['1000000001', '1000000002', '1000000003'])
    expect(held).toBe(1)
  })

  it('reads the held rows by the ten-digit phone KEY (a legacy "+1" row is found) — and a one-word generic name is no name', async () => {
    state.selectQueue.push([existing({ phone: '14045550001', name: 'J & J Dental' })])
    const { fresh } = await filterAlreadyHeld(
      [org(1, { name: 'The Dental Co LLC', phone: '(404) 555-0001' }), org(2, { name: 'J & J Dental', phone: '4045550001' })],
      NOW,
    )
    // Both share the desk phone; neither name is two meaningful words, so
    // neither is EXACT — both enter and the drawer asks.
    expect(fresh.map((r) => r.npiNumber)).toEqual(['1000000001', '1000000002'])
  })

  it('within one page, two rows of one practice let the first in and hold the second', async () => {
    state.selectQueue.push([])
    const { fresh } = await filterAlreadyHeld([org(1, { phone: '4045550001' }), org(2, { phone: '4045550001', name: 'Practice 1, LLC' })], NOW)
    expect(fresh.map((r) => r.npiNumber)).toEqual(['1000000001'])
  })

  it('a merged row still counts as held — its practice lives under the survivor', async () => {
    state.selectQueue.push([existing({ id: 'pros_merged' })])
    const { fresh } = await filterAlreadyHeld([org(1, { name: 'Smile Dental PC', phone: '4045550001' })], NOW)
    expect(fresh).toEqual([])
  })

  it('with nothing to key on, nothing is read and everything is fresh', async () => {
    const { fresh } = await filterAlreadyHeld([org(1, { phone: null, postalCode: null })], NOW)
    expect(fresh).toHaveLength(1)
    expect(state.selectQueue).toHaveLength(0)
  })
})

describe('refreshStaleTerritory', () => {
  it('no-ops on the kill switch or with no enabled states, and when no territory is due', async () => {
    configMock.mockResolvedValue({ ...LIVE, killSwitch: true })
    expect(await refreshStaleTerritory({ now: NOW })).toBeNull()
    configMock.mockResolvedValue({ ...LIVE, enabledStates: [] })
    expect(await refreshStaleTerritory({ now: NOW })).toBeNull()
    configMock.mockResolvedValue(LIVE)
    state.selectQueue.push([]) // no stale done task
    expect(await refreshStaleTerritory({ now: NOW })).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('re-sweeps the territory with the same parameters, both phases from skip 0, only new NPIs enter, and stamps the task', async () => {
    state.selectQueue.push([TASK])
    // org phase: one short page with a held row and a new one; individual phase: one short empty page.
    searchMock.mockResolvedValueOnce({ results: [org(1, { name: 'Smile Dental, PC', phone: '4045550001' }), org(2)], resultCount: 2 })
    state.selectQueue.push([existing({})]) // the matcher's read for that page
    searchMock.mockResolvedValueOnce({ results: [], resultCount: 0 })

    const r = await refreshStaleTerritory({ now: NOW, config: LIVE })
    expect(r).toEqual({ taskId: 'pdt_1', state: 'GA', zipPrefix: '303', found: 2, imported: 1, held: 1, requests: 2, capped: false })
    expect(searchMock.mock.calls.map((c) => c[0])).toEqual([
      { state: 'GA', zipPrefix: '303', skip: 0, enumerationType: 'NPI-2' },
      { state: 'GA', zipPrefix: '303', skip: 0, enumerationType: 'NPI-1' },
    ])
    expect(state.inserts.filter((i) => i.table === 'prospect').flatMap((i) => i.values.map((v) => v.npiNumber))).toEqual(['1000000002'])
    const stamp = state.updates.find((u) => u.table === 'prospectDiscoveryTask')
    expect(stamp?.values).toMatchObject({ lastRefreshedAt: NOW, lastRefreshErrorAt: null, found: 902, imported: 851, error: null, updatedAt: NOW })
  })

  it('pages a long phase and stops at the NPPES cap on requests, reporting capped', async () => {
    state.selectQueue.push([TASK])
    searchMock.mockResolvedValue({ results: [], resultCount: 200 }) // never runs dry
    const r = await refreshStaleTerritory({ now: NOW, config: LIVE, nppesBudget: 3 })
    expect(r).toMatchObject({ requests: 3, capped: true })
    expect(searchMock).toHaveBeenCalledTimes(3)
    expect(REFRESH_NPPES_PER_RUN).toBe(50)
    // Still stamped — the next refresh of this territory starts over.
    expect(state.updates.find((u) => u.table === 'prospectDiscoveryTask')?.values).toMatchObject({ lastRefreshedAt: NOW })
  })

  it('V10: a page that throws stamps the ERROR clock and rethrows — never last_refreshed_at (the tile reads a refresh that happened) and never updated_at (the territory stays due, at the back of the line)', async () => {
    state.selectQueue.push([TASK])
    searchMock.mockResolvedValueOnce({ results: [], resultCount: 200 })
    searchMock.mockRejectedValueOnce(new Error('NPPES 503'))
    await expect(refreshStaleTerritory({ now: NOW, config: LIVE })).rejects.toThrow('NPPES 503')
    const stamp = state.updates.find((u) => u.table === 'prospectDiscoveryTask')
    expect(stamp?.values).toEqual({ lastRefreshErrorAt: NOW, error: 'refresh: NPPES 503', found: 1100, imported: 850 })
    expect(stamp?.values).not.toHaveProperty('lastRefreshedAt')
    expect(stamp?.values).not.toHaveProperty('updatedAt')
    // A 503 on page ONE: zero pages swept, the same stamp — nothing for the tile to call "refreshed".
    state.updates.length = 0
    state.selectQueue.push([TASK])
    searchMock.mockRejectedValueOnce(new Error('NPPES 503'))
    await expect(refreshStaleTerritory({ now: NOW, config: LIVE })).rejects.toThrow('NPPES 503')
    expect(state.updates.find((u) => u.table === 'prospectDiscoveryTask')?.values).toEqual({ lastRefreshErrorAt: NOW, error: 'refresh: NPPES 503', found: 900, imported: 850 })
  })

  it('a full page at the NPPES skip ceiling ends the phase rather than asking past it', async () => {
    state.selectQueue.push([TASK])
    // 7 full pages: skip 0..1200; after the 7th, skip 1400 > 1200 → stop; then the individual phase, one empty page.
    for (let i = 0; i < 7; i++) searchMock.mockResolvedValueOnce({ results: [], resultCount: 200 })
    searchMock.mockResolvedValueOnce({ results: [], resultCount: 0 })
    const r = await refreshStaleTerritory({ now: NOW, config: LIVE })
    expect(r).toMatchObject({ requests: 8, capped: false, found: 1400 })
  })
})
