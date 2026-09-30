import { describe, it, expect } from 'vitest'
import {
  StediRetryableError,
  buildStediRequest,
  normalizeStediResponse,
  parsePayerSearch,
  pickUnambiguousPayer,
} from '@/lib/stedi-eligibility'
import type { EligibilityRequest } from '@/lib/insurance-eligibility'

/**
 * The pure half of the Stedi driver. Fixtures: the two real responses the
 * first live key produced (AAA 72 from Ameritas, AAA 76 from UnitedHealthcare),
 * Stedi's documented example shape for `plans[].benefits`, and a dental plan
 * assembled from their OpenAPI schema.
 */

const NOW = new Date('2026-09-30T15:00:00Z')

function req(overrides: Partial<EligibilityRequest> = {}): EligibilityRequest {
  return {
    patient: { firstName: 'Falcon', lastName: 'Dent', dateOfBirth: '1985-06-07' },
    carrierName: 'Ameritas',
    memberId: '007007007',
    groupNumber: null,
    relationship: 'self',
    subscriber: null,
    payerId: 'AMTAS00425',
    payerName: 'Ameritas',
    ...overrides,
  }
}

const AAA_72 = {
  payerId: 'AMTAS00425',
  payer: { name: { organization: 'AMERITAS LIFE INSURANCE CORP.' }, type: 'PAYER', identification: '10020' },
  provider: { name: { organization: 'PENGUIN' }, type: 'PROVIDER', npi: '1999999984' },
  subscriber: { dateOfBirth: '1985-06-07', name: { person: { firstName: 'FALCON', lastName: 'DENT' } }, memberId: '007007007' },
  id: 'ec_01a0f4ab',
  errors: [
    {
      code: '72',
      description: 'Invalid/Missing Subscriber/Insured ID',
      followupAction: 'Please Correct and Resubmit',
      location: 'SUBSCRIBER',
      possibleResolutions: "The subscriber's member ID is either missing or invalid.",
    },
  ],
}

const AAA_76 = {
  ...AAA_72,
  payerId: '87726',
  payer: { name: { organization: 'UNITEDHEALTHCARE' }, type: 'PAYER', identification: '87726' },
  errors: [{ code: '76', description: 'Duplicate Subscriber/Insured ID Number', followupAction: 'Please Correct and Resubmit', location: 'SUBSCRIBER' }],
}

/** A dental PPO answer in the current `plans[]` shape. */
const DENTAL_ACTIVE = {
  id: 'ec_test',
  payerId: '77777',
  payer: { name: { organization: 'DELTA DENTAL OF CALIFORNIA' } },
  subscriber: {
    memberId: 'DD1',
    name: { person: { firstName: 'MIA', lastName: 'HAYES' } },
    dateOfBirth: '1988-03-12',
    dates: { plan: { start: '2026-01-01', end: '2026-12-31' } },
  },
  plans: [
    {
      name: 'Delta Dental PPO',
      benefits: {
        statuses: [
          { status: 'ACTIVE_COVERAGE', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '35', definition: 'Dental Care' } },
        ],
        deductible: [
          { amount: '50', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '35' }, timePeriod: 'CALENDAR_YEAR' },
          { amount: '25', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '35' }, timePeriod: 'REMAINING' },
          { amount: '150', coverageLevel: 'FAMILY', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '35' }, timePeriod: 'CALENDAR_YEAR' },
        ],
        outOfPocket: [
          { amount: '1500', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '35' }, timePeriod: 'CALENDAR_YEAR' },
          { amount: '880', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '35' }, timePeriod: 'REMAINING' },
        ],
        coInsurance: [
          { percent: '0', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '41' } },
          { percent: '20', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '25' } },
          { percent: '0.5', coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_NETWORK' }, service: { system: 'STC', value: '36' } },
          { percent: '50', coverageLevel: 'INDIVIDUAL', network: { indicator: 'OUT_OF_NETWORK' }, service: { system: 'STC', value: '41' } },
        ],
        limitations: [
          { quantity: { qualifier: 'VISITS', value: '2' }, timePeriod: 'CALENDAR_YEAR', service: { system: 'CDT', value: 'D0120' }, coverageLevel: 'INDIVIDUAL' },
          { quantity: { qualifier: 'VISITS', value: '1' }, timePeriod: 'CALENDAR_YEAR', service: { system: 'CDT', value: 'D0274' }, coverageLevel: 'INDIVIDUAL' },
          { messages: ['12 MONTH WAITING PERIOD ON MAJOR SERVICES'], coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '36' } },
          { messages: ['MISSING TOOTH CLAUSE APPLIES'], coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '39' } },
        ],
      },
    },
  ],
}

describe('buildStediRequest', () => {
  it('asks the dental question with the patient as subscriber', () => {
    const body = buildStediRequest(req(), { payerId: 'AMTAS00425', npi: '1999999984', organizationName: 'Dream Dental' })
    expect(body).toEqual({
      payerId: 'AMTAS00425',
      provider: { npi: '1999999984', name: { organization: 'Dream Dental' } },
      subscriber: { memberId: '007007007', name: { person: { firstName: 'Falcon', lastName: 'Dent' } }, dateOfBirth: '1985-06-07' },
      encounter: { services: [{ system: 'STC', value: '35' }] },
    })
  })

  it('puts the policyholder as subscriber and the patient as dependent when they differ', () => {
    const body = buildStediRequest(
      req({ relationship: 'child', subscriber: { firstName: 'Ana', lastName: 'Dent', dateOfBirth: '1960-01-02' } }),
      { payerId: 'X', npi: '1999999984', organizationName: 'Dream Dental' },
    )
    expect(body.subscriber.name.person.firstName).toBe('Ana')
    expect(body.subscriber.dateOfBirth).toBe('1960-01-02')
    expect(body.dependent).toEqual({
      name: { person: { firstName: 'Falcon', lastName: 'Dent' } },
      dateOfBirth: '1985-06-07',
      relationToSubscriber: 'CHILD',
    })
  })
})

describe('normalizeStediResponse — payer rejections', () => {
  it('AAA 72 (invalid member id) is not_found, with the payer’s own words in the notes', () => {
    const r = normalizeStediResponse(AAA_72, req(), NOW)
    expect(r.status).toBe('not_found')
    expect(r.payerName).toBe('AMERITAS LIFE INSURANCE CORP.')
    expect(r.notes.join(' ')).toMatch(/Invalid\/Missing Subscriber\/Insured ID \(AAA 72\)/)
    expect(r.annualMax).toBeNull()
  })

  it('AAA 76 (duplicate id) needs a look', () => {
    expect(normalizeStediResponse(AAA_76, req(), NOW).status).toBe('needs_review')
  })

  it('payer-down codes throw a RETRYABLE error rather than a verdict', () => {
    const down = { ...AAA_72, errors: [{ code: '42', description: 'Unable to Respond at Current Time' }] }
    expect(() => normalizeStediResponse(down, req(), NOW)).toThrow(StediRetryableError)
  })

  it('provider/enrollment rejections throw a plain error (an error row, not a coverage claim)', () => {
    const bad = { ...AAA_72, errors: [{ code: '43', description: 'Invalid/Missing Provider Identification' }] }
    expect(() => normalizeStediResponse(bad, req(), NOW)).toThrow(/AAA 43/)
    expect(() => normalizeStediResponse(bad, req(), NOW)).not.toThrow(StediRetryableError)
  })
})

describe('normalizeStediResponse — benefits', () => {
  const r = normalizeStediResponse(DENTAL_ACTIVE, req({ carrierName: 'Delta Dental' }), NOW)

  it('reads status, plan name and plan dates', () => {
    expect(r.status).toBe('active')
    expect(r.planName).toBe('Delta Dental PPO')
    expect(r.payerName).toBe('DELTA DENTAL OF CALIFORNIA')
    expect(r.coverage).toEqual({ effective: '2026-01-01', termination: '2026-12-31' })
    expect(r.network).toBe('unknown')
  })

  it('prefers the individual in-network deductible and derives met from remaining', () => {
    expect(r.deductible).toEqual({ individualCents: 5_000, metCents: 2_500, remainingCents: 2_500 })
  })

  it('reads the annual maximum from out-of-pocket with remaining', () => {
    expect(r.annualMax).toEqual({ totalCents: 150_000, usedCents: 62_000, remainingCents: 88_000 })
  })

  it('turns the patient’s coinsurance share into plan-pays per tier, in-network first, and leaves unstated tiers null', () => {
    expect(r.coveragePct).toEqual({ preventive: 100, basic: 80, major: 50, ortho: null })
  })

  it('maps CDT frequency limits to the named rows', () => {
    expect(r.frequencies).toEqual([
      { code: 'exam', label: 'Exams', limit: '2 visits per calendar year', lastOn: null },
      { code: 'bitewings', label: 'Bitewing X-rays', limit: '1 visit per calendar year', lastOn: null },
    ])
  })

  it('surfaces waiting-period and missing-tooth messages honestly', () => {
    expect(r.missingToothClause).toBe(true)
    expect(r.notes).toContain('12 MONTH WAITING PERIOD ON MAJOR SERVICES')
  })

  it('an all-inactive status set is inactive; no plans at all needs a look', () => {
    const inactive = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    inactive.plans[0].benefits.statuses[0].status = 'INACTIVE'
    expect(normalizeStediResponse(inactive, req(), NOW).status).toBe('inactive')
    expect(normalizeStediResponse({ ...DENTAL_ACTIVE, plans: [] }, req(), NOW).status).toBe('needs_review')
  })

  it('an expired plan end date is called out even when the payer says active', () => {
    const stale = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    stale.subscriber.dates.plan.end = '2026-06-30'
    const out = normalizeStediResponse(stale, req(), NOW)
    expect(out.status).toBe('active')
    expect(out.notes.join(' ')).toMatch(/end date \(2026-06-30\) has passed/)
  })
})

describe('payer search', () => {
  const SEARCH = {
    items: [
      { payer: { stediId: 'QNJCP', displayName: 'Delta Dental of California', primaryPayerId: '77777', aliases: ['10705'], coverageTypes: ['dental'], operatingStates: ['CA'], transactionSupport: { eligibilityCheck: 'SUPPORTED' } }, score: 2454 },
      { payer: { stediId: 'RUPCP', displayName: 'Delta Dental of Kansas', primaryPayerId: 'CDKS1', aliases: [], coverageTypes: ['dental'], operatingStates: ['KS'], transactionSupport: { eligibilityCheck: 'SUPPORTED' } }, score: 3436 },
      { payer: { stediId: 'X', displayName: 'Broken', primaryPayerId: 'B1', transactionSupport: { eligibilityCheck: 'NOT_SUPPORTED' } }, score: 9 },
      { payer: { displayName: 'No id' }, score: 1 },
    ],
  }

  it('parses the fields the picker shows and drops rows without an id', () => {
    const out = parsePayerSearch(SEARCH)
    expect(out.map((p) => p.primaryPayerId)).toEqual(['77777', 'CDKS1', 'B1'])
    expect(out[0].operatingStates).toEqual(['CA'])
    expect(out[2].eligibilitySupported).toBe(false)
  })

  it('refuses an ambiguous name and accepts a clear winner', () => {
    expect(pickUnambiguousPayer(parsePayerSearch(SEARCH))).toBeNull()
    const single = { items: [SEARCH.items[0], SEARCH.items[3]] }
    expect(pickUnambiguousPayer(parsePayerSearch(single))?.primaryPayerId).toBe('77777')
    const clear = { items: [SEARCH.items[1], { ...SEARCH.items[0], score: 100 }] }
    expect(pickUnambiguousPayer(parsePayerSearch(clear))?.primaryPayerId).toBe('CDKS1')
    expect(pickUnambiguousPayer([])).toBeNull()
  })
})
