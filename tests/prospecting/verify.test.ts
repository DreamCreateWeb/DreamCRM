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

const { lookupNpiMock, candidatesMock, placesConfiguredMock, livenessMock, driverMock, lineMock, strikeMock, configMock, counterMock, bumpMock, stopMock, pauseMock, resumeMock, clearFollowUpMock } =
  vi.hoisted(() => ({
    lookupNpiMock: vi.fn(),
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
vi.mock('@/lib/nppes', () => ({ lookupNpi: lookupNpiMock }))
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
} from '@/lib/services/prospect-verify'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

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
}
const NPI_ACTIVE = {
  found: true,
  status: 'active',
  deactivationDate: null,
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
    // 35 + 12 (format only) + 15 + 10 + 10 = 82
    expect(out.patch.qualityScore).toBe(82)
    expect(out.patch.qualityBand).toBe('best')
    expect(out.patch.verifiedAt).toEqual(NOW)
    expect(out.patch.status).toBeUndefined()
  })

  it('a matched listing with a different phone replaces the registry number (source: places) and keeps the old one in the detail', async () => {
    const out = await verifyProspectSignals(
      PROSPECT as never,
      { ok: true, places: [{ ...PLACE, nationalPhoneNumber: '4045559999' }] },
      await ctx(),
    )
    expect(out.place).toBeTruthy()
    expect(out.patch.phone).toBe('4045559999')
    expect(out.patch.phoneSource).toBe('places')
    expect(out.patch.verification.phone?.detail).toMatch(/\(404\) 555-9999.*\(404\) 555-1212/)
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
  it('a dead website parks the record — it is NOT "no website"', async () => {
    livenessMock.mockResolvedValue({ status: 'dead', detail: 'smiledental.com no longer resolves (DNS)', finalUrl: null, httpStatus: null })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.qualityBand).toBe('parked')
    expect(out.patch.qualityReasons).toEqual(['smiledental.com no longer resolves (DNS)'])
    expect(out.websiteUrl).toBe('https://smiledental.com')
  })
  it('a moved practice location refreshes the address and the registry phone', async () => {
    lookupNpiMock.mockResolvedValue({
      ...NPI_ACTIVE,
      location: { addressLine1: '500 New Rd', city: 'Decatur', state: 'GA', postalCode: '30030', phone: '4045557777' },
    })
    const out = await verifyProspectSignals(PROSPECT as never, null, await ctx())
    expect(out.patch).toMatchObject({ addressLine1: '500 New Rd', city: 'Decatur', postalCode: '30030', phone: '4045557777', phoneSource: 'nppes' })
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
    expect(out.patch.qualityScore).toBe(87)
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
    expect(w).toMatchObject({ googlePlaceId: 'place_1', reviewCount: 22, websiteUrl: 'https://smiledental.com', qualityScore: 82, verifiedAt: NOW })
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
    expect(out.patch.qualityScore).toBe(82)
    expect(c.liveness).toEqual({ checks: 0, networkDead: 0 })
  })

  it('unknown with no prior is an honest unknown — not parked', async () => {
    livenessMock.mockResolvedValue({ status: 'unknown', detail: 'smiledental.com could not be resolved right now (EAI_AGAIN) — will check again', finalUrl: null, httpStatus: null })
    const out = await verifyProspectSignals(PROSPECT as never, { ok: true, places: [PLACE] }, await ctx())
    expect(out.patch.verification.website).toMatchObject({ status: 'unknown', source: 'crawl' })
    expect(out.patch.qualityBand).not.toBe('parked')
    expect(out.patch.qualityScore).toBe(72) // 35 + 12 + 15 + 10 reviews; no website credit either way
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
