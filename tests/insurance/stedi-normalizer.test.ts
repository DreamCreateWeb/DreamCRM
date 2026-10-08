import { describe, it, expect } from 'vitest'
import {
  BLUE_PLAN_HINT,
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

  it('names the services the caller asks for — the Full breakdown’s codes — and the dental STC alone by default', () => {
    const body = buildStediRequest(req(), {
      payerId: 'AMTAS00425',
      npi: '1999999984',
      organizationName: 'Dream Dental',
      services: [
        { system: 'STC', value: '35' },
        { system: 'CDT', value: 'D0120' },
        { system: 'CDT', value: 'D2740' },
      ],
    })
    expect(body.encounter.services).toEqual([
      { system: 'STC', value: '35' },
      { system: 'CDT', value: 'D0120' },
      { system: 'CDT', value: 'D2740' },
    ])
    expect(buildStediRequest(req(), { payerId: 'X', npi: '1999999984', organizationName: 'D', services: [] }).encounter.services).toEqual([{ system: 'STC', value: '35' }])
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
    expect(r.coveragePct).toEqual({ preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: null, endo: null, oralSurgery: null })
    // The out-of-network side is read on its own — the 50% OON preventive row never leaks into the in-network tiers.
    expect(r.coveragePctOut).toEqual({ preventive: 50, basic: null, major: null, ortho: null, diagnostic: 50, perio: null, endo: null, oralSurgery: null })
  })

  it('maps CDT frequency limits to the named rows', () => {
    expect(r.frequencies).toEqual([
      { code: 'exam', label: 'Exams', limit: '2 visits per calendar year', lastOn: null, nextOn: null },
      { code: 'bitewings', label: 'Bitewing X-rays', limit: '1 visit per calendar year', lastOn: null, nextOn: null },
    ])
  })

  it('surfaces waiting-period and missing-tooth messages honestly', () => {
    expect(r.missingToothClause).toBe(true)
    expect(r.notes).toContain('12 MONTH WAITING PERIOD ON MAJOR SERVICES')
  })

  it('reads the FAMILY deductible into its own field instead of dropping it', () => {
    expect(r.familyDeductible).toEqual({ individualCents: 15_000, metCents: null, remainingCents: null })
    expect(r.familyMax).toBeNull()
  })

  it('a total-only maximum stays total-only — used and remaining are NOT invented', () => {
    const totalOnly = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    totalOnly.plans[0].benefits.outOfPocket = totalOnly.plans[0].benefits.outOfPocket.filter((e: { timePeriod: string }) => e.timePeriod !== 'REMAINING')
    totalOnly.plans[0].benefits.deductible = totalOnly.plans[0].benefits.deductible.filter((e: { timePeriod: string }) => e.timePeriod !== 'REMAINING')
    const out = normalizeStediResponse(totalOnly, req(), NOW)
    expect(out.annualMax).toEqual({ totalCents: 150_000, usedCents: null, remainingCents: null })
    expect(out.deductible).toEqual({ individualCents: 5_000, metCents: null, remainingCents: null })
  })

  it('a remaining-only maximum is kept rather than thrown away', () => {
    const remainingOnly = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    remainingOnly.plans[0].benefits.outOfPocket = remainingOnly.plans[0].benefits.outOfPocket.filter((e: { timePeriod: string }) => e.timePeriod === 'REMAINING')
    const out = normalizeStediResponse(remainingOnly, req(), NOW)
    expect(out.annualMax).toEqual({ totalCents: null, usedCents: null, remainingCents: 88_000 })
  })

  it('an ortho LIFETIME maximum (STC 38) lands in orthoLifetimeMax and never in the yearly maximum', () => {
    const withOrtho = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    withOrtho.plans[0].benefits.outOfPocket.push(
      { amount: '1500', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '38' }, timePeriod: 'LIFETIME' },
      { amount: '900', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '38' }, timePeriod: 'LIFETIME_REMAINING' },
    )
    withOrtho.plans[0].benefits.outOfPocket.push({ amount: '3000', coverageLevel: 'FAMILY', service: { system: 'STC', value: '35' }, timePeriod: 'CALENDAR_YEAR' })
    const out = normalizeStediResponse(withOrtho, req(), NOW)
    expect(out.orthoLifetimeMax).toEqual({ totalCents: 150_000, usedCents: 60_000, remainingCents: 90_000 })
    expect(out.annualMax).toEqual({ totalCents: 150_000, usedCents: 62_000, remainingCents: 88_000 })
    expect(out.familyMax).toEqual({ totalCents: 300_000, usedCents: null, remainingCents: null })
    // An ortho row stated only as a yearly figure for STC 38 is not this year's plan maximum either.
    const orthoYear = JSON.parse(JSON.stringify(DENTAL_ACTIVE))
    orthoYear.plans[0].benefits.outOfPocket = [{ amount: '1000', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '38' }, timePeriod: 'CALENDAR_YEAR' }]
    expect(normalizeStediResponse(orthoYear, req(), NOW).annualMax).toBeNull()
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

/**
 * Stedi's test-mode answer for their mock dental member (Ameritas,
 * 007007007), trimmed to the rows that matter. Three things it taught us:
 * the payer "name" can be an id, frequencies ride `serviceLimits`, and a
 * carry-over maximum shares the limitation rows with the real one.
 */
const STEDI_MOCK_271 = {
  payerId: 'AMTAS00425',
  payer: { name: { organization: '47009' }, type: 'PAYER', identification: 'AMTAS00425' },
  subscriber: {
    memberId: '007007007',
    name: { person: { firstName: 'FALCON', lastName: 'DENT' } },
    dateOfBirth: '1985-06-07',
    dates: { plan: { start: '2024-01-01', end: '2025-01-01' }, eligibility: { start: '2023-06-01' } },
  },
  plans: [
    {
      benefits: {
        statuses: [{ coverageLevel: 'INDIVIDUAL', insuranceType: 'GROUP_POLICY', service: { value: '35', definition: 'Dental Care', system: 'STC' }, status: 'ACTIVE_COVERAGE' }],
        deductible: [
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, messages: ['BASIC/MAJOR/SELECT'], timePeriod: 'CALENDAR_YEAR', amount: '50' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, messages: ['BASIC/MAJOR/SELECT'], timePeriod: 'REMAINING', amount: '50' },
        ],
        coInsurance: [
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: '35', system: 'STC' }, messages: ['TYPE 1 PROCEDURES COVERED AT 100% OF AMOUNT LISTED IN THE CERTIFICATE BOOKLET.'], percent: '0' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: '41', system: 'STC' }, percent: '0' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: '25', system: 'STC' }, percent: '0' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: '36', system: 'STC' }, percent: '0' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: '38', system: 'STC' }, percent: '1' },
        ],
        limitations: [
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, timePeriod: 'CALENDAR_YEAR', amount: '2500' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, timePeriod: 'REMAINING', amount: '2500' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, messages: ['ANNUAL CARRY OVER MAXIMUM.'], timePeriod: 'CALENDAR_YEAR', amount: '250' },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, messages: ['ANNUAL REMAINING CARRY OVER MAXIMUM.'], timePeriod: 'REMAINING', amount: '250' },
          { coverageLevel: 'INDIVIDUAL', messages: ['MISSING TOOTH EXCLUSION APPLIES.'] },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: 'D0120', system: 'CDT' }, messages: ['SIMILAR PROCEDURES PERFORMED MAY IMPACT LIMITATION.'], serviceLimits: [{ delivery: { quantity: { value: '2', qualifier: 'UNITS' }, period: { value: 1, qualifier: 'CONTRACT' } } }], dates: { service: { start: '2024-06-13' } } },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: 'D0210', system: 'CDT' }, serviceLimits: [{ delivery: { quantity: { value: '1', qualifier: 'UNITS' }, period: { value: 60, qualifier: 'MONTH' } } }], dates: { service: { start: '2028-12-08' } } },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: 'D0272', system: 'CDT' }, serviceLimits: [{ delivery: { quantity: { value: '1', qualifier: 'UNITS' }, period: { value: 1, qualifier: 'CONTRACT' } } }], dates: { service: { start: '2024-06-13' } } },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: 'D2710', system: 'CDT' }, messages: ['PAID ON PREP DATE'], serviceLimits: [{ delivery: { quantity: { value: '1', qualifier: 'UNITS' }, period: { value: 120, qualifier: 'MONTH' } } }] },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, service: { value: 'D4910', system: 'CDT' }, serviceLimits: [{ delivery: { quantity: { value: '2', qualifier: 'UNITS' }, period: { value: 1, qualifier: 'CONTRACT' } } }] },
          { coverageLevel: 'INDIVIDUAL', network: { indicator: 'IN_AND_OUT_OF_NETWORK' }, messages: ['NOT ALL PERIODONTAL PROCEDURE FREQUENCIES ARE INCLUDED IN THIS 271 RESPONSE.'] },
        ],
        exclusions: [{ coverageLevel: 'INDIVIDUAL', messages: ['THERE ARE NO WAITING PERIODS ON THIS PLAN.'] }],
      },
    },
  ],
}

describe('Stedi test-mode 271 (the mock dental member)', () => {
  const out = normalizeStediResponse(STEDI_MOCK_271, req(), new Date('2026-10-01T19:00:00Z'))

  it('is active with the maximum and deductible read from the limitation and deductible rows', () => {
    expect(out.status).toBe('active')
    expect(out.annualMax).toEqual({ totalCents: 250_000, usedCents: 0, remainingCents: 250_000 })
    expect(out.deductible).toEqual({ individualCents: 5_000, metCents: 0, remainingCents: 5_000 })
  })

  it('a carry-over maximum never masquerades as the annual maximum', () => {
    // Without the filter the 250 rows could win the "remaining" pick.
    expect(out.annualMax?.remainingCents).toBe(250_000)
  })

  it('falls back to the picked payer name when the payer sends an id where its name goes', () => {
    expect(out.payerName).toBe('Ameritas')
    const named = normalizeStediResponse({ ...STEDI_MOCK_271, payer: { name: { organization: 'AMERITAS LIFE' } } }, req(), NOW)
    expect(named.payerName).toBe('AMERITAS LIFE')
  })

  it('reads coinsurance as a decimal share: 0 → plan pays 100, 1 → plan pays nothing', () => {
    expect(out.coveragePct).toMatchObject({ preventive: 100, basic: 100, major: 100, ortho: 0 })
  })

  it('turns serviceLimits into frequency rows with the next eligible date', () => {
    const byCode = Object.fromEntries(out.frequencies.map((f) => [f.code === 'other' ? f.label : f.code, f]))
    expect(byCode.exam).toMatchObject({ label: 'Exams', limit: '2 per plan year', nextOn: '2024-06-13' })
    expect(byCode.fmx).toMatchObject({ label: 'Full-mouth X-rays', limit: '1 every 60 months', nextOn: '2028-12-08' })
    expect(byCode.bitewings).toMatchObject({ limit: '1 per plan year' })
    expect(byCode['Crowns']).toMatchObject({ code: 'other', limit: '1 every 120 months', nextOn: null })
    expect(byCode['Perio maintenance']).toMatchObject({ code: 'other', limit: '2 per plan year' })
    // Rows that are only a sentence never become a frequency line.
    expect(out.frequencies.some((f) => /NOT ALL PERIODONTAL/i.test(f.label))).toBe(false)
  })

  it('reads the missing-tooth clause and keeps the plan-ended caveat', () => {
    expect(out.missingToothClause).toBe(true)
    expect(out.notes.join(' ')).toMatch(/end date \(2025-01-01\) has passed/)
  })
})

describe('provider rejections and Blue-plan hints', () => {
  const aaa = (code: string, description: string, org = 'BLUE ADVANTAGE') => ({
    ...AAA_72,
    payer: { name: { organization: org }, type: 'PAYER' },
    errors: [{ code, description, location: 'PROVIDER' }],
  })

  it('AAA 51 (provider not on file) is a setup error that names the NPI, never a retry', () => {
    const run = () => normalizeStediResponse(aaa('51', 'Provider Not on File'), req({ carrierName: 'Blue Advantage' }), NOW)
    expect(run).toThrow(/NPI/)
    expect(run).toThrow(/Business profile/)
    expect(run).not.toThrow(StediRetryableError)
    for (const code of ['41', '43', '50']) expect(() => normalizeStediResponse(aaa(code, 'Provider'), req(), NOW)).toThrow(/NPI/)
  })

  it('a Blue-plan "not found" carries the prefix / Blue Advantage hint; other payers do not', () => {
    const blue = normalizeStediResponse(
      { ...AAA_72, payer: { name: { organization: 'ARKANSAS BLUE CROSS AND BLUE SHIELD' } }, errors: [{ code: '75', description: 'Subscriber/Insured Not Found' }] },
      req({ carrierName: 'Arkansas Blue Cross and Blue Shield', payerName: 'Arkansas Blue Cross and Blue Shield' }),
      NOW,
    )
    expect(blue.status).toBe('not_found')
    expect(blue.notes).toContain(BLUE_PLAN_HINT)
    const other = normalizeStediResponse(AAA_72, req(), NOW)
    expect(other.notes).not.toContain(BLUE_PLAN_HINT)
  })
})
