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
  // The real prospect-verify module (its pure helpers ride below) pulls the
  // schema in, which tags columns with sql``.
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

// Contact sync (MX verification) is exercised in contacts.test.ts; stub it
// here so enrichment stays focused and never touches DNS.
const { syncContactsMock } = vi.hoisted(() => ({
  syncContactsMock: vi.fn(async () => ({ upserted: 0, verified: 0 })),
}))
vi.mock('@/lib/services/prospect-contacts', () => ({ syncProspectContacts: syncContactsMock }))

// The verification pass (P-01) is exercised in verify.test.ts; here it is a
// stub that takes the first candidate as the match (the old blind
// behaviour, deliberately — enrichment's own contract is what is under
// test) and disqualifies a permanently closed one.
const { verifyMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verifyMock: vi.fn(async (_p: unknown, places: { ok: boolean; places?: Array<Record<string, unknown>> } | null): Promise<any> => {
    const place = places?.ok ? (places.places?.[0] ?? null) : null
    const closed = place?.businessStatus === 'CLOSED_PERMANENTLY'
    return {
      patch: {
        verification: {},
        verifiedAt: new Date('2026-07-07T00:00:00Z'),
        qualityScore: closed ? 0 : 82,
        qualityBand: closed ? 'parked' : 'best',
        qualityReasons: [],
        phone: null,
        phoneStatus: 'unknown',
        phoneLineType: null,
        phoneSource: null,
        phoneValidatedAt: null,
        ...(closed ? { status: 'disqualified', suppressedReason: 'closed' } : {}),
      },
      place,
      match: null,
      websiteUrl: place ? (place.websiteUri as string | null) : null,
      liveness: null,
    }
  }),
}))
vi.mock('@/lib/services/prospect-verify', async (importOriginal) => ({
  // listingColumns + outreachStopReason are the real (pure) ones — the
  // enrich write and the drip stop ride them.
  ...(await importOriginal<typeof import('@/lib/services/prospect-verify')>()),
  verifyProspectSignals: verifyMock,
  newVerifyRunCtx: vi.fn(async () => ({})),
  closeVerifyRun: vi.fn(async () => {}),
}))

const { configMock, counterMock, bumpMock, placeMock, placesConfiguredMock, aiMock, aiConfiguredMock, fetchMock, stopMock } =
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
    stopMock: vi.fn(async (_id: string, _reason: string) => {}),
  }))

vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
  stopActiveEnrollments: stopMock,
}))
vi.mock('@/lib/google-places', () => ({
  findDentalPlaceCandidates: placeMock,
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
  displayName: 'Smile Dental',
  formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
  nationalPhoneNumber: null,
  websiteUri: 'https://smiledental.com',
  ratingTenths: 47,
  reviewCount: 22,
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/x',
}
/** The candidates shape findDentalPlaceCandidates returns. */
const found = (...places: Array<Record<string, unknown>>) => ({ ok: true as const, places })

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

// The crawler reads bodies as STREAMS, cut at the byte cap (never res.text()
// first) — so the shim carries a real stream.
const bodyStream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text))
      c.close()
    },
  })
function mockPageFetches() {
  // robots.txt (allow), then the homepage.
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/robots.txt')) {
      return { ok: true, text: async () => 'User-agent: *\nAllow: /', url } as Response
    }
    return { ok: true, body: bodyStream(HOMEPAGE), text: async () => HOMEPAGE, url: 'https://smiledental.com' } as unknown as Response
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
    placeMock.mockResolvedValue(found(PLACE))
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
    })
    expect(final.values.opportunityScore).toBeGreaterThanOrEqual(80)
    // The verification patch rides the same write (P-01).
    expect(final.values).toMatchObject({ qualityScore: 82, qualityBand: 'best' })
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'pros_1' }), found(PLACE), expect.anything())
    // The crawled address is now handed to the reachability layer (which
    // classifies/verifies/ranks it and sets prospect.email), not written inline.
    expect(syncContactsMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROSPECT.id }),
      expect.arrayContaining(['hello@smiledental.com']),
    )
  })

  it('no website found → hot without spending a crawl or AI call', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, websiteUri: null }))

    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, crawls: 0, aiScored: 0 })
    expect(aiMock).not.toHaveBeenCalled()
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'enriched', scoreBand: 'hot', websiteUrl: null })
    expect(final.values.opportunityScore).toBeGreaterThanOrEqual(90)
  })

  it('permanently closed practices are disqualified, not scored', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' }))

    const r = await runEnrichment()
    expect(r.enriched).toBe(0)
    expect(r.disqualified).toBe(1)
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'disqualified', suppressedReason: 'closed' })
    // No crawl, no AI — nothing is spent on a practice that no longer exists.
    expect(aiMock).not.toHaveBeenCalled()
  })

  it('AI failure falls back to the heuristic verdict (still enriched + scored)', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
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
    placeMock.mockResolvedValue(found(PLACE))
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

  it('a dead or parked website is never crawled — the quality score already parks the record', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    verifyMock.mockImplementationOnce(async () => ({
      patch: {
        verification: { website: { status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: '2026-07-07T00:00:00.000Z', source: 'crawl' } },
        verifiedAt: new Date('2026-07-07T00:00:00Z'),
        qualityScore: 0, qualityBand: 'parked', qualityReasons: ['smiledental.com no longer resolves (DNS)'],
        phone: null, phoneStatus: 'unknown', phoneLineType: null, phoneSource: null, phoneValidatedAt: null,
      },
      place: PLACE, match: null, websiteUrl: PLACE.websiteUri, liveness: null,
    }))
    mockPageFetches()
    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, crawls: 0, aiScored: 0 })
    const final = state.updates.at(-1)!
    expect(final.values).toMatchObject({ status: 'enriched', qualityBand: 'parked', websiteUrl: 'https://smiledental.com' })
    // The opportunity score still says "they need a website" — the two scores are never blended.
    expect(final.values.opportunityScore).toBeGreaterThanOrEqual(65)
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

describe('P-01 fixes: the listing columns + the drip stop ride the verify outcome', () => {
  const basePatch = {
    verification: {},
    verifiedAt: new Date('2026-07-07T00:00:00Z'),
    qualityScore: 72,
    qualityBand: 'good',
    qualityReasons: [],
    phone: null,
    phoneStatus: 'unknown',
    phoneLineType: null,
    phoneSource: null,
    phoneValidatedAt: null,
  }

  it('a permanently closed practice stops its active enrollment (C7)', async () => {
    stopMock.mockClear()
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' }))
    await runEnrichment()
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_closed')
  })

  it('a dead website parks the record AND stops the drip; a healthy pass stops nothing', async () => {
    stopMock.mockClear()
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    verifyMock.mockImplementationOnce(async () => ({
      patch: {
        ...basePatch,
        verification: { website: { status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: '2026-07-07T00:00:00.000Z', source: 'crawl' } },
        qualityScore: 0,
        qualityBand: 'parked',
      },
      place: PLACE, match: null, websiteUrl: PLACE.websiteUri, liveness: null, listing: 'matched',
    }))
    await runEnrichment()
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_site_dead')

    stopMock.mockClear()
    state.selectQueue.push([PROSPECT])
    mockPageFetches()
    await runEnrichment()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('a pass with no lookup keeps the listing columns; a no-match clears them (C1/C4)', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue({ ok: false, error: 'unavailable' })
    verifyMock.mockImplementationOnce(async () => ({
      patch: basePatch, place: null, match: null, websiteUrl: 'https://smiledental.com', liveness: null, listing: 'kept',
    }))
    mockPageFetches()
    await runEnrichment()
    const kept = state.updates.at(-1)!.values
    expect(kept.status).toBe('enriched')
    for (const k of ['googlePlaceId', 'googleRatingTenths', 'reviewCount', 'businessStatus', 'googleMapsUri']) {
      expect(kept).not.toHaveProperty(k)
    }
    expect(kept.websiteUrl).toBe('https://smiledental.com')

    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, displayName: 'Bright Orthodontics' }))
    verifyMock.mockImplementationOnce(async () => ({
      patch: basePatch, place: null, match: null, websiteUrl: null, liveness: null, listing: 'cleared',
    }))
    await runEnrichment()
    const cleared = state.updates.at(-1)!.values
    expect(cleared).toMatchObject({ googlePlaceId: null, googleRatingTenths: null, reviewCount: null, businessStatus: null, googleMapsUri: null, websiteUrl: null })
  })
})
