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

// The cold-caller release hook (P-02 / P-04) rides the disqualified branch;
// its own suite covers it — here it is a spy so the update counts below
// stay the enrich pass's own statements.
const { releaseMock } = vi.hoisted(() => ({ releaseMock: vi.fn(async (_id: string, _now?: Date) => false) }))
vi.mock('@/lib/services/prospect-caller-release', () => ({ releaseIfUnservable: releaseMock }))

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
  // listingColumns + applyOutreachHold are the real (pure / thin) ones —
  // the enrich write and the drip hold ride them.
  ...(await importOriginal<typeof import('@/lib/services/prospect-verify')>()),
  verifyProspectSignals: verifyMock,
  newVerifyRunCtx: vi.fn(async () => ({ now: new Date('2026-07-07T00:00:00Z') })),
  closeVerifyRun: vi.fn(async () => {}),
}))
// The crawler rides the guarded session: every host is resolved and judged
// before it is fetched. A public answer for every name, so no test touches DNS.
vi.mock('node:dns/promises', () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }]
  return { default: { lookup }, lookup }
})

const { configMock, counterMock, bumpMock, placeMock, placesConfiguredMock, aiMock, aiConfiguredMock, fetchMock, stopMock, pauseMock, resumeMock, clearFollowUpMock } =
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
    stopMock: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
    pauseMock: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
    resumeMock: vi.fn(async (_id: string, _now?: Date) => {}),
    clearFollowUpMock: vi.fn(async (_id: string, _now?: Date) => {}),
  }))

vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
  stopActiveEnrollments: stopMock,
  pauseActiveEnrollments: pauseMock,
  resumeVerifyPausedEnrollments: resumeMock,
  clearSystemFollowUp: clearFollowUpMock,
}))
vi.mock('@/lib/google-places', () => ({
  findDentalPlaceCandidates: placeMock,
  placesConfigured: placesConfiguredMock,
}))
vi.mock('@/lib/ai', () => ({
  runClaudeJson: aiMock,
  aiConfigured: aiConfiguredMock,
}))

import { runEnrichment, reEnrichProspect, unreadCrawlSignals } from '@/lib/services/prospect-enrich'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const NOW = new Date('2026-07-07T00:00:00Z')

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
        verification: { website: { status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: '2026-07-07T00:00:00.000Z', source: 'crawl', cause: 'dns' } },
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
    // X1: a site that is GONE (dead by dns) is not an unread one — its state
    // was read; the verdict is the no-website one, never "Website not read".
    expect(final.values.aiVerdict).toMatchObject({ hasWebsite: false, summary: 'No website found.' })
    expect(final.values.scoreReasons as string[]).not.toContain('Website not read — quality unknown')
  })

  it('Y1: a site the probe marked dead because it TIMED OUT TWICE is UNREAD — the unread verdict (hasWebsite true, websiteRead false, no "no website" weakness), never 92; a parked page and a legacy dead with no cause stay the no-website verdict', async () => {
    const deadWith = (website: Record<string, unknown>, detail: string) => async () => ({
      patch: {
        verification: { website: { status: 'dead', detail, checkedAt: '2026-07-07T00:00:00.000Z', source: 'crawl', ...website } },
        verifiedAt: new Date('2026-07-07T00:00:00Z'),
        qualityScore: 0, qualityBand: 'parked', qualityReasons: [detail],
        phone: null, phoneStatus: 'unknown', phoneLineType: null, phoneSource: null, phoneValidatedAt: null,
      },
      place: PLACE, match: null, websiteUrl: PLACE.websiteUri, liveness: null,
    })
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    verifyMock.mockImplementationOnce(deadWith({ cause: 'timeout' }, 'smiledental.com timed out twice (6s)'))
    mockPageFetches()
    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, crawls: 0, aiScored: 0 })
    const slow = state.updates.at(-1)!.values
    expect(slow).toMatchObject({ status: 'enriched', qualityBand: 'parked', websiteUrl: 'https://smiledental.com' })
    expect(slow.aiVerdict).toMatchObject({ hasWebsite: true, websiteRead: false, weaknesses: [], summary: 'Website not read.' })
    expect(slow.scoreReasons as string[]).toContain('Website not read — quality unknown')
    expect(slow.scoreReasons as string[]).not.toContain('No website at all — needs everything we sell')
    expect(slow.opportunityScore).toBeLessThan(90)
    expect(slow.scoreBand).not.toBe('hot')
    // A parked page WAS read: the practice has no working website.
    state.updates.length = 0
    state.selectQueue.push([PROSPECT])
    verifyMock.mockImplementationOnce(deadWith({ status: 'parked', cause: 'parked' }, 'smiledental.com shows a parked-domain page'))
    await runEnrichment()
    expect(state.updates.at(-1)!.values.aiVerdict).toMatchObject({ hasWebsite: false, summary: 'No website found.' })
    // A dead stored before the cause was kept reads as gone, as it did.
    state.updates.length = 0
    state.selectQueue.push([PROSPECT])
    verifyMock.mockImplementationOnce(deadWith({}, 'smiledental.com answers with a server error (503)'))
    await runEnrichment()
    expect(state.updates.at(-1)!.values.aiVerdict).toMatchObject({ hasWebsite: false, summary: 'No website found.' })
  })

  it('fails soft on budget exhaustion and unknown ids', async () => {
    counterMock.mockResolvedValue(LIVE.budgets.placesPerMonth)
    state.selectQueue.push([PROSPECT])
    expect(await reEnrichProspect('pros_1')).toEqual({ ok: false, reason: 'budget' })

    counterMock.mockResolvedValue(0)
    state.selectQueue.push([])
    expect(await reEnrichProspect('pros_missing')).toEqual({ ok: false, reason: 'not_found' })
    // A merged duplicate never flips to 'enriching' (P-03).
    state.updates.length = 0
    state.selectQueue.push([{ ...PROSPECT, status: 'merged' }])
    expect(await reEnrichProspect('pros_1')).toEqual({ ok: false, reason: 'merged' })
    expect(state.updates).toHaveLength(0)
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

  it('a permanently closed practice STOPS its active enrollment and clears the system follow-up (C7)', async () => {
    stopMock.mockClear()
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' }))
    await runEnrichment()
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_closed', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(pauseMock).not.toHaveBeenCalled()
  })

  it('a dead website parks the record AND PAUSES the drip (never a permanent stop); a healthy pass resumes', async () => {
    stopMock.mockClear()
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    verifyMock.mockImplementationOnce(async () => ({
      patch: {
        ...basePatch,
        verification: { website: { status: 'dead', detail: 'smiledental.com answers with a server error (503)', checkedAt: '2026-07-07T00:00:00.000Z', source: 'crawl' } },
        qualityScore: 0,
        qualityBand: 'parked',
      },
      place: PLACE, match: null, websiteUrl: PLACE.websiteUri, liveness: null, listing: 'matched',
    }))
    await runEnrichment()
    expect(pauseMock).toHaveBeenCalledWith('pros_1', 'verify_site_dead', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(stopMock).not.toHaveBeenCalled()

    stopMock.mockClear()
    pauseMock.mockClear()
    resumeMock.mockClear()
    clearFollowUpMock.mockClear()
    state.selectQueue.push([PROSPECT])
    mockPageFetches()
    await runEnrichment()
    expect(stopMock).not.toHaveBeenCalled()
    expect(pauseMock).not.toHaveBeenCalled()
    expect(clearFollowUpMock).not.toHaveBeenCalled()
    expect(resumeMock).toHaveBeenCalledWith('pros_1', NOW)
  })

  it('a URL the probe refused on policy is never handed to the crawler, whatever the stored signal says (C13)', async () => {
    state.selectQueue.push([PROSPECT])
    const hostile = 'http://169.254.170.2/v2/credentials/'
    placeMock.mockResolvedValue(found({ ...PLACE, websiteUri: hostile }))
    verifyMock.mockImplementationOnce(async () => ({
      patch: {
        ...basePatch,
        // The prior signal stood (a private address is "unknown", not news).
        verification: { website: { status: 'alive', detail: 'smiledental.com is up (200)', checkedAt: '2026-07-01T00:00:00.000Z', source: 'crawl' } },
      },
      place: { ...PLACE, websiteUri: hostile },
      match: null,
      websiteUrl: hostile,
      liveness: { status: 'unknown', detail: 'smiledental.com points at a private network address — not checked', finalUrl: null, httpStatus: null, cause: 'policy' },
      listing: 'matched',
    }))
    mockPageFetches()
    const r = await runEnrichment()
    expect(r).toMatchObject({ enriched: 1, crawls: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
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

// ── P-04: fit and freshness in the enrich pass ──────────────────────────────

describe('P-04 in the enrich pass', () => {
  it('a disqualified practice (closed, retired, a chain) frees a cold caller’s slot', async () => {
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found({ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' }))
    await runEnrichment()
    expect(releaseMock).toHaveBeenCalledWith('pros_1', expect.any(Date))
  })

  it('a robots.txt refusal is UNKNOWN (stack null), never "looked, no booking engine": no +6, stored as an UNREAD crawl, and the AI is NOT asked about a page nobody read — no verdict from the stub’s zeros (I.1 / C8, W4)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/robots.txt')) return { ok: true, body: bodyStream('User-agent: *\nDisallow: /'), text: async () => 'User-agent: *\nDisallow: /', url } as unknown as Response
      throw new Error(`the page must not be fetched: ${u}`)
    })
    aiMock.mockResolvedValue({ websiteQuality: 20, websiteReasons: [], socialPresence: 0, onlineBooking: false, weaknesses: [], summary: 'x' })
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    const r = await runEnrichment()
    expect(r.enriched).toBe(1)
    const final = state.updates.find((u) => u.values.enrichment)!.values
    expect((final.enrichment as { stack: unknown; error: string }).stack).toBeNull()
    expect((final.enrichment as { error: string }).error).toBe('robots_disallow')
    expect(final.scoreReasons as string[]).not.toContain('No booking widget, no review engine — a phone number is their only door')
    // W4: the robots stub is not a read page — no AI call, and the stored
    // verdict carries none of the stub's zeros as weaknesses.
    expect(aiMock).not.toHaveBeenCalled()
    const verdict = final.aiVerdict as { hasWebsite: boolean; websiteRead?: boolean; weaknesses: string[]; websiteReasons: string[]; summary: string }
    expect(verdict.weaknesses).toEqual([])
    expect(verdict.websiteReasons).toEqual([])
    // X1: an UNREAD verdict — the practice has a site, its quality is unknown.
    expect(verdict).toMatchObject({ hasWebsite: true, websiteRead: false, summary: 'Website not read.' })
    expect(final.scoreReasons as string[]).not.toContain('Not mobile-friendly')
    expect(final.scoreReasons as string[]).toContain('Website not read — quality unknown')
    expect(final.scoreReasons as string[]).not.toContain('No website at all — needs everything we sell')
    expect(final.opportunityScore).toBeLessThan(90)
    expect(final.scoreBand).not.toBe('hot')
  })

  it('V13: a page that does not answer is stored as an UNREAD crawl (stack null, error fetch_failed) — the card can say why; no AI call, no verdict from a page nobody read, no +6', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/robots.txt')) return { ok: true, body: bodyStream('User-agent: *\nAllow: /'), text: async () => 'User-agent: *\nAllow: /', url } as unknown as Response
      throw new Error('ECONNRESET')
    })
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    const r = await runEnrichment()
    quiet.mockRestore()
    expect(r.enriched).toBe(1)
    const final = state.updates.find((u) => u.values.enrichment)!.values
    const enrichment = final.enrichment as { stack: unknown; error: string; builder: unknown; fetchedAt: string; ssl: boolean }
    expect(enrichment.stack).toBeNull()
    expect(enrichment.error).toBe('fetch_failed')
    expect(enrichment.builder).toBeNull()
    expect(enrichment.ssl).toBe(true)
    expect(typeof enrichment.fetchedAt).toBe('string')
    expect(aiMock).not.toHaveBeenCalled()
    expect(final.scoreReasons as string[]).not.toContain('No booking widget, no review engine — a phone number is their only door')
    // W4: the stored verdict carries none of the stub's zeros.
    expect((final.aiVerdict as { weaknesses: string[] }).weaknesses).toEqual([])
    expect(final.scoreReasons as string[]).not.toContain('Not mobile-friendly')
    // X1: a fetch failure with a URL is an UNREAD verdict, never "no website" at 92.
    expect(final.aiVerdict).toMatchObject({ hasWebsite: true, websiteRead: false, summary: 'Website not read.' })
    expect(final.scoreReasons as string[]).toContain('Website not read — quality unknown')
    expect(final.scoreReasons as string[]).not.toContain('No website at all — needs everything we sell')
    expect(final.opportunityScore).toBeLessThan(90)
    expect(unreadCrawlSignals('https://smiledental.com', 'fetch_failed', new Date('2026-11-10T12:00:00Z'))).toMatchObject({ stack: null, error: 'fetch_failed', fetchedAt: '2026-11-10T12:00:00.000Z', ssl: true })
    expect(unreadCrawlSignals('http://smiledental.com', 'robots_disallow').ssl).toBe(false)
  })

  it('the crawl fingerprints the competitor stack across the hops and the score names it', async () => {
    const STACKED = `<!doctype html><html><head><title>Smile Dental</title>
      <meta name="viewport" content="width=device-width">
      <script src="https://widget.nexhealth.com/book.js"></script></head>
      <body><a href="/contact">contact</a>© 2026</body></html>`
    const CONTACT = `<html><body><iframe src="https://birdeye.com/widget/1"></iframe></body></html>`
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/robots.txt')) return { ok: true, text: async () => 'User-agent: *\nAllow: /', url } as Response
      const html = u.includes('/contact') ? CONTACT : STACKED
      return { ok: true, body: bodyStream(html), text: async () => html, url: u } as unknown as Response
    })
    state.selectQueue.push([PROSPECT])
    placeMock.mockResolvedValue(found(PLACE))
    const r = await runEnrichment()
    expect(r.enriched).toBe(1)
    const final = state.updates.find((u) => u.values.enrichment)!.values
    expect((final.enrichment as { stack: string[] }).stack).toEqual(['NexHealth', 'Birdeye'])
    expect(final.scoreReasons as string[]).toContain('Already on NexHealth + Birdeye')
  })
})
