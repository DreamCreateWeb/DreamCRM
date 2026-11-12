import { describe, it, expect, vi, beforeEach } from 'vitest'
// The cold-caller release hook (P-02) rides every unservable flip; it is its
// own module with its own tests — here it is a spy, so the counts below
// stay the writer's own statements.
vi.mock('@/lib/services/prospect-caller-release', () => ({ releaseIfUnservable: vi.fn(async () => false) }))

/**
 * CALLER FEEDBACK IS THE STRONGEST SIGNAL (P-01). What the owner heard on
 * the phone outranks every database: disconnected / wrong number park the
 * record and the number leaves every dial queue; closed disqualifies; a
 * pick-up writes the reach signal. No-answers and voicemails are normal and
 * touch nothing.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
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
  const table = (name: string) => new Proxy({ _n: name }, { get: (t, k) => (k === '_n' ? name : String(k)) })
  return {
    db: {
      select: () => selectChain(),
      insert: (t: { _n: string }) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table: t._n, values })
        },
      }),
      update: (t: { _n: string }) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: t._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: table('prospect'),
      prospectCallLog: table('prospect_call_log'),
      outreachEnrollment: table('outreach_enrollment'),
      prospectingConfig: table('prospecting_config'),
      prospectingCounter: table('prospecting_counter'),
    },
  }
})
vi.mock('drizzle-orm', () => {
  const stub = () => vi.fn(() => ({}))
  return {
    and: stub(), asc: stub(), desc: stub(), eq: stub(), exists: stub(), gte: stub(), ilike: stub(),
    inArray: stub(), isNotNull: stub(), isNull: stub(), ne: stub(), notInArray: stub(), or: stub(),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
  }
})

// The W3 path runs the REAL verify pass on either side of a caller's
// verdict; its network edges are spies (no registry, no Places, no line
// check — the test hands the listing in).
vi.mock('@/lib/nppes', () => ({ lookupNpi: vi.fn(), searchDentistsAtAddress: vi.fn() }))
vi.mock('@/lib/google-places', () => ({ findDentalPlaceCandidates: vi.fn(), placesConfigured: () => true }))
vi.mock('@/lib/services/prospect-site-liveness', () => ({ checkSiteLiveness: vi.fn() }))
vi.mock('@/lib/services/phone-validate', () => ({ phoneValidateDriver: () => 'none', validatePhoneLine: vi.fn() }))
vi.mock('@/lib/services/engine-failures', () => ({ reportProspectingFailure: vi.fn(async () => true) }))

import { logCallOutcome, updateProspectPhone } from '@/lib/services/prospecting'
import { newVerifyRunCtx, verifyProspectSignals } from '@/lib/services/prospect-verify'
import { PROSPECTING_DEFAULTS, parseVerification } from '@/lib/types/prospecting'
import { SINGLE_SOURCE_TURN_ON } from '@/lib/prospect-quality'

const VERIFIED_ROW = {
  status: 'enriched',
  verification: {
    places: { status: 'matched', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'places' },
    business: { status: 'open', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'places' },
    npi: { status: 'active', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'nppes' },
    website: { status: 'alive', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'crawl' },
    phone: { status: 'valid', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'aws_pinpoint' },
  },
  verifiedAt: new Date('2026-11-01T00:00:00Z'),
  phone: '4045551212',
  phoneStatus: 'valid',
  phoneLineType: 'landline',
  businessStatus: 'OPERATIONAL',
  reviewCount: 20,
  websiteUrl: 'https://smiledental.com',
}

const prospectUpdates = () => state.updates.filter((u) => u.table === 'prospect')
/** logCallOutcome resolves the row's survivor FIRST (P-03): one read of
 *  status + merge pointer before anything is written. */
const LIVE_ROW = { status: 'enriched', mergedInto: null }
/** The config read a rescore makes (an empty queue resolves to the defaults). */
const CONFIG_14 = { config: { hygiene: { parkedRecheckDays: 14 } } }

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
})

describe('logCallOutcome — the verdicts', () => {
  it('disconnected → phone parked, quality zero, the date in the reason, the number off every queue', async () => {
    state.selectQueue.push([LIVE_ROW], [VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'disconnected' } })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'disconnected', phoneLineType: null, qualityScore: 0, qualityBand: 'parked' })
    const v = w.verification as { phone: { status: string; detail: string; source: string } }
    expect(v.phone.source).toBe('caller')
    expect(v.phone.detail).toMatch(/^Number disconnected on \w{3} \d{1,2}, \d{4}/)
    expect(w.qualityReasons).toEqual([v.phone.detail])
    // The follow-up loop clears — a dead number is nothing to circle back on.
    expect(prospectUpdates()[0].values).toMatchObject({ nextFollowUpAt: null })
  })

  it('wrong number → the same parking, its own words', async () => {
    state.selectQueue.push([LIVE_ROW], [VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'wrong_number' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'wrong_number', qualityScore: 0, qualityBand: 'parked' })
    expect((w.verification as { phone: { detail: string } }).phone.detail).toMatch(/^Wrong number on/)
  })

  it('closed → disqualified with reason closed, the enrollment stopped, the business signal from the caller', async () => {
    state.selectQueue.push([LIVE_ROW], [VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'closed' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ status: 'disqualified', suppressedReason: 'closed', qualityScore: 0, qualityBand: 'parked' })
    expect((w.verification as { business: { status: string; source: string } }).business).toMatchObject({ status: 'closed', source: 'caller' })
    const stopped = state.updates.find((u) => u.table === 'outreach_enrollment')
    expect(stopped?.values).toMatchObject({ status: 'stopped_manual', stopReason: 'call_closed' })
  })

  it('a verdict on a never-verified row still writes the honest zero', async () => {
    state.selectQueue.push([LIVE_ROW], [{ ...VERIFIED_ROW, verification: null, verifiedAt: null, phoneStatus: null }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    expect(prospectUpdates().at(-1)!.values).toMatchObject({ phoneStatus: 'disconnected', qualityScore: 0 })
  })
})

describe('logCallOutcome — a human got through', () => {
  it('gatekeeper writes the reach signal, rescored on a verified row, and schedules a follow-up', async () => {
    state.selectQueue.push([LIVE_ROW], [VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const first = prospectUpdates()[0].values
    expect(first.nextFollowUpAt).toBeInstanceOf(Date)
    expect(first.followUpReason).toMatch(/decision maker/)
    const w = prospectUpdates().at(-1)!.values
    const v = w.verification as { reach: { status: string; detail: string; source: string } }
    expect(v.reach).toMatchObject({ status: 'reached', source: 'caller' })
    expect(v.reach.detail).toMatch(/reached the desk/)
    // 35 + 25 + 15 + 10 + 10 + 5
    expect(w.qualityScore).toBe(100)
    expect(w.qualityBand).toBe('best')
  })

  it('G.2: a human reaching the practice CORROBORATES the number whatever its standing was — the common row (sources [nppes], line check off, gatekeeper): caller joins the sources, corroborated, valid, the "turn on the line check" sentence gone', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phoneStatus: 'unknown',
        phoneLineType: null,
        verification: {
          ...VERIFIED_ROW.verification,
          phone: { status: 'well_formed', detail: 'Well-formed US number — the line check is off', checkedAt: '2026-11-01T00:00:00.000Z', source: 'nanp', sources: ['nppes'], standing: 'single_source', lineCheck: 'off' },
        },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'valid', phoneSource: 'corroborated' })
    const v = w.verification as { phone: Record<string, unknown>; reach: { status: string } }
    expect(v.phone).toMatchObject({ status: 'valid', source: 'caller', sources: ['nppes', 'caller'], standing: 'corroborated', lineCheck: 'off' })
    expect(v.reach.status).toBe('reached')
    expect(w.qualityReasons as string[]).not.toContain(SINGLE_SOURCE_TURN_ON)
    expect((w.qualityReasons as string[]).join(' ')).not.toMatch(/Only one source/)
    // 35 + 12 (valid, line type unknown) + 15 + 10 + 10 + 5
    expect(w.qualityScore).toBe(87)
  })

  it('V9: a reach on a carrier-validated line never touches the carrier’s columns — no phone_line_type / phone_validated_at in the write, lineCheck kept on the signal, 100 with the landline', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phoneSource: 'corroborated',
        phoneValidatedAt: new Date('2026-11-01T00:00:00Z'),
        verification: {
          ...VERIFIED_ROW.verification,
          phone: { status: 'valid', detail: 'Carrier database: landline (AT&T)', checkedAt: '2026-11-01T00:00:00.000Z', source: 'aws_pinpoint', sources: ['nppes', 'places', 'carrier'], standing: 'corroborated', lineCheck: 'done' },
        },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).not.toHaveProperty('phoneLineType')
    expect(w).not.toHaveProperty('phoneValidatedAt')
    expect(w).toMatchObject({ phoneStatus: 'valid', phoneSource: 'corroborated' })
    const v = w.verification as { phone: Record<string, unknown> }
    expect(v.phone).toMatchObject({ status: 'valid', source: 'caller', sources: ['nppes', 'places', 'carrier', 'caller'], standing: 'corroborated', lineCheck: 'done' })
    // 35 + 25 (valid, landline — the column the write left alone) + 15 + 10 + 10 + 5
    expect(w.qualityReasons as string[]).toContain('Phone validated: landline')
    expect(w.qualityScore).toBe(100)
  })

  it('a reach on a never-verified row records the signal but invents no score', async () => {
    state.selectQueue.push([LIVE_ROW], [{ ...VERIFIED_ROW, verification: null, verifiedAt: null }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'callback' })
    const w = prospectUpdates().at(-1)!.values
    expect((w.verification as { reach?: unknown }).reach).toBeTruthy()
    expect(w).not.toHaveProperty('qualityScore')
  })

  it('no answer and voicemail are normal — no feedback read, no rescoring', async () => {
    state.selectQueue.push([LIVE_ROW], [LIVE_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'no_answer' })
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'voicemail' })
    expect(state.selectQueue).toHaveLength(0)
    expect(prospectUpdates()).toHaveLength(2)
    for (const u of prospectUpdates()) {
      expect(u.values).not.toHaveProperty('verification')
      expect(u.values).not.toHaveProperty('qualityScore')
    }
  })
})

describe('W3: "a typed number is never replaced" is durable through every write to verification.phone', () => {
  const NOW = new Date('2026-11-10T12:00:00Z')
  const TYPED = {
    id: 'pros_1',
    name: 'Smile Dental PC',
    npiNumber: null,
    addressLine1: '123 Main St',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30309',
    phone: '4045550000',
    phoneSource: 'caller',
    phoneStatus: null,
    websiteUrl: null,
    verification: null,
    status: 'enriched',
  }
  const LISTING = {
    placeId: 'place_1',
    displayName: 'Smile Dental',
    formattedAddress: '123 Main St, Atlanta, GA 30309, USA',
    nationalPhoneNumber: '4045559999',
    websiteUri: null,
    ratingTenths: 47,
    reviewCount: 22,
    businessStatus: 'OPERATIONAL',
    googleMapsUri: 'https://maps.google.com/x',
    latestReviewAt: null,
    hasOpeningHours: true,
  }
  const SENTENCE = 'Google lists (404) 555-9999 — kept the number you typed'

  it('a wrong-number / disconnected verdict writes sources: union(prior, caller) exactly as a reach does — and carries the listing’s other number and its sentence', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phone: '4045550000',
        phoneStatus: 'unknown',
        phoneLineType: null,
        verification: {
          ...VERIFIED_ROW.verification,
          phone: { status: 'well_formed', detail: `Well-formed US number — the line check is off; ${SENTENCE}`, checkedAt: '2026-11-01T00:00:00.000Z', source: 'nanp', sources: ['caller'], standing: 'single_source', lineCheck: 'off', alt: { number: '4045559999', source: 'places', at: '2026-11-01T00:00:00.000Z' } },
        },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'wrong_number' })
    const w = prospectUpdates().at(-1)!.values
    const v = w.verification as { phone: Record<string, unknown> }
    expect(v.phone).toMatchObject({ status: 'wrong_number', source: 'caller', sources: ['caller'], alt: { number: '4045559999', source: 'places', at: '2026-11-01T00:00:00.000Z' } })
    expect(v.phone.detail).toMatch(/^Wrong number on \w{3} \d{1,2}, \d{4} \(heard on a call\); Google lists \(404\) 555-9999 — kept the number you typed$/)
    // A registry row's verdict unions the caller in beside the registry.
    state.selectQueue.push([LIVE_ROW], [{ ...VERIFIED_ROW, verification: { ...VERIFIED_ROW.verification, phone: { ...VERIFIED_ROW.verification.phone, sources: ['nppes'], standing: 'single_source' } } }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    const d = (prospectUpdates().at(-1)!.values.verification as { phone: Record<string, unknown> }).phone
    expect(d).toMatchObject({ status: 'disconnected', source: 'caller', sources: ['nppes', 'caller'] })
    expect(d).not.toHaveProperty('alt')
    expect(d.detail).not.toMatch(/Google lists/)
  })

  it('the exact path: pass 0 (column → single_source) → wrong_number verdict → pass 1 with a differing listing → the typed number stays, the human’s wrong-number signal stands, alt + the sentence attached', async () => {
    // Pass 0: the hand-added row's first verify — the listing lists another
    // number; the typed one is kept, the column now reads the standing.
    const ctx0 = await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW)
    const pass0 = await verifyProspectSignals(TYPED as never, { ok: true, places: [LISTING] }, ctx0)
    expect(pass0.patch.phone).toBe('4045550000')
    expect(pass0.patch.phoneSource).toBe('single_source')
    expect(pass0.patch.verification.phone).toMatchObject({ sources: ['caller'], standing: 'single_source', alt: { number: '4045559999' } })

    // The verdict: a caller logs wrong_number on the row as pass 0 left it.
    state.selectQueue = []
    state.updates = []
    state.selectQueue.push([LIVE_ROW], [
      {
        status: 'enriched',
        verification: JSON.parse(JSON.stringify(pass0.patch.verification)),
        verifiedAt: NOW,
        phone: '4045550000',
        phoneStatus: pass0.patch.phoneStatus,
        phoneLineType: null,
        businessStatus: 'OPERATIONAL',
        reviewCount: 22,
        websiteUrl: null,
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'wrong_number' })
    const written = prospectUpdates().at(-1)!.values
    expect(written).toMatchObject({ phoneStatus: 'wrong_number' })
    expect(written).not.toHaveProperty('phoneSource') // the column still reads single_source
    const afterVerdict = parseVerification(written.verification)
    expect(afterVerdict.phone).toMatchObject({ status: 'wrong_number', source: 'caller', sources: ['caller'], alt: { number: '4045559999' } })

    // Pass 1: the column reads single_source, the listing still lists
    // another number — before W3 the guard read `sources` off a verdict
    // that had none, and the listing's number REPLACED the typed one.
    const row1 = { ...TYPED, phoneSource: 'single_source', phoneStatus: 'wrong_number', verification: afterVerdict }
    const pass1 = await verifyProspectSignals(row1 as never, { ok: true, places: [LISTING] }, await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW))
    expect(pass1.patch.phone).toBe('4045550000')
    expect(pass1.patch.phoneStatus).toBe('wrong_number')
    expect(pass1.patch.verification.phone).toMatchObject({
      status: 'wrong_number',
      source: 'caller',
      sources: ['caller'],
      checkedAt: afterVerdict.phone!.checkedAt,
      alt: { number: '4045559999', source: 'places', at: NOW.toISOString() },
    })
    expect(pass1.patch.verification.phone?.detail).toMatch(/^Wrong number on \w{3} \d{1,2}, \d{4} \(heard on a call\); Google lists \(404\) 555-9999 — kept the number you typed$/)
    expect(pass1.patch.verification.phone?.detail).not.toMatch(/the registry had/)
    // …and a pass 2 with no lookup keeps all of it.
    const pass2 = await verifyProspectSignals({ ...row1, verification: pass1.patch.verification } as never, null, await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW))
    expect(pass2.patch.phone).toBe('4045550000')
    expect(pass2.patch.verification.phone).toEqual(pass1.patch.verification.phone)
  })
})

describe('a human reaching them outranks a database "invalid" (C16)', () => {
  it('gatekeeper on a carrier-flagged invalid number re-validates it as valid (source: a call) and rescores', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phoneStatus: 'invalid',
        phoneLineType: null,
        verification: {
          ...VERIFIED_ROW.verification,
          phone: { status: 'invalid', detail: 'Carrier database: not an assigned number', checkedAt: '2026-11-01T00:00:00.000Z', source: 'aws_pinpoint' },
        },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'valid', phoneSource: 'corroborated' })
    const v = w.verification as { phone: { status: string; source: string; detail: string; sources: string[]; standing: string }; reach: { status: string } }
    expect(v.phone).toMatchObject({ status: 'valid', source: 'caller', sources: ['caller'], standing: 'corroborated' })
    expect(v.phone.detail).toMatch(/the number works/)
    expect(v.reach.status).toBe('reached')
    // 35 + 12 (valid, line type unknown) + 15 + 10 + 10 + 5 — no longer a hard zero.
    expect(w.qualityScore).toBe(87)
    expect(w.qualityBand).toBe('best')
  })

  it('a NANP-flagged invalid number is cleared the same way', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phoneStatus: 'invalid',
        phoneLineType: null,
        verification: { ...VERIFIED_ROW.verification, phone: { status: 'invalid', detail: 'Not a ten-digit US number', checkedAt: '2026-11-01T00:00:00.000Z', source: 'nanp' } },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'callback' })
    expect(prospectUpdates().at(-1)!.values).toMatchObject({ phoneStatus: 'valid' })
  })

  it('a disconnected / wrong number the caller reported earlier is cleared by a later reach on it — the latest human word wins (G.2: regardless of the prior status)', async () => {
    state.selectQueue.push([LIVE_ROW], [
      {
        ...VERIFIED_ROW,
        phoneStatus: 'disconnected',
        phoneLineType: null,
        verification: {
          ...VERIFIED_ROW.verification,
          phone: { status: 'disconnected', detail: 'Number disconnected on Nov 9, 2026 (heard on a call)', checkedAt: '2026-11-09T00:00:00.000Z', source: 'caller' },
        },
      },
    ])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'callback' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'valid', phoneSource: 'corroborated' })
    expect((w.verification as { phone: { status: string; sources: string[] } }).phone).toMatchObject({ status: 'valid', sources: ['caller'] })
    expect(w.qualityScore).toBe(87)
    // A row with NO number on it gets the reach signal and nothing on the phone.
    state.updates = []
    state.selectQueue.push([LIVE_ROW], [{ ...VERIFIED_ROW, phone: null, phoneStatus: null, phoneLineType: null, verification: { ...VERIFIED_ROW.verification, phone: undefined } }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'callback' })
    const w2 = prospectUpdates().at(-1)!.values
    expect(w2).not.toHaveProperty('phoneStatus')
    expect((w2.verification as { phone?: unknown }).phone).toBeUndefined()
  })
})

describe('a merged row is never written (P-03 fix pass 2 — V3)', () => {
  it('logCallOutcome resolves the survivor FIRST: a "no" from a stale Call Mode card lands on the row that kept the history', async () => {
    // pros_l was merged into pros_s a moment ago; the owner's card still says pros_l.
    state.selectQueue.push([{ status: 'merged', mergedInto: 'pros_s' }], [{ status: 'contacted', mergedInto: null }])
    state.selectQueue.push([{ ...VERIFIED_ROW, status: 'contacted' }]) // applyCallerFeedback's read, on pros_s
    await logCallOutcome({ prospectId: 'pros_l', outcome: 'not_interested', lostReason: 'price' })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { prospectId: 'pros_s', outcome: 'not_interested' } })
    const terminal = prospectUpdates().find((u) => u.values.status === 'not_interested')
    expect(terminal).toBeTruthy()
    // Every prospect write is guarded on status <> 'merged' — rendered for real in hygiene-routes.test.ts' sibling; here the guard is the `ne` stub.
    const { ne } = await import('drizzle-orm')
    expect((ne as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => c[1] === 'merged')).toBe(true)
  })

  it('applyCallerFeedback never writes a verdict onto a row that reads merged (the race between the resolve and the read)', async () => {
    state.selectQueue.push([LIVE_ROW], [{ ...VERIFIED_ROW, status: 'merged' }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    expect(prospectUpdates().some((u) => 'phoneStatus' in u.values)).toBe(false)
  })

  it('updateProspectPhone refuses a merged row in a reason the editor has words for', async () => {
    state.selectQueue.push([{ ...VERIFIED_ROW, status: 'merged' }])
    expect(await updateProspectPhone('pros_l', '4045559999')).toEqual({ ok: false, reason: 'merged' })
    expect(prospectUpdates()).toHaveLength(0)
  })
})

describe('the parked clock is the config’s on every rescore (P-03 fix pass 2 — V9)', () => {
  const TEMP_CLOSED = { ...VERIFIED_ROW, businessStatus: 'CLOSED_TEMPORARILY' }

  it('a reach logged on a temporarily-closed practice keeps "checking again in 14 days" when the config says 14', async () => {
    state.selectQueue.push([LIVE_ROW], [TEMP_CLOSED], [CONFIG_14])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const w = prospectUpdates().at(-1)!.values
    expect(w.qualityBand).toBe('parked')
    expect((w.qualityReasons as string[])[0]).toBe('Google lists it as temporarily closed — checking again in 14 days')
  })

  it('a hand-typed number on a verified, temporarily-closed practice rescores with the same clock', async () => {
    state.selectQueue.push([{ ...TEMP_CLOSED, phoneStatus: 'disconnected' }], [CONFIG_14])
    const r = await updateProspectPhone('pros_1', '4045559999')
    expect(r).toEqual({ ok: true, phone: '4045559999' })
    expect((prospectUpdates().at(-1)!.values.qualityReasons as string[])[0]).toContain('checking again in 14 days')
  })

  it('…and the shipped 30 is only what an unset config resolves to', async () => {
    state.selectQueue.push([LIVE_ROW], [TEMP_CLOSED]) // no config row → the defaults
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    expect((prospectUpdates().at(-1)!.values.qualityReasons as string[])[0]).toContain('checking again in 30 days')
  })
})

describe('the right number, from the drawer (C11)', () => {
  it('stores NANP ten digits with source caller, resets the standing, clears the old verdict, rescores — and the OLD number’s listing alt goes with it', async () => {
    state.selectQueue.push([
      {
        ...VERIFIED_ROW,
        phoneStatus: 'disconnected',
        verification: { ...VERIFIED_ROW.verification, phone: { ...VERIFIED_ROW.verification.phone, status: 'disconnected', source: 'caller', sources: ['caller'], alt: { number: '4045559999', source: 'places', at: '2026-11-01T00:00:00.000Z' } } },
      },
    ])
    const r = await updateProspectPhone('pros_1', '+1 (404) 555-9999')
    expect(r).toEqual({ ok: true, phone: '4045559999' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phone: '4045559999', phoneSource: 'caller', phoneStatus: 'unknown', phoneLineType: null, phoneValidatedAt: null })
    expect((w.verification as { phone: { status: string; source: string } }).phone).toMatchObject({ status: 'well_formed', source: 'caller', sources: ['caller'] })
    // The alt was a fact about the number that was replaced (W2): a fresh signal, no alt, no sentence.
    expect((w.verification as { phone: Record<string, unknown> }).phone).not.toHaveProperty('alt')
    expect((w.verification as { phone: { detail: string } }).phone.detail).not.toMatch(/Google lists/)
    // 35 + 12 (well-formed) + 15 + 10 + 10 — back from the hard zero.
    expect(w.qualityScore).toBe(82)
    expect(w.qualityBand).toBe('best')
  })

  it('refuses a number that cannot ring, naming why, and writes nothing', async () => {
    expect(await updateProspectPhone('pros_1', '555-0100')).toEqual({ ok: false, reason: 'not_ten_digits' })
    expect(await updateProspectPhone('pros_1', '(404) 555-0100')).toEqual({ ok: false, reason: 'fictional_555' })
    expect(prospectUpdates()).toHaveLength(0)
  })

  it('a never-verified row takes the number and sheds the caller’s hard zero on the OLD number — "not verified yet" again, never an invented score (C11)', async () => {
    // The hand-raiser: addManualProspect (status call_list, verifiedAt null)
    // → dialed from the queue → 'disconnected' logged → 0 / parked / the
    // disconnected reason written → the owner types the right number.
    state.selectQueue.push([
      {
        ...VERIFIED_ROW,
        status: 'call_list',
        verifiedAt: null,
        verification: { phone: { status: 'disconnected', detail: 'Number disconnected on 2026-11-09 (heard on a call)', checkedAt: '2026-11-09T00:00:00.000Z', source: 'caller' } },
        phoneStatus: 'disconnected',
        qualityScore: 0,
        qualityBand: 'parked',
        qualityReasons: ['Number disconnected on 2026-11-09 (heard on a call)'],
      },
    ])
    const r = await updateProspectPhone('pros_1', '4045559999')
    expect(r).toEqual({ ok: true, phone: '4045559999' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phone: '4045559999', phoneSource: 'caller', phoneStatus: 'unknown', phoneLineType: null })
    expect((w.verification as { phone: { status: string; source: string } }).phone).toMatchObject({ status: 'well_formed', source: 'caller' })
    // The stale verdict's zero and reason are gone with the number.
    expect(w).toMatchObject({ qualityScore: null, qualityBand: null, qualityReasons: null })
  })

  it('a never-verified row a call CLOSED keeps its disqualification — a new number does not resurrect a retired practice', async () => {
    state.selectQueue.push([{ ...VERIFIED_ROW, status: 'disqualified', verifiedAt: null, verification: null, qualityScore: 0, qualityBand: 'parked' }])
    await updateProspectPhone('pros_1', '4045559999')
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phone: '4045559999' })
    expect(w).not.toHaveProperty('qualityScore')
    expect(w).not.toHaveProperty('qualityBand')
  })
})
