import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Enrichment orchestrator — the gating contract (kill switch, missing
 * Places key, budget soft-pause), the happy path (Places → crawl → AI →
 * score → enriched), permanently-closed disqualification, crawled-email
 * write (only-when-null), and error → back-to-pool.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  counters: [] as Array<{ period: string; kind: string }>,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', status: 'status', createdAt: 'c' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  asc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}))

const { configMock, counterMock, bumpMock, placeMock, placesConfiguredMock, aiMock, aiConfiguredMock, fetchMock } =
  vi.hoisted(() => ({
    configMock: vi.fn(),
    counterMock: vi.fn(async () => 0),
    bumpMock: vi.fn(async (period: string, kind: string) => {
      state.counters.push({ period, kind })
    }),
    placeMock: vi.fn(),
    placesConfiguredMock: vi.fn(() => true),
    aiMock: vi.fn(),
    aiConfiguredMock: vi.fn(() => true),
    fetchMock: vi.fn(),
  }))

vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
}))
vi.mock('@/lib/google-places', () => ({
  findDentalPlace: placeMock,
  placesConfigured: placesConfiguredMock,
}))
vi.mock('@/lib/ai', () => ({
  runClaudeJson: aiMock,
  aiConfigured: aiConfiguredMock,
}))

import { runEnrichment, reEnrichProspect } from '@/lib/services/prospect-enrich'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false, enabledStates: ['GA'] }

const PROSPECT = {
  id: 'pros_1', name: 'Smile Dental', addressLine1: '123 Main St', city: 'Atlanta',
  state: 'GA', email: null, status: 'discovered',
}

const PLACE = {
  placeId: 'place_1',
  websiteUri: 'https://smiledental.com',
  ratingTenths: 47,
  reviewCount: 22,
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/x',
}

const HOMEPAGE = `<!doctype html><html><head><title>Smile Dental</title>
  <meta name="viewport" content="width=device-width"></head>
  <body><a href="mailto:hello@smiledental.com">email</a>© 2026</body></html>`

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.counters = []
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE)
  counterMock.mockResolvedValue(0)
  placesConfiguredMock.mockReturnValue(true)
  aiConfiguredMock.mockReturnValue(true)
  vi.stubGlobal('fetch', fetchMock)
})

function mockPageFetches() {
  // robots.txt (allow), then the homepage.
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/robots.txt')) {
      return { ok: true, text: async () => 'User-agent: *\nAllow: /', url } as Response
    }
    return { ok: true, text: async () => HOMEPAGE, url: 'https://smiledental.com' } as Response
  })
}

describe('runEnrichment gating', () => {
  it('no-ops on the kill switch and on a missing Places key', async () => {
    configMock.mockResolvedValue({ ...LIVE, killSwitch: true })
    expect((await runEnrichment()).skipped).toBe('kill_switch')

    configMock.mockResolvedValue(LIVE)
    placesConfiguredMock.mockReturnValue(false)
    expect((await runEnrichment()).skipped).toBe('places_not_configured')
  })

  it('soft-pauses on the monthly Places budget (prospects stay discovered)', async () => {
    counterMock.mockResolvedValue(LIVE.budgets.placesPerMonth)
    const r = await runEnrichment()
    expect(r.skipped).toBe('places_budget')
    expect(placeMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })
})

describe('runEnrichment happy path', () => {
  it('Places → crawl → AI verdict → deterministic score → enriched (+ crawled email)', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(PLACE)
    mockPageFetches()
    aiMock.mockResolvedValue({
      websiteQuality: 25,
      websiteReasons: ['thin content'],
      socialPresence: 0,
      onlineBooking: false,
      weaknesses: ['no online booking', 'site looks dated'],
      summary: 'Dated site.',
    })

    const r = await runEnrichment()
    expect(r).toMatchObject({ scanned: 1, enriched: 1, placesLookups: 1, crawls: 1, aiScored: 1, errors: 0 })
    expect(state.counters.map((c) => c.kind)).toEqual(['places_lookup', 'crawl', 'ai_score'])

    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({
      status: 'enriched',
      websiteUrl: 'https://smiledental.com',
      googleRatingTenths: 47,
      reviewCount: 22,
      scoreBand: 'hot', // quality 25 + no booking + no social ⇒ 65+8+5+4 = 82
      email: 'hello@smiledental.com',
      emailSource: 'crawl_mailto',
    })
    expect(final.values.opportunityScore).toBeGreaterThanOrEqual(80)
  })

  it('no website found → hot without spending a crawl or AI call', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue({ ...PLACE, websiteUri: null })

    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, crawls: 0, aiScored: 0 })
    expect(aiMock).not.toHaveBeenCalled()
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'enriched', scoreBand: 'hot', websiteUrl: null })
    expect(final.values.opportunityScore).toBeGreaterThanOrEqual(90)
  })

  it('permanently closed practices are disqualified, not scored', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue({ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' })

    const r = await runEnrichment()
    expect(r.enriched).toBe(0)
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'disqualified' })
  })

  it('AI failure falls back to the heuristic verdict (still enriched + scored)', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(PLACE)
    mockPageFetches()
    aiMock.mockRejectedValue(new Error('api down'))

    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, aiScored: 0, errors: 0 })
    const final = state.updates.at(-1)!
    expect(final.values.status).toBe('enriched')
    expect(final.values.opportunityScore).toBeTypeOf('number')
  })

  it('an unexpected error sends the prospect back to the discovered pool', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockRejectedValue(new Error('boom'))

    const r = await runEnrichment()
    expect(r.errors).toBe(1)
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'discovered' })
  })
})

describe('reEnrichProspect (manual refresh)', () => {
  it('refreshes an already-forward prospect WITHOUT demoting its status', async () => {
    state.selectQueue.push([{ ...PROSPECT, status: 'contacted' }])
    placeMock.mockResolvedValue(PLACE)
    mockPageFetches()
    aiMock.mockResolvedValue({
      websiteQuality: 25, websiteReasons: [], socialPresence: 0,
      onlineBooking: false, weaknesses: ['no online booking'], summary: 'x',
    })
    const r = await reEnrichProspect('pros_1')
    expect(r).toEqual({ ok: true })
    const final = state.updates.at(-1)!
    // Fresh enrichment written, pipeline status preserved.
    expect(final.values).toMatchObject({ status: 'contacted', websiteUrl: 'https://smiledental.com' })
  })

  it('fails soft on budget exhaustion and unknown ids', async () => {
    counterMock.mockResolvedValue(LIVE.budgets.placesPerMonth)
    state.selectQueue.push([PROSPECT])
    expect(await reEnrichProspect('pros_1')).toEqual({ ok: false, reason: 'budget' })

    counterMock.mockResolvedValue(0)
    state.selectQueue.push([])
    expect(await reEnrichProspect('pros_missing')).toEqual({ ok: false, reason: 'not_found' })
  })
})
