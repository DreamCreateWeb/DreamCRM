import { describe, it, expect } from 'vitest'
import {
  INSURANCE_DRIVER_LABEL,
  SANDBOX_STEERING,
  STATUS_LABEL,
  STATUS_TONE,
  VERIFICATION_FRESH_DAYS,
  benefitDollars,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  hasAnyAmount,
  isPracticeDriver,
  isStaleCheck,
  ledgerSummaryForCheck,
  requestFromOnFile,
  resolveInsuranceDriverId,
  summarizeCheckForTimeline,
  validateEligibilityRequest,
  type EligibilityStatus,
} from '@/lib/insurance-eligibility'

/**
 * The client-safe core of the insurance tool: request validation (the same
 * gate on both sides), the driver switch, the status → tone contract and the
 * honesty labels.
 */

const NOW = new Date('2026-09-30T15:00:00Z')

function good() {
  return {
    patient: { firstName: ' Mia ', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
    carrierName: 'Delta Dental',
    memberId: 'DD-100-2231',
    groupNumber: '',
    relationship: 'self',
    subscriber: null,
  }
}

describe('validateEligibilityRequest', () => {
  it('accepts a complete self-subscriber request and trims it', () => {
    const r = validateEligibilityRequest(good(), NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.patient.firstName).toBe('Mia')
    expect(r.value.groupNumber).toBeNull()
    expect(r.value.subscriber).toBeNull()
    expect(r.value.relationship).toBe('self')
  })

  it('names every missing field rather than the first one', () => {
    const r = validateEligibilityRequest({ ...good(), patient: { firstName: '', lastName: '', dateOfBirth: '' }, carrierName: '', memberId: '' }, NOW)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(
      ['carrierName', 'memberId', 'patient.dateOfBirth', 'patient.firstName', 'patient.lastName'].sort(),
    )
  })

  it('rejects a malformed, impossible, or future date of birth', () => {
    for (const dob of ['12/03/1988', '1988-13-01', '1988-02-30', '2027-01-01']) {
      const r = validateEligibilityRequest({ ...good(), patient: { ...good().patient, dateOfBirth: dob } }, NOW)
      expect(r.ok, dob).toBe(false)
      if (!r.ok) expect(r.errors['patient.dateOfBirth']).toBeTruthy()
    }
  })

  it('needs at least three characters of member id once spaces and dashes are stripped', () => {
    const r = validateEligibilityRequest({ ...good(), memberId: ' 1- 2 ' }, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.memberId).toBeTruthy()
  })

  it('requires the policyholder when the patient is not the subscriber', () => {
    const r = validateEligibilityRequest({ ...good(), relationship: 'child', subscriber: null }, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors['subscriber.firstName']).toBeTruthy()
    const ok = validateEligibilityRequest(
      { ...good(), relationship: 'child', subscriber: { firstName: 'Ana', lastName: 'Hayes', dateOfBirth: '1960-01-02' } },
      NOW,
    )
    expect(ok.ok).toBe(true)
  })

  it('treats junk input as an empty form rather than throwing', () => {
    expect(validateEligibilityRequest(null, NOW).ok).toBe(false)
    expect(validateEligibilityRequest('nope', NOW).ok).toBe(false)
    const r = validateEligibilityRequest({ ...good(), relationship: 'dog' }, NOW)
    expect(r.ok && r.value.relationship).toBe('self')
  })
})

describe('resolveInsuranceDriverId', () => {
  it('defaults to the sandbox and floors unknown values there too', () => {
    expect(resolveInsuranceDriverId({})).toBe('sandbox')
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: '' })).toBe('sandbox')
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: 'SANDBOX' })).toBe('sandbox')
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: 'clearinghouse-typo' })).toBe('sandbox')
  })

  it('stedi is test mode unless STEDI_MODE is literally live — never sniffed from the key', () => {
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: 'stedi' })).toBe('stedi_test')
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: 'stedi', STEDI_MODE: 'test' })).toBe('stedi_test')
    expect(resolveInsuranceDriverId({ INSURANCE_DRIVER: 'Stedi', STEDI_MODE: 'LIVE' })).toBe('stedi')
  })

  it('the sandbox and Stedi test mode are practice drivers with honest labels; live Stedi is not', () => {
    expect(isPracticeDriver('sandbox')).toBe(true)
    expect(isPracticeDriver('stedi_test')).toBe(true)
    expect(isPracticeDriver('stedi')).toBe(false)
    expect(INSURANCE_DRIVER_LABEL.sandbox.pill).toBe('Practice answer')
    expect(INSURANCE_DRIVER_LABEL.sandbox.title).toMatch(/not a real payer check/i)
    expect(INSURANCE_DRIVER_LABEL.stedi_test.title).toMatch(/not this patient/i)
    expect(INSURANCE_DRIVER_LABEL.stedi.title).toMatch(/estimate/i)
  })

  it('a picked payer rides through validation; blanks become null', () => {
    const r = validateEligibilityRequest({ ...good(), payerId: ' 77777 ', payerName: 'Delta Dental of California' }, NOW)
    expect(r.ok && r.value.payerId).toBe('77777')
    const none = validateEligibilityRequest({ ...good(), payerId: '' }, NOW)
    expect(none.ok && none.value.payerId).toBeNull()
  })
})

describe('status → tone', () => {
  const ALL: EligibilityStatus[] = ['active', 'inactive', 'not_found', 'needs_review', 'error']

  it('covers every status with a semantic tone and a label', () => {
    for (const s of ALL) {
      expect(STATUS_TONE[s]).toBeTruthy()
      expect(STATUS_LABEL[s]).toBeTruthy()
    }
  })

  it('a failed check is warn (ours to retry), never urgent (which would read as no coverage)', () => {
    expect(STATUS_TONE.error).toBe('warn')
    expect(STATUS_TONE.inactive).toBe('urgent')
    expect(STATUS_TONE.active).toBe('ok')
  })
})

describe('copy helpers', () => {
  it('summarizeCheckForTimeline appends the practice note only for a practice driver', () => {
    const base = { status: 'active' as const, input: { ...good(), groupNumber: null, relationship: 'self' as const, subscriber: null, patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' } }, result: null }
    const sandbox = summarizeCheckForTimeline({ ...base, driver: 'sandbox' })
    expect(sandbox.title).toBe('Insurance check — Active')
    expect(sandbox.subtitle).toBe('Delta Dental · practice answer')
  })

  it('ledgerSummaryForCheck reads in the narrator voice and names the practice answer', () => {
    const line = ledgerSummaryForCheck(
      { status: 'inactive', driver: 'sandbox', input: { ...good(), groupNumber: null, relationship: 'self', subscriber: null, patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' } } },
      'Mia Hayes',
    )
    expect(line).toBe('Looked up Mia Hayes’ Delta Dental benefits — not active (practice answer)')
  })

  it('requestFromOnFile builds a self-subscriber request from the patient columns', () => {
    const r = requestFromOnFile({ firstName: 'Mia', lastName: 'Hayes', dateOfBirth: null, insuranceProvider: 'Cigna', insurancePolicyNumber: 'C1', insuranceGroupNumber: null })
    expect(r.patient?.dateOfBirth).toBe('')
    expect(r.carrierName).toBe('Cigna')
    expect(r.relationship).toBe('self')
  })

  it('benefitDollars rounds cents to whole dollars with separators', () => {
    expect(benefitDollars(88_000)).toBe('$880')
    expect(benefitDollars(170_050)).toBe('$1,701')
  })

  it('every steering suffix is four digits (the sandbox reads the trailing digits)', () => {
    for (const s of SANDBOX_STEERING) expect(s.suffix).toMatch(/^\d{4}$/)
  })
})

describe('describeBenefitAmount — the one home for dollar wording', () => {
  it('both ends stated: left, of total, used derived by arithmetic', () => {
    expect(describeBenefitAmount({ totalCents: 250_000, usedCents: null, remainingCents: 124_000 }, 'max')).toEqual({
      headline: '$1,240 left',
      sub: 'of $2,500 · $1,260 used',
      fractionUsed: 126_000 / 250_000,
      caveat: false,
    })
  })

  it('only the total stated: "Up to", a caveat, and NO ring fuel', () => {
    const c = describeBenefitAmount({ totalCents: 250_000, usedCents: null, remainingCents: null }, 'max')
    expect(c).toEqual({ headline: 'Up to $2,500', sub: 'the payer didn’t say how much is used', fractionUsed: null, caveat: true })
  })

  it('only remaining stated: left, with the missing total named', () => {
    const c = describeBenefitAmount({ totalCents: null, usedCents: null, remainingCents: 42_000 }, 'max')
    expect(c).toEqual({ headline: '$420 left', sub: 'the payer didn’t say the yearly maximum', fractionUsed: null, caveat: true })
  })

  it('nothing left reads as all used; nothing stated at all is null', () => {
    expect(describeBenefitAmount({ totalCents: 150_000, usedCents: 150_000, remainingCents: 0 }, 'max')?.sub).toBe('of $1,500 · all used this year')
    expect(describeBenefitAmount({ totalCents: null, usedCents: null, remainingCents: null }, 'max')).toBeNull()
    expect(describeBenefitAmount(null, 'max')).toBeNull()
    expect(hasAnyAmount({ totalCents: null, usedCents: null, remainingCents: null })).toBe(false)
  })

  it('the deductible speaks in "met": met for the year, left of total, or the honest caveats', () => {
    expect(describeBenefitAmount(deductibleAsAmount({ individualCents: 5_000, metCents: 5_000, remainingCents: 0 }), 'deductible')).toMatchObject({
      headline: 'Met',
      sub: 'the $50 deductible is met for the year',
      caveat: false,
    })
    expect(describeBenefitAmount(deductibleAsAmount({ individualCents: 5_000, metCents: null, remainingCents: 2_500 }), 'deductible')).toMatchObject({
      headline: '$25 left',
      sub: 'of $50 · $25 met',
      fractionUsed: 0.5,
    })
    expect(describeBenefitAmount(deductibleAsAmount({ individualCents: 5_000, metCents: null, remainingCents: null }), 'deductible')).toEqual({
      headline: '$50',
      sub: 'the payer didn’t say how much is met',
      fractionUsed: null,
      caveat: true,
    })
    expect(describeBenefitAmount(deductibleAsAmount({ individualCents: null, metCents: null, remainingCents: 2_500 }), 'deductible')?.sub).toBe('the payer didn’t say the full deductible')
    expect(describeBenefitAmount(deductibleAsAmount({ individualCents: null, metCents: 2_500, remainingCents: null }), 'deductible')).toMatchObject({ headline: '$25 met', caveat: true })
    expect(deductibleAsAmount(null)).toBeNull()
  })

  it('the fraction is capped at 1 and never drawn from a zero total', () => {
    expect(describeBenefitAmount({ totalCents: 100, usedCents: 500, remainingCents: null }, 'max')?.fractionUsed).toBe(1)
    expect(describeBenefitAmount({ totalCents: 0, usedCents: 0, remainingCents: 0 }, 'max')?.fractionUsed).toBeNull()
  })
})

describe('staleness', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

  it(`a check is stale strictly after ${VERIFICATION_FRESH_DAYS} days`, () => {
    expect(isStaleCheck(daysAgo(VERIFICATION_FRESH_DAYS), now)).toBe(false)
    expect(isStaleCheck(daysAgo(VERIFICATION_FRESH_DAYS + 1), now)).toBe(true)
    expect(isStaleCheck(daysAgo(0), now)).toBe(false)
    expect(isStaleCheck('not a date', now)).toBe(true)
  })

  it('checkAgeLabel reads like a person', () => {
    expect(checkAgeLabel(daysAgo(0), now)).toBe('today')
    expect(checkAgeLabel(daysAgo(0.5), now)).toBe('today')
    expect(checkAgeLabel(daysAgo(1), now)).toBe('yesterday')
    expect(checkAgeLabel(daysAgo(6), now)).toBe('6 days ago')
    expect(checkAgeLabel(daysAgo(7), now)).toBe('a week ago')
    expect(checkAgeLabel(daysAgo(20), now)).toBe('2 weeks ago')
    expect(checkAgeLabel(daysAgo(45), now)).toBe('a month ago')
    expect(checkAgeLabel(daysAgo(200), now)).toBe('6 months ago')
    expect(checkAgeLabel(daysAgo(400), now)).toBe('over a year ago')
    expect(checkAgeLabel('junk', now)).toBe('some time ago')
  })
})
