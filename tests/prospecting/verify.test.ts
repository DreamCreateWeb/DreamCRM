import { describe, it, expect, vi, beforeEach } from 'vitest'
// The cold-caller release hook (P-02) rides every unservable flip; it is its
// own module with its own tests — here it is a spy, so the counts below
// stay the writer's own statements.
vi.mock('@/lib/services/prospect-caller-release', () => ({ releaseIfUnservable: vi.fn(async () => false) }))

/**
 * PROSPECT VERIFICATION (P-01) — the orchestrator: every signal with its
 * source, the match that is never taken blind, the disqualifying zeros,
 * the parked states, caller verdicts that outrank every database, the
 * once-a-run engine strikes, the budgets, and the sweep's selection.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ values: Record<string, unknown> }>,
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
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ values })
          },
        }),
      }),
    },
    schema: { prospect: new Proxy({}, { get: (_t, k) => String(k) }) },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}))

const { lookupNpiMock, sizeMock, candidatesMock, placesConfiguredMock, livenessMock, driverMock, lineMock, strikeMock, configMock, counterMock, bumpMock, stopMock, pauseMock, resumeMock, clearFollowUpMock } =
  vi.hoisted(() => ({
    lookupNpiMock: vi.fn(),
    // The practice-size search (P-04) — one dentist at the address unless a
    // test says otherwise.
    sizeMock: vi.fn(async (_i: unknown) => ({ dentists: 1, scanned: 12, capped: false })),
    candidatesMock: vi.fn(),
    placesConfiguredMock: vi.fn(() => true),
    livenessMock: vi.fn(),
    driverMock: vi.fn(() => 'none' as 'none' | 'aws'),
    lineMock: vi.fn(),
    strikeMock: vi.fn(async (_cls: string, _at?: Date) => true),
    configMock: vi.fn(),
    counterMock: vi.fn(async () => 0),
    bumpMock: vi.fn(async (period: string, kind: string) => {
      state.counters.push({ period, kind })
    }),
    stopMock: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
    pauseMock: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
    resumeMock: vi.fn(async (_id: string, _now?: Date) => {}),
    clearFollowUpMock: vi.fn(async (_id: string, _now?: Date) => {}),
  }))
vi.mock('@/lib/nppes', () => ({ lookupNpi: lookupNpiMock, searchDentistsAtAddress: sizeMock }))
vi.mock('@/lib/google-places', () => ({ findDentalPlaceCandidates: candidatesMock, placesConfigured: placesConfiguredMock }))
vi.mock('@/lib/services/prospect-site-liveness', () => ({ checkSiteLiveness: livenessMock }))
vi.mock('@/lib/services/phone-validate', () => ({ phoneValidateDriver: driverMock, validatePhoneLine: lineMock }))
vi.mock('@/lib/services/engine-failures', () => ({ reportProspectingFailure: strikeMock }))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-11',
  stopActiveEnrollments: stopMock,
  pauseActiveEnrollments: pauseMock,
  resumeVerifyPausedEnrollments: resumeMock,
  clearSystemFollowUp: clearFollowUpMock,
}))

import {
  verifyProspectSignals,
  verifyProspect,
  runVerificationSweep,
  newVerifyRunCtx,
  closeVerifyRun,
  listingColumns,
  outreachStopReason,
  outreachPauseReason,
  applyOutreachHold,
  websiteCameFromPlaces,
  NPPES_PER_RUN,
  FIT_NPPES_PER_RUN,
  phoneStanding,
} from '@/lib/services/prospect-verify'
import { PROSPECTING_DEFAULTS, parseVerification, siteGoneWasRead } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false }

const PROSPECT = {
  id: 'pros_1',
  name: 'Smile Dental PC',
  npiNumber: '1234567890',
  addressLine1: '123 Main St',
  city: 'Atlanta',
  state: 'GA',
  postalCode: '30309',
  phone: '4045551212',
  phoneSource: 'nppes',
  phoneStatus: null,
  websiteUrl: null,
  verification: null,
  status: 'enriched',
}
const PLACE = {
  placeId: 'place_1',
  displayName: 'Smile Dental',
  formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
  nationalPhoneNumber: '4045551212',
  websiteUri: 'https://smiledental.com',
  ratingTenths: 47,
  reviewCount: 22,
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/x',
  // P-04 liveness fields: no dated review in the fixture (the P-01 count
  // rule applies), hours stated.
  latestReviewAt: null,
  hasOpeningHours: true,
}
const NPI_ACTIVE = {
  found: true,
  status: 'active',
  deactivationDate: null,
  enumerationType: 'NPI-2',
  enumerationDate: '2010-05-05',
  organizationName: 'SMILE DENTAL PC',
  location: { addressLine1: '123 Main St', city: 'Atlanta', state: 'GA', postalCode: '30309', phone: '4045551212' },
}

async function ctx() {
  return newVerifyRunCtx(LIVE, NOW)
}

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.counters = []
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE)
  counterMock.mockResolvedValue(0)
  lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
  candidatesMock.mockResolvedValue({ ok: true, places: [PLACE] })
  livenessMock.mockResolvedValue({ status: 'alive', detail: 'smiledental.com is up (200)', finalUrl: 'https://smiledental.com/', httpStatus: 200 })
  driverMock.mockReturnValue('none')
  placesConfiguredMock.mockReturnValue(true)
  // One dentist at the address unless a test says otherwise — reset every
  // time, so a test's own answer never leaks into the next.
  sizeMock.mockReset()
  sizeMock.mockResolvedValue({ dentists: 1, scanned: 12, capped: false })
})

describe('verifyProspectSignals — the happy path', () => {
  it('matches the listing, reads every signal with a source + UTC stamp, scores best', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.place?.placeId).toBe('place_1')
    const v = out.patch.verification
    expect(v.places).toMatchObject({ status: 'matched', source: 'places', checkedAt: NOW.toISOString() })
    expect(v.business?.status).toBe('open')
    expect(v.npi?.status).toBe('active')
    expect(v.website).toMatchObject({ status: 'alive', source: 'crawl' })
    expect(v.phone).toMatchObject({ status: 'well_formed', source: 'nanp' })
    // The two-source rule (P-04): the registry and the listing agree on the
    // number — corroborated, 20. 35 + 20 + 15 + 10 + 10 = 90
    expect(v.phone).toMatchObject({ sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' })
    expect(out.patch.phoneSource).toBe('corroborated')
    expect(out.patch.qualityScore).toBe(90)
    expect(out.patch.qualityBand).toBe('best')
    expect(out.patch.verifiedAt).toEqual(NOW)
    expect(out.patch.status).toBeUndefined()
  })

  it('a matched listing with a different phone replaces the registry number (stated by the listing only — single source) and keeps the old one in the detail', async () => {
    const out = await verifyProspectSignals(
      PROSPECT as never,
      { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] },
      await ctx(),
    )
    expect(out.place).toBeTruthy()
    expect(out.patch.phone).toBe('4045559999')
    expect(out.patch.phoneSource).toBe('single_source')
    expect(out.patch.verification.phone).toMatchObject({ sources: ['places'], standing: 'single_source' })
    expect(out.patch.verification.phone?.detail).toMatch(/\(404\) 555-9999.*\(404\) 555-1212/)
    // One voice, the line check off: the card says what to do about it.
    expect(out.patch.qualityReasons).toContain('Only one source lists this number — turn on the line check to confirm it')
  })

  it('NO MATCH copies nothing from the candidate — the retired-practice-wearing-live-data bug', async () => {
    const stranger = { ...PLACE, displayName: 'Bright Orthodontics', formattedAddress: '9 Elsewhere Rd, Macon, GA 31201, USA', nationalPhoneNumber: '4785550000' }
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [stranger] }, await ctx())
    expect(out.place).toBeNull()
    expect(out.websiteUrl).toBeNull()
    expect(out.patch.verification.places).toMatchObject({ status: 'no_match' })
    expect(out.patch.verification.places?.detail).toContain('Bright Orthodontics')
    expect(out.patch.verification.website?.status).toBe('unknown')
    expect(out.patch.phone).toBe('4045551212') // the stranger's phone is NOT taken
    // 12 (format only) + 15 (NPI) = 27: parked until a re-verify or a human
    // confirms the listing — an unconfirmed practice is never served.
    expect(out.patch.qualityScore).toBe(27)
    expect(out.patch.qualityBand).toBe('parked')
    expect(livenessMock).not.toHaveBeenCalled()
  })
})

describe('the disqualifying zeros and the parked states', () => {
  it('a deactivated NPI is retired — disqualified with the deactivation date', async () => {
    lookupNpiMock.mockResolvedValue({ found: true, status: 'deactivated', deactivationDate: '2024-03-01', location: null })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'retired', qualityScore: 0, qualityBand: 'parked' })
    expect(out.patch.verification.npi?.detail).toContain('2024-03-01')
  })
  it('an NPI gone from the registry is retired too', async () => {
    lookupNpiMock.mockResolvedValue({ found: false, status: null, deactivationDate: null, location: null })
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(out.patch.status).toBe('disqualified')
    expect(out.patch.suppressedReason).toBe('retired')
  })
  it('permanently closed on Google disqualifies with reason closed', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, businessStatus: 'CLOSED_PERMANENTLY' }] }, await ctx())
    expect(out.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'closed', qualityScore: 0 })
  })
  it('temporarily closed is parked, not disqualified, with the 30-day promise', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, businessStatus: 'CLOSED_TEMPORARILY' }] }, await ctx())
    expect(out.patch.status).toBeUndefined()
    expect(out.patch.qualityBand).toBe('parked')
    expect(out.patch.qualityReasons[0]).toMatch(/temporarily closed.*30 days/)
  })
  it('a dead website parks the record — it is NOT "no website"; the probe’s CAUSE is stored on the signal (Y1): dns is gone, a double timeout read nothing', async () => {
    livenessMock.mockResolvedValue({ status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', finalUrl: null, httpStatus: null, cause: 'dns' })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.qualityBand).toBe('parked')
    expect(out.patch.qualityReasons).toEqual(['smiledental.com no longer resolves (DNS)'])
    expect(out.websiteUrl).toBe('https://smiledental.com')
    expect(out.patch.verification.website).toEqual({ status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: NOW.toISOString(), source: 'crawl', cause: 'dns' })
    expect(siteGoneWasRead(out.patch.verification.website)).toBe(true)
    // A double timeout: the same parked quality (P-01 as built), but the
    // signal says nothing was read — the opportunity verdict reads it as unread.
    livenessMock.mockResolvedValue({ status: 'dead', detail: 'smiledental.com timed out twice (6s)', finalUrl: null, httpStatus: null, cause: 'timeout' })
    const slow = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(slow.patch.qualityBand).toBe('parked')
    expect(slow.patch.verification.website).toMatchObject({ status: 'dead', cause: 'timeout' })
    expect(siteGoneWasRead(slow.patch.verification.website)).toBe(false)
    // The stored JSON reads the cause back; a signal without one reads as gone, as it did.
    const stored = parseVerification(JSON.parse(JSON.stringify(slow.patch.verification)))
    expect(stored.website).toMatchObject({ status: 'dead', cause: 'timeout' })
    expect(siteGoneWasRead(stored.website)).toBe(false)
    expect(siteGoneWasRead({ status: 'dead', detail: null, checkedAt: STAMP, source: 'crawl' })).toBe(true)
    // Z2: a cause-less legacy dead whose detail is the probe's own "timed out twice" read nothing; every other legacy detail is gone; a stored cause wins over the detail.
    expect(siteGoneWasRead({ status: 'dead', detail: 'smiledental.com timed out twice (6s)', checkedAt: STAMP, source: 'crawl' })).toBe(false)
    expect(siteGoneWasRead({ status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', checkedAt: STAMP, source: 'crawl' })).toBe(true)
    expect(siteGoneWasRead({ status: 'dead', detail: 'smiledental.com refused the connection', checkedAt: STAMP, source: 'crawl' })).toBe(true)
    expect(siteGoneWasRead({ status: 'dead', detail: 'smiledental.com timed out twice (6s)', checkedAt: STAMP, source: 'crawl', cause: 'http' })).toBe(true)
    expect(siteGoneWasRead({ status: 'dead', detail: 'smiledental.com answers with a server error (503)', checkedAt: STAMP, source: 'crawl', cause: 'timeout' })).toBe(false)
    expect(siteGoneWasRead({ status: 'parked', detail: null, checkedAt: STAMP, source: 'crawl', cause: 'parked' })).toBe(true)
    expect(siteGoneWasRead({ status: 'alive', detail: null, checkedAt: STAMP, source: 'crawl' })).toBe(false)
    expect(siteGoneWasRead(undefined)).toBe(false)
    livenessMock.mockResolvedValue({ status: 'alive', detail: 'smiledental.com is up (200)', finalUrl: 'https://smiledental.com/', httpStatus: 200 })
    const up = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(up.patch.verification.website).not.toHaveProperty('cause')
  })
  it('a moved practice location refreshes the address and the registry phone', async () => {
    lookupNpiMock.mockResolvedValue({
      ...NPI_ACTIVE,
      location: { addressLine1: '500 New Rd', city: 'Decatur', state: 'GA', postalCode: '30030', phone: '4045557777' },
    })
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(out.patch).toMatchObject({ addressLine1: '500 New Rd', city: 'Decatur', postalCode: '30030', phone: '4045557777', phoneSource: 'single_source' })
    expect(out.patch.verification.phone).toMatchObject({ sources: ['nppes'], standing: 'single_source' })
    expect(out.patch.verification.npi?.detail).toMatch(/location changed/)
  })
})

describe('the phone', () => {
  it('a malformed number is invalid before any paid check', async () => {
    driverMock.mockReturnValue('aws')
    const out = await verifyProspectSignals({ ...PROSPECT, phone: '4045550100' } as never, null, await ctx())
    expect(out.patch.phoneStatus).toBe('invalid')
    expect(out.patch.verification.phone?.detail).toMatch(/fiction/)
    expect(lineMock).not.toHaveBeenCalled()
    expect(out.patch.qualityScore).toBe(0)
  })
  it('with the aws driver, a valid line is metered and scored in full', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: 'landline', invalid: false, carrier: 'AT&T', provider: 'aws_pinpoint' })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch).toMatchObject({ phoneStatus: 'valid', phoneLineType: 'landline', phoneValidatedAt: NOW })
    expect(state.counters).toEqual([{ period: '2026-11', kind: 'phone_validate' }])
    expect(out.patch.qualityScore).toBe(95)
  })
  it('the provider saying INVALID is invalid', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: null, invalid: true, carrier: null, provider: 'aws_pinpoint' })
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(out.patch.phoneStatus).toBe('invalid')
    expect(out.patch.verification.phone?.source).toBe('aws_pinpoint')
  })
  it('an auth refusal fails OPEN: well-formed credit, ONE strike for the run', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: false, error: 'auth' })
    const c = await ctx()
    const a = await verifyProspectSignals(PROSPECT as never, null, c)
    const b = await verifyProspectSignals({ ...PROSPECT, id: 'pros_2' } as never, null, c)
    expect(a.patch.verification.phone?.status).toBe('well_formed')
    expect(a.patch.verification.phone?.detail).toMatch(/AWS refused/)
    expect(b.patch.phoneStatus).toBe('unknown')
    expect(strikeMock).toHaveBeenCalledTimes(1)
    expect(strikeMock).toHaveBeenCalledWith('phone_validate_auth', NOW)
    expect(state.counters.filter((x) => x.kind === 'phone_validate')).toHaveLength(0)
  })
  it('the monthly line-check budget is honoured', async () => {
    driverMock.mockReturnValue('aws')
    counterMock.mockResolvedValue(LIVE.budgets.phoneValidatePerMonth)
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(lineMock).not.toHaveBeenCalled()
    expect(out.patch.verification.phone?.detail).toMatch(/used up/)
  })
  it('what the caller heard outranks the carrier: a disconnected verdict survives a re-verify of the same number', async () => {
    driverMock.mockReturnValue('aws')
    const prior = {
      phone: { status: 'disconnected', detail: 'Number disconnected on Nov 9, 2026 (heard on a call)', checkedAt: '2026-11-09T10:00:00.000Z', source: 'caller' },
    }
    const out = await verifyProspectSignals({ ...PROSPECT, phoneStatus: 'disconnected', verification: prior } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(lineMock).not.toHaveBeenCalled()
    expect(out.patch.phoneStatus).toBe('disconnected')
    expect(out.patch.verification.phone).toEqual(prior.phone)
    expect(out.patch.qualityScore).toBe(0)
  })
  it('a reach signal from a call survives every re-verify', async () => {
    const prior = { reach: { status: 'reached', detail: 'Someone picked up', checkedAt: '2026-11-09T10:00:00.000Z', source: 'caller' } }
    const out = await verifyProspectSignals({ ...PROSPECT, verification: prior } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.verification.reach).toEqual(prior.reach)
    expect(out.patch.qualityScore).toBe(95)
  })
})

describe('engine strikes — once a run, per class, never a blocked pass', () => {
  it('NPPES down → nppes_down once; the NPI signal stays honest', async () => {
    lookupNpiMock.mockRejectedValue(new Error('NPPES 503'))
    const c = await ctx()
    const a = await verifyProspectSignals(PROSPECT as never, null, c)
    await verifyProspectSignals({ ...PROSPECT, id: 'pros_2' } as never, null, c)
    expect(a.patch.verification.npi?.status).toBe('unknown')
    expect(strikeMock).toHaveBeenCalledTimes(1)
    expect(strikeMock).toHaveBeenCalledWith('nppes_down', NOW)
  })
  it('a refused Places key → places_auth once', async () => {
    const c = await ctx()
    await verifyProspectSignals(PROSPECT as never, { ok: false, error: 'auth' }, c)
    await verifyProspectSignals(PROSPECT as never, { ok: false, error: 'auth' }, c)
    expect(strikeMock).toHaveBeenCalledTimes(1)
    expect(strikeMock.mock.calls[0][0]).toBe('places_auth')
  })
  it('crawl_blocked only when EVERY liveness check in a run died at the network layer (≥5)', async () => {
    const c = await ctx()
    c.liveness = { checks: 5, networkDead: 5 }
    await closeVerifyRun(c)
    expect(strikeMock).toHaveBeenCalledWith('crawl_blocked', NOW)
    const d = await ctx()
    d.liveness = { checks: 5, networkDead: 4 }
    await closeVerifyRun(d)
    const e = await ctx()
    e.liveness = { checks: 2, networkDead: 2 }
    await closeVerifyRun(e)
    expect(strikeMock).toHaveBeenCalledTimes(1)
  })
  it('the NPPES per-run cap keeps the prior signal instead of guessing', async () => {
    const c = await ctx()
    c.nppesLeft = 0
    const out = await verifyProspectSignals(PROSPECT as never, null, c)
    expect(lookupNpiMock).not.toHaveBeenCalled()
    expect(out.patch.verification.npi?.status).toBe('unknown')
    expect(NPPES_PER_RUN).toBe(50)
  })
})

describe('verifyProspect (standalone) + the sweep', () => {
  it('looks the listing up (metered), verifies, writes the matched listing’s reputation + the patch', async () => {
    state.selectQueue.push([PROSPECT])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(r).toMatchObject({ ok: true, qualityBand: 'best', placesLookedUp: true })
    expect(state.counters).toContainEqual({ period: '2026-11', kind: 'places_lookup' })
    const w = state.updates.at(-1)!.values
    expect(w).toMatchObject({ googlePlaceId: 'place_1', reviewCount: 22, websiteUrl: 'https://smiledental.com', qualityScore: 90, verifiedAt: NOW })
  })
  it('refuses a converted prospect, a merged duplicate (P-03) and an unknown id', async () => {
    state.selectQueue.push([{ ...PROSPECT, status: 'converted' }])
    expect(await verifyProspect('pros_1')).toEqual({ ok: false, reason: 'already_converted' })
    state.selectQueue.push([{ ...PROSPECT, status: 'merged' }])
    expect(await verifyProspect('pros_1')).toEqual({ ok: false, reason: 'merged' })
    expect(state.updates).toHaveLength(0)
    state.selectQueue.push([])
    expect(await verifyProspect('nope')).toEqual({ ok: false, reason: 'not_found' })
  })
  it('a used-up Places budget still runs the free signals, without a lookup', async () => {
    counterMock.mockResolvedValue(LIVE.budgets.placesPerMonth)
    state.selectQueue.push([PROSPECT])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(r).toMatchObject({ ok: true, placesLookedUp: false })
    expect(candidatesMock).not.toHaveBeenCalled()
    expect(state.updates.at(-1)!.values).toMatchObject({ verifiedAt: NOW })
  })
  it('a changed fit read RESCORES the opportunity the row already carries (H.3): a group practice found by the sweep drops it by 10 and the band follows; an unchanged read writes nothing; a never-enriched row nothing', async () => {
    const verdict = { hasWebsite: true, websiteQuality: 50, websiteReasons: [], socialPresence: 10, onlineBooking: false, weaknesses: [], summary: 'ok' }
    const scored = {
      ...PROSPECT,
      opportunityScore: 64,
      scoreBand: 'warm',
      scoreReasons: [],
      aiVerdict: verdict,
      enrichment: { stack: null, builder: null },
      googleRatingTenths: 47,
      reviewCount: 40,
      verification: { fit: { size: { status: 'solo', detail: null, checkedAt: '2026-01-01T00:00:00.000Z', source: 'nppes', dentists: 1 } } },
    }
    sizeMock.mockResolvedValue({ dentists: 6, scanned: 90, capped: false })
    state.selectQueue.push([scored])
    await verifyProspect('pros_1', { now: NOW })
    const w = state.updates.at(-1)!.values
    // 30 + 4 + 14 + 10 + 6 (22 reviews on the matched listing) = 64 warm → a group −10 = 54 cool.
    expect(w).toMatchObject({ opportunityScore: 54, scoreBand: 'cool', scoredAt: NOW })
    expect(w.scoreReasons as string[]).toContain('A group practice — lower priority, not a chain')
    // The same read again (the size still group, the practice still established): nothing rewritten.
    state.updates = []
    const unchanged = {
      fit: {
        size: { ...scored.verification.fit.size, status: 'group', dentists: 6 },
        newPractice: { status: 'established', detail: null, checkedAt: '2026-01-01T00:00:00.000Z', source: 'nppes', enumeratedAt: '2010-05-05' },
      },
    }
    state.selectQueue.push([{ ...scored, verification: unchanged }])
    await verifyProspect('pros_1', { now: NOW })
    expect(state.updates.at(-1)!.values).not.toHaveProperty('opportunityScore')
    // A row never enriched (no verdict) is never scored by a verify.
    state.updates = []
    state.selectQueue.push([{ ...scored, opportunityScore: null, aiVerdict: null }])
    await verifyProspect('pros_1', { now: NOW })
    expect(state.updates.at(-1)!.values).not.toHaveProperty('opportunityScore')
  })
  it('the sweep: kill switch skips; otherwise never-verified first, then stale, batch-capped', async () => {
    configMock.mockResolvedValue({ ...LIVE, killSwitch: true })
    expect((await runVerificationSweep({ now: NOW })).skipped).toBe('kill_switch')

    configMock.mockResolvedValue(LIVE)
    state.selectQueue.push([{ id: 'pros_1' }]) // never verified
    state.selectQueue.push([{ id: 'pros_9' }]) // stale
    state.selectQueue.push([]) // resting rows (P-03) — only when room is left
    state.selectQueue.push([PROSPECT]) // verifyProspect(pros_1) row
    state.selectQueue.push([{ ...PROSPECT, id: 'pros_9' }]) // verifyProspect(pros_9) row
    const r = await runVerificationSweep({ now: NOW })
    expect(r).toMatchObject({ scanned: 2, verified: 2, errors: 0, placesLookups: 2 })
    expect(state.updates).toHaveLength(2)
  })
})

// ── The fix pass ─────────────────────────────────────────────────────────────

const STAMP = '2026-09-01T00:00:00.000Z'
const sigAt = (status: string, source: string, detail = status) => ({ status, detail, checkedAt: STAMP, source })
/** A row verified 70 days ago at 82 / best, with the listing facts stored. */
const VERIFIED = {
  ...PROSPECT,
  websiteUrl: 'https://smiledental.com',
  businessStatus: 'OPERATIONAL',
  reviewCount: 22,
  googlePlaceId: 'place_1',
  verification: {
    places: sigAt('matched', 'places', 'Matched "Smile Dental" (phone matches)'),
    business: sigAt('open', 'places', 'Google lists it as open'),
    npi: sigAt('active', 'nppes', 'NPI active'),
    website: sigAt('alive', 'crawl', 'smiledental.com is up (200)'),
    phone: sigAt('well_formed', 'nanp', 'Well-formed US number — the line check is off'),
  },
}

describe('a check that could not run keeps the prior signal — never a demotion from "unchecked" (C1/C2/C8)', () => {
  it('Places 503 on a re-verify: the matched + open signals and the stored reviews stand; the score does not move', async () => {
    const out = await verifyProspectSignals(VERIFIED as never, { ok: false, error: 'unavailable' }, await ctx())
    expect(out.patch.verification.places).toEqual(VERIFIED.verification.places)
    expect(out.patch.verification.business).toEqual(VERIFIED.verification.business)
    expect(out.listing).toBe('kept')
    // 35 + 12 + 15 + 10 + 10 — exactly what it was.
    expect(out.patch.qualityScore).toBe(82)
    expect(out.patch.qualityBand).toBe('best')
    expect(strikeMock).not.toHaveBeenCalled()
  })

  it('a refused key keeps the signals the same way — and strikes once', async () => {
    const out = await verifyProspectSignals(VERIFIED as never, { ok: false, error: 'auth' }, await ctx())
    expect(out.patch.verification.places?.status).toBe('matched')
    expect(out.patch.qualityScore).toBe(82)
    expect(strikeMock).toHaveBeenCalledWith('places_auth', NOW)
  })

  it('with no prior signal and no lookup the record says unchecked — nothing invented either way', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: false, error: 'not_configured' }, await ctx())
    expect(out.patch.verification.places).toMatchObject({ status: 'unchecked', detail: 'Google Places is not configured' })
    expect(out.patch.verification.business?.status).toBe('unknown')
    expect(out.listing).toBe('kept')
  })

  it('a re-verify without a lookup never un-parks a temporarily closed listing', async () => {
    const parked = {
      ...VERIFIED,
      businessStatus: 'CLOSED_TEMPORARILY',
      verification: { ...VERIFIED.verification, business: sigAt('temporarily_closed', 'places') },
    }
    counterMock.mockResolvedValue(LIVE.budgets.placesPerMonth) // this month's Places budget is gone
    state.selectQueue.push([parked])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(candidatesMock).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, placesLookedUp: false, qualityScore: 0, qualityBand: 'parked' })
    const w = state.updates.at(-1)!.values
    expect(w).not.toHaveProperty('businessStatus') // kept, not nulled
    expect((w.verification as { business: { status: string } }).business.status).toBe('temporarily_closed')
    expect((w.qualityReasons as string[])[0]).toMatch(/temporarily closed/)
  })

  it('no Places key: the standalone verify + the sweep skip the lookup exactly as the enrich pass does', async () => {
    placesConfiguredMock.mockReturnValue(false)
    state.selectQueue.push([VERIFIED])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(candidatesMock).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, placesLookedUp: false, qualityScore: 82, qualityBand: 'best' })
    expect(state.counters.filter((c) => c.kind === 'places_lookup')).toHaveLength(0)
    expect(state.updates.at(-1)!.values).not.toHaveProperty('googlePlaceId')
  })
})

describe('a listing Google no longer stands behind is cleared off the row (C4/C10/C17)', () => {
  const stranger = { ...PLACE, placeId: 'place_x', displayName: 'Bright Orthodontics', formattedAddress: '9 Elsewhere Rd, Macon, GA 31201, USA', nationalPhoneNumber: '4785550000' }

  it('no_match nulls the old listing’s columns — AND the listing’s website (C10): the stranger’s site is neither probed, credited nor kept', async () => {
    // A pre-P-01 row discovered from NPPES whose blind places[0] copy wrote
    // brightortho.com (the stranger's): no websiteSource, an NPI.
    const stale = {
      ...VERIFIED,
      websiteUrl: 'https://brightortho.com',
      businessStatus: 'CLOSED_TEMPORARILY',
      googlePlaceId: 'place_x',
      reviewCount: 212,
      googleRatingTenths: 48,
    }
    candidatesMock.mockResolvedValue({ ok: true, places: [stranger] })
    state.selectQueue.push([stale])
    const r = await verifyProspect('pros_1', { now: NOW })
    const w = state.updates.at(-1)!.values
    expect(w).toMatchObject({ googlePlaceId: null, googleRatingTenths: null, reviewCount: null, businessStatus: null, googleMapsUri: null })
    expect((w.qualityReasons as string[]).join(' ')).not.toMatch(/temporarily closed/)
    expect((w.qualityReasons as string[]).join(' ')).not.toMatch(/212/)
    expect(w.websiteUrl).toBeNull()
    expect(w.websiteSource).toBeNull()
    expect(livenessMock).not.toHaveBeenCalled()
    expect((w.qualityReasons as string[]).join(' ')).not.toMatch(/Website is up/)
    expect(r).toMatchObject({ ok: true })
  })

  it('a website whose source is places goes with the listing; a typed one (source manual) stays and is judged', async () => {
    candidatesMock.mockResolvedValue({ ok: true, places: [stranger] })
    const fromPlaces = await verifyProspectSignals({ ...VERIFIED, websiteSource: 'places', npiNumber: null } as never, { ok: true, places: [stranger] }, await ctx())
    expect(fromPlaces.websiteUrl).toBeNull()
    expect(listingColumns(fromPlaces)).toMatchObject({ websiteUrl: null, websiteSource: null })

    livenessMock.mockClear()
    const typed = await verifyProspectSignals({ ...VERIFIED, websiteSource: 'manual' } as never, { ok: true, places: [stranger] }, await ctx())
    expect(typed.websiteUrl).toBe('https://smiledental.com')
    expect(listingColumns(typed)).toEqual({ googlePlaceId: null, googleRatingTenths: null, reviewCount: null, businessStatus: null, googleMapsUri: null, websiteUrl: 'https://smiledental.com' })
    expect(livenessMock).toHaveBeenCalledWith('https://smiledental.com')

    // The pure rule: the source column first; a legacy row's by its NPI.
    expect(websiteCameFromPlaces({ websiteSource: 'places', npiNumber: null })).toBe(true)
    expect(websiteCameFromPlaces({ websiteSource: 'manual', npiNumber: '1234567890' })).toBe(false)
    expect(websiteCameFromPlaces({ websiteSource: null, npiNumber: '1234567890' })).toBe(true)
    expect(websiteCameFromPlaces({ websiteSource: null, npiNumber: null })).toBe(false)
  })

  it('not_found clears them the same way (a typed website survives it)', async () => {
    const out = await verifyProspectSignals({ ...VERIFIED, websiteSource: 'manual', businessStatus: 'CLOSED_TEMPORARILY' } as never, { ok: true, places: [] }, await ctx())
    expect(out.listing).toBe('cleared')
    expect(listingColumns(out)).toEqual({ googlePlaceId: null, googleRatingTenths: null, reviewCount: null, businessStatus: null, googleMapsUri: null, websiteUrl: 'https://smiledental.com' })
    expect(out.patch.qualityReasons.join(' ')).not.toMatch(/temporarily closed/)
  })

  it('a matched listing with no website never nulls the one someone typed', async () => {
    const out = await verifyProspectSignals({ ...PROSPECT, websiteUrl: 'https://drjane.com', websiteSource: 'manual' } as never, { ok: true, places: [{ ...PLACE, websiteUri: null }] }, await ctx())
    expect(out.websiteUrl).toBe('https://drjane.com')
    expect(livenessMock).toHaveBeenCalledWith('https://drjane.com')
    expect(listingColumns(out).websiteUrl).toBe('https://drjane.com')
    expect(listingColumns(out)).not.toHaveProperty('websiteSource')
    expect(out.patch.verification.website?.status).toBe('alive')
  })

  it('a matched listing that states a website writes it with source places', async () => {
    const out = await verifyProspectSignals({ ...PROSPECT, websiteUrl: 'https://drjane.com', websiteSource: 'manual' } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(listingColumns(out)).toMatchObject({ websiteUrl: 'https://smiledental.com', websiteSource: 'places' })
  })

  it('a matched listing that states a website replaces the row’s', async () => {
    const out = await verifyProspectSignals({ ...PROSPECT, websiteUrl: 'https://drjane.com' } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.websiteUrl).toBe('https://smiledental.com')
    expect(listingColumns(out)).toMatchObject({ googlePlaceId: 'place_1', reviewCount: 22, businessStatus: 'OPERATIONAL', websiteUrl: 'https://smiledental.com' })
  })

  it('listingColumns: kept touches only the website', () => {
    expect(listingColumns({ place: null, listing: 'kept', websiteUrl: 'https://drjane.com' })).toEqual({ websiteUrl: 'https://drjane.com' })
  })
})

describe('the phone is NANP ten digits before any check (C5/C9/C16)', () => {
  it('an 11-digit stored number is checked — and stored — as ten', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: 'landline', invalid: false, carrier: null, provider: 'aws_pinpoint' })
    const out = await verifyProspectSignals({ ...PROSPECT, npiNumber: null, phone: '14045551212', phoneSource: 'caller' } as never, null, await ctx())
    expect(lineMock).toHaveBeenCalledWith('4045551212')
    expect(out.patch.phone).toBe('4045551212')
    expect(out.patch.phoneStatus).toBe('valid')
  })

  it('a caller’s disconnected verdict on the same number survives the normalization', async () => {
    driverMock.mockReturnValue('aws')
    const prior = { phone: { status: 'disconnected', detail: 'Number disconnected on Nov 9, 2026 (heard on a call)', checkedAt: STAMP, source: 'caller' } }
    const out = await verifyProspectSignals({ ...PROSPECT, phone: '14045551212', phoneSource: 'caller', phoneStatus: 'disconnected', verification: prior } as never, null, await ctx())
    expect(lineMock).not.toHaveBeenCalled()
    expect(out.patch.phone).toBe('4045551212')
    expect(out.patch.phoneStatus).toBe('disconnected')
  })

  it('a number a human reached stays valid — no paid check re-runs on it', async () => {
    driverMock.mockReturnValue('aws')
    const prior = { phone: { status: 'valid', detail: 'Reached on Nov 9, 2026 — the number works (heard on a call)', checkedAt: STAMP, source: 'caller' } }
    const out = await verifyProspectSignals({ ...PROSPECT, phoneStatus: 'valid', phoneSource: 'caller', verification: prior } as never, null, await ctx())
    expect(lineMock).not.toHaveBeenCalled()
    expect(out.patch.phoneStatus).toBe('valid')
    expect(out.patch.verification.phone).toEqual(prior.phone)
  })
})

describe('the website probe fails open (C21 + S1)', () => {
  it('an unknown liveness (resolver hiccup, redirect loop, private address) keeps the prior website signal and never counts toward crawl_blocked', async () => {
    livenessMock.mockResolvedValue({ status: 'unknown', detail: 'smiledental.com could not be resolved right now (EAI_AGAIN) — will check again', finalUrl: null, httpStatus: null })
    const c = await ctx()
    const out = await verifyProspectSignals(VERIFIED as never, { ok: true, places: [PLACE] }, c)
    expect(out.patch.verification.website).toEqual(VERIFIED.verification.website)
    expect(out.patch.qualityScore).toBe(90)
    expect(c.liveness).toEqual({ checks: 0, networkDead: 0 })
  })

  it('unknown with no prior is an honest unknown — not parked', async () => {
    livenessMock.mockResolvedValue({ status: 'unknown', detail: 'smiledental.com could not be resolved right now (EAI_AGAIN) — will check again', finalUrl: null, httpStatus: null })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.verification.website).toMatchObject({ status: 'unknown', source: 'crawl' })
    expect(out.patch.qualityBand).not.toBe('parked')
    expect(out.patch.qualityScore).toBe(80) // 35 + 20 (corroborated phone) + 15 + 10 reviews; no website credit either way
  })

  it('a crawl budget of zero pauses the probe — the one knob that pauses touching prospects’ sites', async () => {
    const c = await newVerifyRunCtx({ ...LIVE, budgets: { ...LIVE.budgets, crawlsPerMonth: 0 } }, NOW)
    const out = await verifyProspectSignals(VERIFIED as never, { ok: true, places: [PLACE] }, c)
    expect(livenessMock).not.toHaveBeenCalled()
    expect(out.patch.verification.website).toEqual(VERIFIED.verification.website)
    const fresh = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, c)
    expect(fresh.patch.verification.website).toMatchObject({ status: 'unknown', detail: expect.stringMatching(/paused/) })
  })
})

describe('the hold a pass puts on the drip (C7 / C15): gone STOPS, a reversible park PAUSES, a recovery RESUMES', () => {
  it('outreachStopReason is disqualification only; outreachPauseReason is the reversible park; a phone verdict alone is neither', () => {
    expect(outreachStopReason({ status: 'disqualified', suppressedReason: 'retired' })).toBe('verify_retired')
    expect(outreachStopReason({ status: 'disqualified', suppressedReason: 'closed' })).toBe('verify_closed')
    expect(outreachStopReason({})).toBeNull()
    expect(outreachPauseReason({ verification: { business: sigAt('temporarily_closed', 'places') } })).toBe('verify_temporarily_closed')
    expect(outreachPauseReason({ verification: { website: sigAt('dead', 'crawl') } })).toBe('verify_site_dead')
    expect(outreachPauseReason({ verification: { website: sigAt('parked', 'crawl') } })).toBe('verify_site_parked')
    expect(outreachPauseReason({ verification: { phone: sigAt('invalid', 'nanp'), website: sigAt('alive', 'crawl') } })).toBeNull()
    expect(outreachPauseReason({ verification: VERIFIED.verification })).toBeNull()
  })

  it('applyOutreachHold: stop + the system follow-up cleared · pause + cleared · resume (nothing cleared)', async () => {
    expect(await applyOutreachHold('pros_1', { status: 'disqualified', suppressedReason: 'retired', verification: {} }, NOW)).toBe('stop')
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_retired', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(pauseMock).not.toHaveBeenCalled()
    expect(resumeMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    expect(await applyOutreachHold('pros_1', { verification: { website: sigAt('dead', 'crawl') } }, NOW)).toBe('pause')
    expect(pauseMock).toHaveBeenCalledWith('pros_1', 'verify_site_dead', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(stopMock).not.toHaveBeenCalled()
    expect(resumeMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    expect(await applyOutreachHold('pros_1', { verification: VERIFIED.verification }, NOW)).toBe('resume')
    expect(resumeMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(stopMock).not.toHaveBeenCalled()
    expect(pauseMock).not.toHaveBeenCalled()
    expect(clearFollowUpMock).not.toHaveBeenCalled()
  })

  it('verifyProspect STOPS the enrollment of a retired practice, and a healthy pass only resumes', async () => {
    lookupNpiMock.mockResolvedValue({ found: true, status: 'deactivated', deactivationDate: '2024-03-01', location: null })
    state.selectQueue.push([{ ...VERIFIED, status: 'contacted' }])
    await verifyProspect('pros_1', { now: NOW })
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_retired', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)

    stopMock.mockClear()
    pauseMock.mockClear()
    resumeMock.mockClear()
    clearFollowUpMock.mockClear()
    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    state.selectQueue.push([VERIFIED])
    await verifyProspect('pros_1', { now: NOW })
    expect(stopMock).not.toHaveBeenCalled()
    expect(pauseMock).not.toHaveBeenCalled()
    expect(clearFollowUpMock).not.toHaveBeenCalled()
    expect(resumeMock).toHaveBeenCalledWith('pros_1', NOW)
  })

  it('a 503 at sweep time PAUSES the drip (never a permanent stop) and clears the no-answer follow-up; the recheck that finds the site back resumes it', async () => {
    // Prospect 'contacted', enrollment active at step 2, a no_answer
    // follow-up scheduled; the host answers 503 at sweep time.
    livenessMock.mockResolvedValue({ status: 'dead', detail: 'smiledental.com answers with a server error (503)', finalUrl: 'https://smiledental.com/', httpStatus: 503 })
    state.selectQueue.push([{ ...VERIFIED, status: 'contacted' }])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(r).toMatchObject({ ok: true, qualityBand: 'parked' })
    expect(pauseMock).toHaveBeenCalledWith('pros_1', 'verify_site_dead', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(stopMock).not.toHaveBeenCalled()

    // 30 days later the recheck finds the site alive: the drip resumes.
    vi.clearAllMocks()
    configMock.mockResolvedValue(LIVE)
    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    candidatesMock.mockResolvedValue({ ok: true, places: [PLACE] })
    livenessMock.mockResolvedValue({ status: 'alive', detail: 'smiledental.com is up (200)', finalUrl: 'https://smiledental.com/', httpStatus: 200 })
    placesConfiguredMock.mockReturnValue(true)
    const LATER = new Date('2026-12-10T12:00:00Z')
    state.selectQueue.push([{ ...VERIFIED, status: 'contacted', qualityScore: 0, qualityBand: 'parked' }])
    const r2 = await verifyProspect('pros_1', { now: LATER })
    expect(r2).toMatchObject({ ok: true, qualityBand: 'best' })
    expect(resumeMock).toHaveBeenCalledWith('pros_1', LATER)
    expect(pauseMock).not.toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('temporarily closed and a parked site pause the same way', async () => {
    candidatesMock.mockResolvedValue({ ok: true, places: [{ ...PLACE, businessStatus: 'CLOSED_TEMPORARILY' }] })
    state.selectQueue.push([{ ...VERIFIED, status: 'contacted' }])
    await verifyProspect('pros_1', { now: NOW })
    expect(pauseMock).toHaveBeenCalledWith('pros_1', 'verify_temporarily_closed', NOW)
    expect(stopMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    configMock.mockResolvedValue(LIVE)
    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    candidatesMock.mockResolvedValue({ ok: true, places: [PLACE] })
    placesConfiguredMock.mockReturnValue(true)
    livenessMock.mockResolvedValue({ status: 'parked', detail: 'smiledental.com now lands on hugedomains.com — a HugeDomains sale page', finalUrl: 'https://www.hugedomains.com/x', httpStatus: 200 })
    state.selectQueue.push([{ ...VERIFIED, status: 'contacted' }])
    await verifyProspect('pros_1', { now: NOW })
    expect(pauseMock).toHaveBeenCalledWith('pros_1', 'verify_site_parked', NOW)
    expect(clearFollowUpMock).toHaveBeenCalledWith('pros_1', NOW)
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('a policy refusal from the probe (a private address) keeps the prior signal, parks nothing and pauses nothing — the cause rides the outcome for the crawler', async () => {
    livenessMock.mockResolvedValue({ status: 'unknown', detail: 'smiledental.com points at a private network address — not checked', finalUrl: null, httpStatus: null, cause: 'policy' })
    const out = await verifyProspectSignals({ ...VERIFIED, status: 'contacted' } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.verification.website?.status).toBe('alive')
    expect(out.liveness?.cause).toBe('policy')
    expect(outreachPauseReason(out.patch)).toBeNull()
  })
})

// ── P-04: fit, liveness from the listing, the two-source rule ───────────────

describe('fit from the registry and the listing (P-04)', () => {
  it('the happy path reads the three fit signals: established, a solo dentist (one registry search), not on the DSO list', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    const fit = out.patch.verification.fit!
    expect(fit.newPractice).toMatchObject({ status: 'established', detail: 'In the registry since May 2010', enumeratedAt: '2010-05-05', source: 'nppes', checkedAt: NOW.toISOString() })
    expect(fit.size).toMatchObject({ status: 'solo', dentists: 1, official: 'unknown', detail: 'One dentist at this address in the registry' })
    expect(sizeMock).toHaveBeenCalledWith({ addressLine1: '123 Main St', addressLine2: null, state: 'GA', postalCode: '30309' })
    expect(fit.dso).toMatchObject({ status: 'none', source: 'dso_list' })
    expect(out.patch.status).toBeUndefined()
  })

  it('a practice enumerated inside 18 months is NEW — "Opened Jun 2025 — no website yet is normal; now is the moment"', async () => {
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, enumerationDate: '2025-06-15' })
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(out.patch.verification.fit?.newPractice).toMatchObject({ status: 'new', enumeratedAt: '2025-06-15', detail: 'Opened Jun 2025 — no website yet is normal; now is the moment' })
  })

  it('≥5 dentists at the address is a GROUP — deprioritised, never disqualified; an executive official corroborates', async () => {
    sizeMock.mockResolvedValue({ dentists: 6, scanned: 90, capped: false })
    const out = await verifyProspectSignals({ ...PROSPECT, authorizedOfficialTitle: 'Chief Executive Officer' } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.verification.fit?.size).toMatchObject({ status: 'group', dentists: 6, official: 'executive' })
    expect(out.patch.verification.fit?.size?.detail).toBe('A group practice — 6 dentists at this address in the registry — the registry official is an executive, not a dentist')
    expect(out.patch.status).toBeUndefined()
    expect(out.patch.qualityScore).toBe(90)
  })

  it('an individual NPI is a solo dentist without a search; the per-run cap and a fresh prior signal skip the search too', async () => {
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, enumerationType: 'NPI-1' })
    const solo = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(solo.patch.verification.fit?.size).toMatchObject({ status: 'solo', dentists: 1 })
    expect(sizeMock).not.toHaveBeenCalled()

    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    const c = await ctx()
    expect(FIT_NPPES_PER_RUN).toBe(50)
    c.fitNppesLeft = 0
    const capped = await verifyProspectSignals(PROSPECT as never, null, c)
    expect(sizeMock).not.toHaveBeenCalled()
    expect(capped.patch.verification.fit?.size).toBeUndefined()

    const fresh = { fit: { size: { status: 'small', detail: '3 dentists', checkedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), source: 'nppes', dentists: 3 } } }
    const kept = await verifyProspectSignals({ ...PROSPECT, verification: fresh } as never, null, await ctx())
    expect(sizeMock).not.toHaveBeenCalled()
    expect(kept.patch.verification.fit?.size).toMatchObject({ status: 'small', dentists: 3 })

    const old = { fit: { size: { ...fresh.fit.size, checkedAt: '2026-01-01T00:00:00.000Z' } } }
    await verifyProspectSignals({ ...PROSPECT, verification: old } as never, null, await ctx())
    expect(sizeMock).toHaveBeenCalledTimes(1)
  })

  it('a failed size search fails OPEN: an honest unknown marked for RETRY, one nppes_down strike, the score untouched — and the NEXT pass asks again whatever the 180-day clock says (H.1)', async () => {
    sizeMock.mockRejectedValue(new Error('NPPES 503'))
    const c = await ctx()
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, c)
    await verifyProspectSignals({ ...PROSPECT, id: 'pros_2' } as never, null, c)
    expect(out.patch.verification.fit?.size).toMatchObject({ status: 'unknown', dentists: null, retry: true })
    expect(out.patch.qualityScore).toBe(90)
    expect(strikeMock).toHaveBeenCalledTimes(1)
    expect(strikeMock).toHaveBeenCalledWith('nppes_down', NOW)
    // The next pass, a day later: the gate re-runs the search; a real answer replaces the unknown.
    sizeMock.mockReset()
    sizeMock.mockResolvedValue({ dentists: 7, scanned: 90, capped: false })
    const again = await verifyProspectSignals({ ...PROSPECT, verification: out.patch.verification } as never, null, await ctx())
    expect(sizeMock).toHaveBeenCalledTimes(1)
    expect(again.patch.verification.fit?.size).toMatchObject({ status: 'group', dentists: 7 })
    expect(again.patch.verification.fit?.size).not.toHaveProperty('retry')
    // A completed count is never overwritten by a later outage.
    sizeMock.mockReset()
    sizeMock.mockRejectedValue(new Error('NPPES 503'))
    const old = { fit: { size: { status: 'small', detail: '3 dentists', checkedAt: '2026-01-01T00:00:00.000Z', source: 'nppes', dentists: 3 } } }
    const kept = await verifyProspectSignals({ ...PROSPECT, verification: old } as never, null, await ctx())
    expect(kept.patch.verification.fit?.size).toMatchObject({ status: 'small', dentists: 3 })
  })

  it('a CAPPED ZIP page never yields solo or small — unknown with retry; a group on a capped page still reads group (C24)', async () => {
    sizeMock.mockResolvedValue({ dentists: 1, scanned: 200, capped: true })
    const capped = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(capped.patch.verification.fit?.size).toMatchObject({ status: 'unknown', dentists: null, retry: true })
    expect(capped.patch.verification.fit?.size?.detail).toMatch(/ZIP page was full/)
    sizeMock.mockResolvedValue({ dentists: 6, scanned: 200, capped: true })
    const group = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(group.patch.verification.fit?.size).toMatchObject({ status: 'group', dentists: 6 })
  })

  it('a DSO name on the PRACTICE name disqualifies as a chain — the sentence, the prior status, the stop reason', async () => {
    const out = await verifyProspectSignals({ ...PROSPECT, name: 'Aspen Dental — Atlanta' } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'chain', suppressedAt: NOW, qualityScore: 0, qualityBand: 'parked' })
    expect(out.patch.verification.fit?.dso).toMatchObject({
      status: 'match',
      name: 'Aspen Dental',
      matchedOn: 'practice',
      priorStatus: 'enriched',
      detail: "Part of Aspen Dental — a chain; we'll target chains later",
      source: 'dso_list',
    })
    expect(outreachStopReason(out.patch)).toBe('verify_chain')
  })

  it('…on the NPI organization name, and on the Google listing name', async () => {
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, organizationName: 'HEARTLAND DENTAL LLC' })
    const npi = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(npi.patch.suppressedReason).toBe('chain')
    expect(npi.patch.verification.fit?.dso).toMatchObject({ name: 'Heartland Dental', matchedOn: 'npi' })

    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    const listing = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, displayName: 'Smile Brands — Atlanta' }] }, await ctx())
    expect(listing.patch.suppressedReason).toBe('chain')
    expect(listing.patch.verification.fit?.dso).toMatchObject({ name: 'Smile Brands', matchedOn: 'listing' })
  })

  it('a common-phrase brand (A): "Gentle Dental" is a chain only when the website host is the brand’s — the listing’s host or the row’s; an independent carrying the words stays in the pool', async () => {
    const gentle = { ...PROSPECT, name: 'Gentle Dental Care of Smithville' }
    const independent = await verifyProspectSignals(gentle as never, { ok: true, places: [{ ...PLACE, displayName: 'Gentle Dental Care of Smithville', websiteUri: 'https://smithvilledental.com' }] }, await ctx())
    expect(independent.patch.status).toBeUndefined()
    expect(independent.patch.verification.fit?.dso).toMatchObject({ status: 'none' })
    const brand = await verifyProspectSignals(gentle as never, { ok: true, places: [{ ...PLACE, displayName: 'Gentle Dental Smithville', websiteUri: 'https://gentledental.interdent.com/locations/tx' }] }, await ctx())
    expect(brand.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'chain' })
    expect(brand.patch.verification.fit?.dso).toMatchObject({ status: 'match', name: 'Gentle Dental', matchedOn: 'practice' })
    const rowHost = await verifyProspectSignals({ ...gentle, websiteUrl: 'https://www.perfectteeth.com/smithville', name: 'Perfect Teeth Smithville' } as never, null, await ctx())
    expect(rowHost.patch.verification.fit?.dso).toMatchObject({ status: 'match', name: 'Perfect Teeth' })
  })

  it('a pass that could NOT re-read the source the match came from keeps the prior match and its prior status (F.3); a re-read that no longer matches downgrades', async () => {
    const matched = (matchedOn: 'listing' | 'npi' | 'practice', name = 'Smile Brands') => ({
      ...PROSPECT,
      status: 'disqualified',
      verification: { fit: { dso: { status: 'match', detail: `Part of ${name} — a chain; we'll target chains later`, checkedAt: STAMP, source: 'dso_list', name, matchedOn, priorStatus: 'contacted' } } },
    })
    // The listing matched, the Places budget is used up this pass: kept, byte for byte.
    const noPlaces = await verifyProspectSignals(matched('listing') as never, null, await ctx())
    expect(noPlaces.patch.verification.fit?.dso).toEqual(matched('listing').verification.fit.dso)
    expect(noPlaces.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'chain' })
    // The NPI organization matched, the registry cap is hit: kept.
    const c = await ctx()
    c.nppesLeft = 0
    const noNpi = await verifyProspectSignals(matched('npi', 'Heartland Dental') as never, { ok: true, places: [PLACE] }, c)
    expect(noNpi.patch.verification.fit?.dso).toMatchObject({ status: 'match', name: 'Heartland Dental', priorStatus: 'contacted' })
    // Everything re-read and nothing matches any more: downgraded honestly.
    const reread = await verifyProspectSignals(matched('listing') as never, { ok: true, places: [PLACE] }, await ctx())
    expect(reread.patch.verification.fit?.dso).toMatchObject({ status: 'none' })
    // A match on a row ALREADY set aside keeps the status it remembered, never "disqualified".
    const again = await verifyProspectSignals({ ...matched('practice', 'Aspen Dental'), name: 'Aspen Dental of Atlanta' } as never, null, await ctx())
    expect(again.patch.verification.fit?.dso).toMatchObject({ status: 'match', priorStatus: 'contacted' })
  })

  it('a DSO flag remembers the system follow-up it clears, so "Not a chain" can put it back (F.1)', async () => {
    const due = new Date('2026-11-12T15:00:00Z')
    const out = await verifyProspectSignals({ ...PROSPECT, name: 'Aspen Dental — Atlanta', nextFollowUpAt: due, followUpReason: 'No answer — try again' } as never, null, await ctx())
    expect(out.patch.verification.fit?.dso).toMatchObject({ priorStatus: 'enriched', priorFollowUp: { at: due.toISOString(), reason: 'No answer — try again' } })
    const promised = await verifyProspectSignals({ ...PROSPECT, name: 'Aspen Dental — Atlanta', nextFollowUpAt: due, followUpReason: 'They asked for a callback' } as never, null, await ctx())
    expect(promised.patch.verification.fit?.dso).not.toHaveProperty('priorFollowUp')
  })

  it('retired and closed outrank chain; "Not a chain" is never re-flagged; a sweep flag carried on a re-verify stays a chain', async () => {
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, status: 'deactivated', deactivationDate: '2024-03-01' })
    const retired = await verifyProspectSignals({ ...PROSPECT, name: 'Aspen Dental' } as never, null, await ctx())
    expect(retired.patch.suppressedReason).toBe('retired')

    lookupNpiMock.mockResolvedValue(NPI_ACTIVE)
    const override = { fit: { chainOverride: { status: 'not_a_chain', detail: 'by hand', checkedAt: STAMP, source: 'owner' } } }
    const kept = await verifyProspectSignals({ ...PROSPECT, name: 'Aspen Dental', verification: override } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(kept.patch.status).toBeUndefined()
    expect(kept.patch.verification.fit?.chainOverride).toEqual(override.fit.chainOverride)
    expect(kept.patch.verification.fit?.dso).toBeUndefined()
    expect(kept.patch.qualityScore).toBe(90)

    const swept = { fit: { chain: { status: 'shared_host', detail: 'shares its website', checkedAt: STAMP, source: 'our_data', kind: 'shared_host', count: 3, key: 'aspen.com', priorStatus: 'enriched' } } }
    const again = await verifyProspectSignals({ ...PROSPECT, status: 'disqualified', verification: swept } as never, { ok: true, places: [PLACE] }, await ctx())
    expect(again.patch).toMatchObject({ status: 'disqualified', suppressedReason: 'chain' })
    expect(again.patch.verification.fit?.chain).toEqual(swept.fit.chain)
  })

  it('the standalone verify frees a cold caller’s slot on a chain, like any disqualification', async () => {
    const { releaseIfUnservable } = await import('@/lib/services/prospect-caller-release')
    state.selectQueue.push([{ ...PROSPECT, name: 'Aspen Dental of Atlanta' }])
    const r = await verifyProspect('pros_1', { now: NOW })
    expect(r).toMatchObject({ ok: true, qualityScore: 0 })
    expect(state.updates.at(-1)!.values).toMatchObject({ status: 'disqualified', suppressedReason: 'chain' })
    expect(releaseIfUnservable).toHaveBeenCalledWith('pros_1')
    expect(stopMock).toHaveBeenCalledWith('pros_1', 'verify_chain', NOW)
  })
})

describe('liveness from the listing (P-04) — the sample is a LOWER BOUND (C)', () => {
  const months = (n: number) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - n, 10)).toISOString()
  it('a sampled review inside 6 months is current (10); a quiet or stale sample never costs the count rule’s 10 (22 reviews) — with hours, the date, the source, and sentences that say "top reviews"', async () => {
    const recent = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, latestReviewAt: months(2) }] }, await ctx())
    expect(recent.patch.verification.reviews).toMatchObject({ status: 'recent', latestAt: months(2), hours: true, source: 'places', checkedAt: NOW.toISOString() })
    expect(recent.patch.qualityScore).toBe(90)
    const quiet = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, latestReviewAt: months(10) }] }, await ctx())
    expect(quiet.patch.verification.reviews?.status).toBe('quiet')
    expect(quiet.patch.verification.reviews?.detail).toMatch(/^Google's top reviews run to /)
    expect(quiet.patch.qualityScore).toBe(90)
    const stale = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, latestReviewAt: months(24) }] }, await ctx())
    expect(stale.patch.verification.reviews?.status).toBe('stale')
    expect(stale.patch.verification.reviews?.detail).toMatch(/^Google's top reviews are all older than /)
    expect(stale.patch.qualityScore).toBe(90)
    expect(stale.patch.qualityBand).toBe('best')
  })
  it('a 300-review practice whose sampled latest is 2023, no hours → NOT capped (C3); zero reviews and no hours → capped; zero reviews, no hours, a NEW practice → not capped (H.4)', async () => {
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, reviewCount: 300, latestReviewAt: '2023-04-01T00:00:00.000Z', hasOpeningHours: false }] }, await ctx())
    expect(out.patch.verification.reviews).toMatchObject({ status: 'stale', hours: false })
    expect(out.patch.verification.reviews?.detail).toMatch(/no opening hours on the listing/)
    expect(out.patch.qualityBand).toBe('best')
    expect(out.patch.qualityScore).toBe(90)
    expect(out.patch.qualityReasons.join(' ')).not.toMatch(/no sign of life/)
    const never = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, reviewCount: 0, latestReviewAt: null, hasOpeningHours: false }] }, await ctx())
    expect(never.patch.verification.reviews?.status).toBe('none')
    expect(never.patch.qualityBand).toBe('weak')
    expect(never.patch.qualityReasons[0]).toBe('Google shows no sign of life — no reviews and no hours on the listing')
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, enumerationDate: '2025-06-15' })
    const fresh = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, reviewCount: 0, latestReviewAt: null, hasOpeningHours: false }] }, await ctx())
    expect(fresh.patch.verification.fit?.newPractice?.status).toBe('new')
    expect(fresh.patch.qualityBand).toBe('best')
    expect(fresh.patch.qualityReasons).toContain('No Google reviews yet — expected for a practice this new')
  })
  it('no dates returned is unknown (the count rule) — a NULL count too, never "none"; no lookup keeps the prior signal; a cleared listing drops it', async () => {
    const unknown = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(unknown.patch.verification.reviews?.status).toBe('unknown')
    expect(unknown.patch.qualityScore).toBe(90)
    const nullCount = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, reviewCount: null, latestReviewAt: null, hasOpeningHours: false }] }, await ctx())
    expect(nullCount.patch.verification.reviews?.status).toBe('unknown')
    expect(nullCount.patch.qualityBand).toBe('best')
    const prior = { ...VERIFIED, verification: { ...VERIFIED.verification, reviews: { status: 'recent', detail: null, checkedAt: STAMP, source: 'places', latestAt: months(1), hours: true } } }
    const kept = await verifyProspectSignals(prior as never, { ok: false, error: 'unavailable' }, await ctx())
    expect(kept.patch.verification.reviews).toEqual(prior.verification.reviews)
    const cleared = await verifyProspectSignals(prior as never, { ok: true, places: [] }, await ctx())
    expect(cleared.patch.verification.reviews).toBeUndefined()
  })
})

describe('"that clinic’s number" — the two-source rule (P-04)', () => {
  it('the predicate (G.1): two voices, or the carrier plus one voice, or a human who reached them; the carrier ALONE is single source; else single source', () => {
    expect(phoneStanding([], 'unknown')).toBe('single_source')
    expect(phoneStanding(['nppes'], 'unknown')).toBe('single_source')
    expect(phoneStanding(['nppes', 'places'], 'unknown')).toBe('corroborated')
    expect(phoneStanding(['carrier'], 'valid')).toBe('single_source')
    expect(phoneStanding(['places', 'carrier'], 'valid')).toBe('corroborated')
    expect(phoneStanding(['caller', 'carrier'], 'valid')).toBe('corroborated')
    expect(phoneStanding(['caller'], 'valid')).toBe('corroborated')
    expect(phoneStanding(['caller'], 'unknown')).toBe('single_source')
    // Y3: a BAD number has no standing, whoever listed it.
    expect(phoneStanding(['caller', 'nppes'], 'disconnected')).toBe('single_source')
    expect(phoneStanding(['nppes', 'caller'], 'wrong_number')).toBe('single_source')
    expect(phoneStanding(['nppes', 'places'], 'invalid')).toBe('single_source')
    expect(phoneStanding(['nppes', 'places', 'carrier'], 'invalid')).toBe('single_source')
  })

  it('Y3: a caller’s wrong-number verdict that carries both voices (sources [nppes, caller], W3) reads single_source on the next pass — never corroborated for a number a human said is wrong', async () => {
    const verdict = { status: 'wrong_number', detail: 'Wrong number on Nov 10, 2026 (heard on a call)', checkedAt: STAMP, source: 'caller', sources: ['nppes', 'caller'] }
    const row = { ...PROSPECT, phoneSource: 'single_source', phoneStatus: 'wrong_number', verification: { phone: verdict } }
    for (const places of [null, { ok: true as const, places: [PLACE] }]) {
      const out = await verifyProspectSignals(row as never, places as never, await ctx())
      expect(out.patch.phoneStatus).toBe('wrong_number')
      expect(out.patch.phoneSource).toBe('single_source')
      expect(out.patch.verification.phone).toMatchObject({ status: 'wrong_number', source: 'caller', sources: ['nppes', 'caller'] })
      expect(out.patch.verification.phone?.standing ?? 'single_source').toBe('single_source')
    }
  })

  it('the carrier alone — the registry now lists another number, Google has no listing — is in service but nobody’s: single source (C9)', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: 'landline', invalid: false, carrier: 'AT&T', provider: 'aws_pinpoint' })
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, location: { ...NPI_ACTIVE.location, phone: '4045559999' } })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [] }, await ctx())
    expect(out.patch.phone).toBe('4045551212')
    expect(out.patch.phoneStatus).toBe('valid')
    expect(out.patch.verification.phone).toMatchObject({ sources: ['carrier'], standing: 'single_source', lineCheck: 'done' })
    expect(out.patch.phoneSource).toBe('single_source')
  })

  it('a hand-added row from before the stamp (phone, NO source column, no NPI) keeps its typed number over a listing that lists another (B / C2)', async () => {
    const typed = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: null, verification: null }
    const out = await verifyProspectSignals(typed as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(out.patch.phone).toBe('4045550000')
    // V2: the listing's DIFFERENT number is kept on the signal and said out
    // loud — the typed number still stays, and the sentence is the card's.
    expect(out.patch.verification.phone).toMatchObject({
      sources: ['caller'],
      standing: 'single_source',
      alt: { number: '4045559999', source: 'places', at: NOW.toISOString() },
    })
    expect(out.patch.verification.phone?.detail).toMatch(/Google lists \(404\) 555-9999 — kept the number you typed/)
    expect(out.patch.verification.phone?.detail).not.toMatch(/the registry had/)
    // The stored JSON reads it back.
    expect(parseVerification(JSON.parse(JSON.stringify(out.patch.verification))).phone?.alt).toEqual({ number: '4045559999', source: 'places', at: NOW.toISOString() })
    // A listing that AGREES with the typed number leaves no alt.
    const agrees = await verifyProspectSignals(typed as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045550000' }] }, await ctx())
    expect(agrees.patch.verification.phone?.alt).toBeUndefined()
    expect(agrees.patch.verification.phone?.detail).not.toMatch(/Google lists/)
    // A registry row with no source column is NOT caller-provided: the listing's number still wins there.
    const registry = { ...PROSPECT, phoneSource: null, verification: null }
    const r = await verifyProspectSignals(registry as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(r.patch.phone).toBe('4045559999')
  })

  it('the carrier saying in service corroborates — alone with the listing, or on top of the registry', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: 'landline', invalid: false, carrier: 'AT&T', provider: 'aws_pinpoint' })
    const agree = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(agree.patch.verification.phone).toMatchObject({ status: 'valid', sources: ['nppes', 'places', 'carrier'], standing: 'corroborated', lineCheck: 'done' })
    expect(agree.patch.phoneSource).toBe('corroborated')
    expect(agree.patch.qualityScore).toBe(95)
    const differs = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(differs.patch.phone).toBe('4045559999')
    expect(differs.patch.verification.phone).toMatchObject({ sources: ['places', 'carrier'], standing: 'corroborated' })
  })

  it('the carrier saying NOT assigned is invalid, whatever the sources', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: null, invalid: true, carrier: null, provider: 'aws_pinpoint' })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.phoneStatus).toBe('invalid')
    // The voices that listed it are kept; a bad number has no standing (Y3).
    expect(out.patch.verification.phone).toMatchObject({ sources: ['nppes', 'places'], standing: 'single_source', lineCheck: 'done' })
    expect(out.patch.phoneSource).toBe('single_source')
    expect(out.patch.qualityScore).toBe(0)
  })

  it('a number a human typed is kept over the registry and the listing, stated by the caller only — and still kept once the column reads single_source', async () => {
    const typed = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: 'caller' }
    const a = await verifyProspectSignals(typed as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(a.patch.phone).toBe('4045550000')
    expect(a.patch.verification.phone).toMatchObject({ sources: ['caller'], standing: 'single_source', alt: { number: '4045559999', source: 'places' } })
    expect(a.patch.phoneSource).toBe('single_source')
    // The next pass: the column says single_source, the signal remembers the caller.
    const later = { ...typed, phoneSource: 'single_source', verification: a.patch.verification }
    const b = await verifyProspectSignals(later as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(b.patch.phone).toBe('4045550000')
    expect(b.patch.verification.phone).toMatchObject({ sources: ['caller'] })
  })

  it('W1: the caller-stands branch keeps the listing’s other number — a wrong-number verdict, then a pass whose listing lists another: the typed number stays, the human’s verdict stays, alt + the sentence attached; a no-lookup pass carries it; an agreeing listing drops it', async () => {
    const SENTENCE = 'Google lists (404) 555-9999 — kept the number you typed'
    // The signal a wrong-number verdict leaves (applyCallerFeedback, W3: the
    // sources ride the verdict) on a hand-added row dialed before its first pass.
    const verdict = { status: 'wrong_number', detail: 'Wrong number on Nov 10, 2026 (heard on a call)', checkedAt: STAMP, source: 'caller', sources: ['caller'] }
    const judged = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: 'caller', phoneStatus: 'wrong_number', verification: { phone: verdict } }
    const differs = await verifyProspectSignals(judged as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(differs.patch.phone).toBe('4045550000')
    expect(differs.patch.phoneStatus).toBe('wrong_number')
    expect(differs.patch.verification.phone).toMatchObject({
      status: 'wrong_number',
      source: 'caller',
      sources: ['caller'],
      checkedAt: STAMP,
      alt: { number: '4045559999', source: 'places', at: NOW.toISOString() },
      detail: `Wrong number on Nov 10, 2026 (heard on a call); ${SENTENCE}`,
    })
    // The same drop after a REACH (phone_status valid, source caller).
    const reached = { ...judged, phoneStatus: 'valid', verification: { phone: { ...verdict, status: 'valid', detail: 'Reached on Nov 10, 2026 — the number works (heard on a call)', standing: 'corroborated' } } }
    const afterReach = await verifyProspectSignals(reached as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(afterReach.patch.verification.phone).toMatchObject({ status: 'valid', standing: 'corroborated', alt: { number: '4045559999' } })
    expect(afterReach.patch.verification.phone?.detail).toBe(`Reached on Nov 10, 2026 — the number works (heard on a call); ${SENTENCE}`)
    // A pass that did NOT re-read the listing carries the stored alt and its sentence, once.
    const stored = { ...judged, verification: differs.patch.verification }
    const noLookup = await verifyProspectSignals(stored as never, null, await ctx())
    expect(noLookup.patch.verification.phone).toEqual(differs.patch.verification.phone)
    const outage = await verifyProspectSignals(stored as never, { ok: false, error: 'unavailable' }, await ctx())
    expect(outage.patch.verification.phone).toEqual(differs.patch.verification.phone)
    expect(outage.patch.verification.phone?.detail?.match(/Google lists/g)).toHaveLength(1)
    // A re-read that still differs stamps THIS pass's alt — one sentence, never two.
    const again = await verifyProspectSignals(stored as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(again.patch.verification.phone?.detail?.match(/Google lists/g)).toHaveLength(1)
    // A listing that AGREES drops it; a CLEARED listing (no match / not found) drops it.
    const agrees = await verifyProspectSignals(stored as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045550000' }] }, await ctx())
    expect(agrees.patch.verification.phone).not.toHaveProperty('alt')
    expect(agrees.patch.verification.phone?.detail).toBe('Wrong number on Nov 10, 2026 (heard on a call)')
    expect(agrees.patch.verification.phone).toMatchObject({ status: 'wrong_number', sources: ['caller'] })
    const cleared = await verifyProspectSignals(stored as never, { ok: true, places: [] }, await ctx())
    expect(cleared.patch.verification.phone).not.toHaveProperty('alt')
    expect(cleared.patch.verification.phone?.detail).not.toMatch(/Google lists/)
    // A matched listing that states NO number is neither agreeing nor cleared: the alt stays.
    const silent = await verifyProspectSignals(stored as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: null }] }, await ctx())
    expect(silent.patch.verification.phone).toMatchObject({ alt: { number: '4045559999' } })
  })

  it('Y2: a MERGED row carrying both rows’ voices keeps the typed number against a differing listing — the standing shape (column corroborated, sources [caller, nppes]) and the legacy shape (column caller)', async () => {
    const invalid = { status: 'invalid', detail: 'Carrier database: not an assigned number', checkedAt: STAMP, source: 'aws_pinpoint', sources: ['caller', 'nppes'], standing: 'corroborated', lineCheck: 'done' }
    for (const column of ['corroborated', 'caller']) {
      const merged = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: column, phoneStatus: 'invalid', verification: { phone: invalid } }
      const out = await verifyProspectSignals(merged as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
      expect(out.patch.phone, column).toBe('4045550000')
      expect(out.patch.verification.phone).toMatchObject({ sources: ['nppes', 'caller'], standing: 'corroborated', alt: { number: '4045559999', source: 'places', at: NOW.toISOString() } })
      expect(out.patch.verification.phone?.detail).toMatch(/Google lists \(404\) 555-9999 — kept the number you typed/)
      expect(out.patch.verification.phone?.detail).not.toMatch(/the registry had/)
    }
    // The CONTROL — the pre-fix merge's signal (the loser's sources alone): the listing's number REPLACED the typed one.
    const lost = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: 'single_source', phoneStatus: 'invalid', verification: { phone: { ...invalid, sources: ['nppes'], standing: 'single_source' } } }
    const replaced = await verifyProspectSignals(lost as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(replaced.patch.phone).toBe('4045559999')
  })

  it('W2: a pass with NO Places lookup (budget, no key, a 503) carries the stored alt and its sentence on a caller-provided row that stands on no verdict — only a lookup that cleared the listing or found it agreeing drops it', async () => {
    const typed = { ...PROSPECT, npiNumber: null, phone: '4045550000', phoneSource: 'caller' }
    const first = await verifyProspectSignals(typed as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] }, await ctx())
    expect(first.patch.verification.phone).toMatchObject({ alt: { number: '4045559999', source: 'places', at: NOW.toISOString() }, sources: ['caller'] })
    const stored = { ...typed, phoneSource: 'single_source', verification: first.patch.verification }
    // Budget used up / no key → null; an outage → not ok. Both carry.
    for (const places of [null, { ok: false as const, error: 'unavailable' as const }]) {
      const carried = await verifyProspectSignals(stored as never, places as never, await ctx())
      expect(carried.patch.phone).toBe('4045550000')
      expect(carried.patch.verification.phone).toMatchObject({ sources: ['caller'], standing: 'single_source', alt: { number: '4045559999', source: 'places', at: NOW.toISOString() } })
      expect(carried.patch.verification.phone?.detail).toMatch(/Google lists \(404\) 555-9999 — kept the number you typed/)
      expect(carried.patch.verification.phone?.detail?.match(/Google lists/g)).toHaveLength(1)
      // The stored JSON reads it back the same way.
      expect(parseVerification(JSON.parse(JSON.stringify(carried.patch.verification))).phone?.alt).toEqual({ number: '4045559999', source: 'places', at: NOW.toISOString() })
    }
    // A lookup that finds the listing agreeing drops it; a cleared listing drops it.
    const agrees = await verifyProspectSignals(stored as never, { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045550000' }] }, await ctx())
    expect(agrees.patch.verification.phone).not.toHaveProperty('alt')
    expect(agrees.patch.verification.phone?.detail).not.toMatch(/Google lists/)
    const cleared = await verifyProspectSignals(stored as never, { ok: true, places: [] }, await ctx())
    expect(cleared.patch.verification.phone).not.toHaveProperty('alt')
    expect(cleared.patch.verification.phone?.detail).not.toMatch(/Google lists/)
    // A number a registry or listing REPLACED this pass carries nothing — the
    // alt was about the number that is gone. (A human retyping the number goes
    // through updateProspectPhone, which writes a fresh signal — call-feedback.)
    const registryRow = { ...VERIFIED, verification: { ...VERIFIED.verification, phone: { ...VERIFIED.verification.phone, sources: ['nppes'], alt: { number: '4045559999', source: 'places', at: STAMP } } } }
    lookupNpiMock.mockResolvedValue({ ...NPI_ACTIVE, location: { ...NPI_ACTIVE.location, addressLine1: '9 Oak Ave', phone: '4045550077' } })
    const moved = await verifyProspectSignals(registryRow as never, null, await ctx())
    expect(moved.patch.phone).toBe('4045550077')
    expect(moved.patch.verification.phone).not.toHaveProperty('alt')
    expect(moved.patch.verification.phone?.detail).not.toMatch(/Google lists/)
  })

  it('with no lookup this pass the prior sources carry while the number is unchanged; a legacy column reads as its one source', async () => {
    const c = await ctx()
    c.nppesLeft = 0
    const prior = {
      ...VERIFIED,
      phoneSource: 'corroborated',
      verification: { ...VERIFIED.verification, phone: { ...VERIFIED.verification.phone, sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' } },
    }
    const carried = await verifyProspectSignals(prior as never, null, c)
    expect(carried.patch.verification.phone).toMatchObject({ sources: ['nppes', 'places'], standing: 'corroborated' })
    expect(carried.patch.phoneSource).toBe('corroborated')

    const legacy = await verifyProspectSignals(VERIFIED as never, null, c)
    expect(legacy.patch.verification.phone).toMatchObject({ sources: ['nppes'], standing: 'single_source' })
    expect(legacy.patch.phoneSource).toBe('single_source')
  })

  it('V9: a reach on a carrier-validated line keeps the carrier’s line facts — 95 before the reach, 100 after it on the next pass (the reach’s 5), landline kept, no second carrier call', async () => {
    driverMock.mockReturnValue('aws')
    lineMock.mockResolvedValue({ ok: true, lineType: 'landline', invalid: false, carrier: 'AT&T', provider: 'aws_pinpoint' })
    // Pass 1: the registry, the listing and the carrier agree — 35 + 25 + 15 + 10 + 10.
    const first = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(first.patch.qualityScore).toBe(95)
    expect(first.patch).toMatchObject({ phoneStatus: 'valid', phoneLineType: 'landline', phoneValidatedAt: NOW, phoneSource: 'corroborated' })
    expect(first.patch.verification.phone).toMatchObject({ sources: ['nppes', 'places', 'carrier'], standing: 'corroborated', lineCheck: 'done' })
    expect(lineMock).toHaveBeenCalledTimes(1)
    // A caller logs "gatekeeper": what applyCallerFeedback writes — the
    // signal is the caller's (sources + caller, corroborated, lineCheck
    // kept), the reach stored, the carrier's columns untouched.
    const reachedAt = '2026-11-11T09:00:00.000Z'
    const afterReach = {
      ...PROSPECT,
      phoneStatus: 'valid',
      phoneLineType: 'landline',
      phoneValidatedAt: NOW,
      phoneSource: 'corroborated',
      verification: {
        ...first.patch.verification,
        phone: {
          status: 'valid',
          detail: 'Reached on Nov 11, 2026 — the number works (heard on a call)',
          checkedAt: reachedAt,
          source: 'caller',
          sources: ['nppes', 'places', 'carrier', 'caller'],
          standing: 'corroborated',
          lineCheck: 'done',
        },
        reach: { status: 'reached', detail: 'Someone picked up on Nov 11, 2026 (reached the desk)', checkedAt: reachedAt, source: 'caller' },
      },
    }
    // Pass 2: the caller's verdict stands, the line facts ride along, the carrier is not asked again.
    const second = await verifyProspectSignals(afterReach as never, { ok: true, places: [PLACE] }, await ctx())
    expect(second.patch.verification.phone).toEqual(afterReach.verification.phone)
    expect(second.patch).toMatchObject({ phoneStatus: 'valid', phoneLineType: 'landline', phoneValidatedAt: NOW, phoneSource: 'corroborated' })
    expect(second.patch.qualityReasons).toContain('Phone validated: landline')
    expect(second.patch.qualityScore).toBe(100)
    expect(lineMock).toHaveBeenCalledTimes(1)
    // A caller verdict on a line the carrier never typed stays honest: nothing invented.
    const bare = { ...afterReach, phoneLineType: null, phoneValidatedAt: null }
    const third = await verifyProspectSignals(bare as never, { ok: true, places: [PLACE] }, await ctx())
    expect(third.patch).toMatchObject({ phoneLineType: null, phoneValidatedAt: null })
    expect(third.patch.qualityReasons).toContain('Phone validated, line type unknown')
  })

  it('a caller’s standing verdict keeps its signal byte for byte; a reach on the number is corroborated', async () => {
    const prior = { phone: { status: 'valid', detail: 'Reached on Nov 9, 2026 — the number works (heard on a call)', checkedAt: STAMP, source: 'caller', sources: ['caller'], standing: 'corroborated' } }
    const out = await verifyProspectSignals({ ...PROSPECT, phoneStatus: 'valid', phoneSource: 'corroborated', verification: prior } as never, null, await ctx())
    expect(out.patch.verification.phone).toEqual(prior.phone)
    expect(out.patch.phoneSource).toBe('corroborated')
    const bare = { phone: { status: 'valid', detail: 'Reached', checkedAt: STAMP, source: 'caller' } }
    const legacy = await verifyProspectSignals({ ...PROSPECT, phoneStatus: 'valid', phoneSource: 'caller', verification: bare } as never, null, await ctx())
    expect(legacy.patch.verification.phone).toEqual(bare.phone)
    expect(legacy.patch.phoneSource).toBe('corroborated')
  })
})
