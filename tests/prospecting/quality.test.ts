import { describe, it, expect } from 'vitest'
import { computeQualityScore, qualityBandForScore, isFullyVerified, QUALITY_WEIGHTS } from '@/lib/prospect-quality'
import type { ProspectVerification, VerificationSignal } from '@/lib/types/prospecting'

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
  it('temporarily closed — the sentence names the live parked clock (the shipped 30 by default)', () => {
    const r = score({ businessStatus: 'CLOSED_TEMPORARILY' })
    expect(r.band).toBe('parked')
    expect(r.reasons[0]).toBe('Google lists it as temporarily closed — checking again in 30 days')
    expect(score({ businessStatus: 'CLOSED_TEMPORARILY', parkedRecheckDays: 14 }).reasons[0]).toBe(
      'Google lists it as temporarily closed — checking again in 14 days',
    )
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
