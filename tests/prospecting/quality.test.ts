import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeQualityScore, qualityBandForScore, qualityInput, isFullyVerified, QUALITY_WEIGHTS, NO_LIFE_CEILING, SINGLE_SOURCE_TURN_ON, CARRIER_ONLY_LINE } from '@/lib/prospect-quality'
import { PARKED_RECHECK_DAYS, PROSPECTING_DEFAULTS, type ProspectVerification, type VerificationSignal } from '@/lib/types/prospecting'

/**
 * THE QUALITY SCORE (P-01) — the matrix. Hard zeros for a record that is
 * not a practice we can reach, parked while a signal says wait, otherwise
 * the weighted sum. The opportunity score is a different number and is
 * never blended in.
 */

const NOW = new Date('2026-11-10T12:00:00Z')
const sig = (status: string, detail: string | null = null, source = 'test', at = NOW): VerificationSignal => ({
  status,
  detail,
  checkedAt: at.toISOString(),
  source,
})

const ALL_GOOD: ProspectVerification = {
  places: sig('matched'),
  business: sig('open'),
  npi: sig('active'),
  website: sig('alive'),
  phone: sig('valid'),
  reach: sig('reached', 'Someone picked up'),
}

function score(over: Partial<Parameters<typeof computeQualityScore>[0]> = {}) {
  return computeQualityScore({
    status: 'enriched',
    verification: ALL_GOOD,
    phoneStatus: 'valid',
    phoneLineType: 'landline',
    businessStatus: 'OPERATIONAL',
    reviewCount: 40,
    websiteUrl: 'https://smiledental.com',
    parkedRecheckDays: PARKED_RECHECK_DAYS,
    ...over,
  })
}

describe('bands', () => {
  it('best ≥ 80 · good ≥ 60 · weak ≥ 40 · parked otherwise', () => {
    expect(qualityBandForScore(100)).toBe('best')
    expect(qualityBandForScore(80)).toBe('best')
    expect(qualityBandForScore(79)).toBe('good')
    expect(qualityBandForScore(60)).toBe('good')
    expect(qualityBandForScore(59)).toBe('weak')
    expect(qualityBandForScore(40)).toBe('weak')
    expect(qualityBandForScore(39)).toBe('parked')
  })
})

describe('the weighted sum', () => {
  it('everything confirmed is 100 — best', () => {
    const r = score()
    expect(r.score).toBe(100)
    expect(r.band).toBe('best')
    expect(r.reasons).toContain('Google listing matched and open')
    expect(r.reasons).toContain('Phone validated: landline')
    expect(r.reasons).toContain('NPI active')
    expect(r.reasons).toContain('Website is up')
    expect(r.reasons).toContain('40 Google reviews')
  })

  it('the weights are the brief’s: 35 / 25 / 15 / 10 / 10 / 5', () => {
    expect(QUALITY_WEIGHTS).toMatchObject({ placesMatched: 35, phoneValid: 25, npiActive: 15, website: 10, reviews: 10, reach: 5 })
  })

  it('a well-formed number with the line check off earns half the phone credit', () => {
    const r = score({ verification: { ...ALL_GOOD, phone: sig('well_formed') }, phoneStatus: 'unknown', phoneLineType: null })
    expect(r.score).toBe(100 - 25 + 12)
    expect(r.reasons).toContain('Phone is well-formed — line not checked')
  })

  it('no website on a matched listing is the opportunity, not a fault', () => {
    const r = score({ verification: { ...ALL_GOOD, website: sig('none') }, websiteUrl: null })
    expect(r.score).toBe(100)
    expect(r.reasons).toContain('No website — the opportunity')
  })

  it('a redirected site earns nothing but is recorded, not judged', () => {
    const r = score({ verification: { ...ALL_GOOD, website: sig('redirected', 'smiledental.com now lands on bigdso.com') } })
    expect(r.score).toBe(90)
    expect(r.reasons).toContain('smiledental.com now lands on bigdso.com')
  })

  it('no Places match loses the 35 and the review credit — under the default floor', () => {
    const r = score({ verification: { ...ALL_GOOD, places: sig('no_match'), business: sig('unknown') }, businessStatus: null, reviewCount: null })
    expect(r.score).toBe(100 - 35 - 10)
    expect(r.band).toBe('weak')
    expect(r.reasons).toContain('No Google listing matched this practice')
  })

  it('zero reviews on a matched listing is a weak signal in words', () => {
    const r = score({ reviewCount: 0 })
    expect(r.score).toBe(90)
    expect(r.reasons).toContain('No Google reviews')
  })

  it('never exceeds 100 or drops below 0', () => {
    expect(score().score).toBeLessThanOrEqual(100)
    expect(score({ verification: {} as ProspectVerification, phoneStatus: 'unknown', phoneLineType: null }).score).toBeGreaterThanOrEqual(0)
  })
})

describe('hard zeros', () => {
  it('disqualified', () => {
    expect(score({ status: 'disqualified' })).toMatchObject({ score: 0, band: 'parked', reasons: ['Disqualified'] })
  })
  it.each(['invalid', 'disconnected', 'wrong_number'] as const)('phone %s', (phoneStatus) => {
    const r = score({ phoneStatus, verification: { ...ALL_GOOD, phone: sig(phoneStatus, `Number ${phoneStatus} on Nov 9, 2026`) } })
    expect(r.score).toBe(0)
    expect(r.band).toBe('parked')
    expect(r.reasons[0]).toContain(phoneStatus === 'wrong_number' ? 'wrong_number' : phoneStatus)
  })
  it('NPI retired carries the deactivation detail', () => {
    const r = score({ verification: { ...ALL_GOOD, npi: sig('retired', 'NPI deactivated 2024-03-01 — the practice has retired') } })
    expect(r).toMatchObject({ score: 0, band: 'parked', reasons: ['NPI deactivated 2024-03-01 — the practice has retired'] })
  })
  it('permanently closed', () => {
    expect(score({ businessStatus: 'CLOSED_PERMANENTLY' })).toMatchObject({ score: 0, reasons: ['Google lists it as permanently closed'] })
    expect(score({ verification: { ...ALL_GOOD, business: sig('closed') } }).score).toBe(0)
  })
})

describe('parked, in the project voice', () => {
  it('temporarily closed — the sentence names the parked clock it is given (the shipped 30 is only the default config)', () => {
    const r = score({ businessStatus: 'CLOSED_TEMPORARILY' })
    expect(r.band).toBe('parked')
    expect(r.reasons[0]).toBe('Google lists it as temporarily closed — checking again in 30 days')
    expect(score({ businessStatus: 'CLOSED_TEMPORARILY', parkedRecheckDays: 14 }).reasons[0]).toBe(
      'Google lists it as temporarily closed — checking again in 14 days',
    )
  })

  it('V9: qualityInput is THE builder — the clock comes from the resolved config (or a verify run’s context), never a literal', () => {
    const signals = { status: 'enriched', verification: ALL_GOOD, phoneStatus: 'valid', phoneLineType: 'landline', businessStatus: 'CLOSED_TEMPORARILY', reviewCount: 1, websiteUrl: null }
    const config = { ...PROSPECTING_DEFAULTS, hygiene: { ...PROSPECTING_DEFAULTS.hygiene, parkedRecheckDays: 14 } }
    expect(qualityInput(signals, config.hygiene).parkedRecheckDays).toBe(14)
    expect(computeQualityScore(qualityInput(signals, config.hygiene)).reasons[0]).toContain('checking again in 14 days')
    // A verify run's context carries the same number under the same name.
    expect(computeQualityScore(qualityInput(signals, { parkedRecheckDays: 21 })).reasons[0]).toContain('checking again in 21 days')
    // Every writer that rescores a row goes through it — the pure function
    // is never fed a bare literal outside this file.
    for (const file of ['lib/services/prospecting.ts', 'lib/services/prospect-verify.ts', 'lib/services/prospect-dedupe.ts']) {
      const src = readFileSync(file, 'utf8')
      const calls = src.match(/computeQualityScore\(/g) ?? []
      const built = src.match(/computeQualityScore\(\s*qualityInput\(/g) ?? []
      expect(calls.length, file).toBeGreaterThan(0)
      expect(built.length, file).toBe(calls.length)
      expect(src, file).not.toMatch(/PARKED_RECHECK_DAYS \}/)
    }
    // prospecting.ts rescores a logged call and a hand-typed number from the live config.
    const prospecting = readFileSync('lib/services/prospecting.ts', 'utf8')
    expect(prospecting.match(/config\.hygiene,\n/g)?.length).toBe(2)
  })
  it('a dead or parked website is a retired-practice signal, NOT "no website"', () => {
    const dead = score({ verification: { ...ALL_GOOD, website: sig('dead', 'smiledental.com no longer resolves (DNS)') } })
    expect(dead).toMatchObject({ score: 0, band: 'parked', reasons: ['smiledental.com no longer resolves (DNS)'] })
    const parked = score({ verification: { ...ALL_GOOD, website: sig('parked', 'smiledental.com shows a GoDaddy parking page') } })
    expect(parked).toMatchObject({ score: 0, band: 'parked' })
  })
  it('reasons are sentences, never raw tokens', () => {
    for (const r of [score(), score({ businessStatus: 'CLOSED_TEMPORARILY' }), score({ verification: { ...ALL_GOOD, places: sig('not_found') } })]) {
      for (const line of r.reasons) expect(line).not.toMatch(/^[a-z_]+$/)
    }
  })
})

describe('isFullyVerified', () => {
  it('every core signal inside 60 days', () => {
    expect(isFullyVerified(ALL_GOOD, NOW)).toBe(true)
    const { reach: _reach, ...noReach } = ALL_GOOD
    expect(isFullyVerified(noReach, NOW)).toBe(true)
  })
  it('a missing or stale signal is not verified', () => {
    const { phone: _phone, ...noPhone } = ALL_GOOD
    expect(isFullyVerified(noPhone, NOW)).toBe(false)
    const stale = { ...ALL_GOOD, npi: sig('active', null, 'nppes', new Date('2026-08-01T00:00:00Z')) }
    expect(isFullyVerified(stale, NOW)).toBe(false)
  })
})

// ── P-04: liveness from the listing + the two-source rule ───────────────────

describe('the phone, under the two-source rule', () => {
  const wellFormed = (extra: Record<string, unknown>) => ({ ...sig('well_formed', 'Well-formed US number — the line check is off', 'nanp'), ...extra })
  it('the registry and the listing agree → 20 (corroborated, line not checked)', () => {
    const r = score({ phoneStatus: 'unknown', phoneLineType: null, verification: { ...ALL_GOOD, phone: wellFormed({ sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'off' }) } })
    expect(r.score).toBe(95)
    expect(r.reasons).toContain('Registry and Google agree on this number — line not checked')
    expect(QUALITY_WEIGHTS.phoneCorroborated).toBe(20)
  })
  it('one source, the line check OFF → the well-formed 12 and "turn on the line check"', () => {
    const r = score({ phoneStatus: 'unknown', phoneLineType: null, verification: { ...ALL_GOOD, phone: wellFormed({ sources: ['places'], standing: 'single_source', lineCheck: 'off' }) } })
    expect(r.score).toBe(87)
    expect(r.reasons).toContain(SINGLE_SOURCE_TURN_ON)
    expect(SINGLE_SOURCE_TURN_ON).toBe('Only one source lists this number — turn on the line check to confirm it')
  })
  it('one source, the check configured but skipped → 12, "line not checked"', () => {
    const r = score({ phoneStatus: 'unknown', phoneLineType: null, verification: { ...ALL_GOOD, phone: wellFormed({ sources: ['nppes'], standing: 'single_source', lineCheck: 'skipped' }) } })
    expect(r.score).toBe(87)
    expect(r.reasons).toContain('Only one source lists this number — line not checked')
  })
  it('a legacy signal (no standing) scores as before', () => {
    const r = score({ phoneStatus: 'unknown', phoneLineType: null, verification: { ...ALL_GOOD, phone: wellFormed({}) } })
    expect(r.score).toBe(87)
    expect(r.reasons).toContain('Phone is well-formed — line not checked')
  })
  it('the carrier saying in service still scores the full 25 — no first-dial bucket', () => {
    expect(score().score).toBe(100)
  })
})

describe('reviews — recency-aware, the sample a LOWER BOUND, with the no-sign-of-life cap narrowed (C / H.4)', () => {
  const reviews = (status: string, latestAt: string | null, hours: boolean | null) => ({ ...sig(status, null, 'places'), latestAt, hours })
  it('current (≤6 months) 10 · quiet max(6, the count rule) · stale the count rule (never a cost) · none 0 — in words that say "top reviews"', () => {
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('recent', '2026-09-01T00:00:00.000Z', true) } })).toMatchObject({ score: 100 })
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('recent', '2026-09-01T00:00:00.000Z', true) } }).reasons).toContain('Google reviews are current — latest Sep 2026')
    // 40 reviews: the count rule's 10 — a quiet or stale sample costs nothing.
    const quiet = score({ verification: { ...ALL_GOOD, reviews: reviews('quiet', '2025-12-01T00:00:00.000Z', true) } })
    expect(quiet.score).toBe(100)
    expect(quiet.reasons).toContain("Google's top reviews run to Dec 2025")
    expect(QUALITY_WEIGHTS.reviewsQuiet).toBe(6)
    const stale = score({ verification: { ...ALL_GOOD, reviews: reviews('stale', '2024-01-01T00:00:00.000Z', true) } })
    expect(stale.score).toBe(100)
    expect(stale.reasons).toContain("Google's top reviews are all older than Jan 2024")
    // 2 reviews: quiet keeps its 6, stale earns nothing.
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('quiet', '2025-12-01T00:00:00.000Z', true) }, reviewCount: 2 }).score).toBe(96)
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('stale', '2024-01-01T00:00:00.000Z', true) }, reviewCount: 2 }).score).toBe(90)
    const none = score({ verification: { ...ALL_GOOD, reviews: reviews('none', null, true) }, reviewCount: 0 })
    expect(none.score).toBe(90)
    expect(none.reasons).toContain('No Google reviews')
  })
  it('a stale SAMPLE never drives the ceiling (C3): a 300-review practice whose top five are from 2023 and no hours is NOT capped; "no sign of life" never appears', () => {
    const r = score({ verification: { ...ALL_GOOD, reviews: reviews('stale', '2023-01-01T00:00:00.000Z', false) }, reviewCount: 300 })
    expect(r.score).toBe(100)
    expect(r.band).toBe('best')
    expect(r.reasons.join(' ')).not.toMatch(/no sign of life/)
    expect(r.reasons).toContain("Google's top reviews are all older than Jan 2023")
  })
  it('the ceiling: ZERO reviews on the listing AND no hours → "Google shows no sign of life — no reviews and no hours on the listing", band at most weak; a null count is unknown, not "no life"', () => {
    const never = score({ verification: { ...ALL_GOOD, reviews: reviews('none', null, false) }, reviewCount: 0 })
    expect(never.score).toBe(NO_LIFE_CEILING)
    expect(never.band).toBe('weak')
    expect(never.reasons[0]).toBe('Google shows no sign of life — no reviews and no hours on the listing')
    expect(NO_LIFE_CEILING).toBe(59)
    // Hours unknown (an older signal) never caps; a count the row does not hold never caps.
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('none', null, null) }, reviewCount: 0 }).band).toBe('best')
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('none', null, false) }, reviewCount: null }).band).toBe('best')
  })
  it('a NEW practice (H.4) with no reviews yet and no hours is not capped — the sentence says it is expected', () => {
    const at = NOW.toISOString()
    const fresh = { ...ALL_GOOD, reviews: reviews('none', null, false), fit: { newPractice: { status: 'new', detail: 'Opened Jun 2025 — no website yet is normal; now is the moment', checkedAt: at, source: 'nppes', enumeratedAt: '2025-06-15' } } }
    const r = score({ verification: fresh, reviewCount: 0 })
    expect(r.band).toBe('best')
    expect(r.reasons).toContain('No Google reviews yet — expected for a practice this new')
    expect(r.reasons.join(' ')).not.toMatch(/no sign of life/)
    // An established practice in the same state is capped.
    const old = { ...fresh, fit: { newPractice: { ...fresh.fit.newPractice, status: 'established' } } }
    expect(score({ verification: old, reviewCount: 0 }).band).toBe('weak')
  })
  it('the carrier-only sentence exists for the card (G.1)', () => {
    expect(CARRIER_ONLY_LINE).toBe("The line is in service — no source yet says it is this practice's number")
  })
  it('Google gave no dates → the P-01 count rule; a review signal with no matched listing is ignored', () => {
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('unknown', null, true) }, reviewCount: 40 }).score).toBe(100)
    expect(score({ verification: { ...ALL_GOOD, reviews: reviews('unknown', null, true) }, reviewCount: 2 }).score).toBe(90)
    const unmatched = score({ verification: { ...ALL_GOOD, places: sig('no_match'), reviews: reviews('recent', '2026-09-01T00:00:00.000Z', true) }, reviewCount: null })
    expect(unmatched.reasons.join(' ')).not.toMatch(/review/)
  })
})
