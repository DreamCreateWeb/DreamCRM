import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeStediResponse } from '@/lib/stedi-eligibility'
import { FORM_PROCEDURES, insuranceTypeLabel, replacementWords, tierForCdt, type EligibilityRequest } from '@/lib/insurance-eligibility'

/**
 * The verification sheet's fields (2026-10-08), read from Stedi's own test-
 * mode mock 271 for Ameritas (Falcon Dent / Plaque Penguin — fictional data
 * Stedi publishes for exactly this). Captured on 2026-10-08 through the
 * 2026-06-01 endpoint; transport ids stripped. The point of a captured
 * fixture: the fields come from what the API actually sends, not from the
 * docs' example shapes — the first normalizer read `plan.name`, and the
 * real plan name rides `subscriber.additionalInformation.plan.name`.
 */
const MOCK = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'stedi-ameritas-mock.json'), 'utf8')) as Record<string, unknown>
const NOW = new Date('2026-10-08T15:00:00Z')

const REQ: EligibilityRequest = {
  patient: { firstName: 'Falcon', lastName: 'Dent', dateOfBirth: '1985-06-07' },
  carrierName: 'Ameritas',
  memberId: '007007007',
  groupNumber: null,
  relationship: 'self',
  subscriber: null,
  payerId: 'AMTAS00425',
  payerName: 'Ameritas',
}

describe('normalizeStediResponse — the verification sheet’s fields, from the captured mock', () => {
  const r = normalizeStediResponse(MOCK, REQ, NOW)

  it('is the active answer it always was, with the plan name read from where the payer put it', () => {
    expect(r.status).toBe('active')
    expect(r.planName).toBe('DENTAL PLAN PLUS')
    expect(r.annualMax).toEqual({ totalCents: 250_000, usedCents: 0, remainingCents: 250_000 })
  })

  it('plan facts: group and plan numbers, the insurance type, and a calendar benefit year for the year of the check', () => {
    expect(r.plan).toEqual({
      groupNumber: '5121024',
      groupName: null,
      planNumber: '1248163264',
      insuranceType: 'GROUP_POLICY',
      benefitYear: 'calendar',
      benefitYearStart: '2026-01-01',
      benefitYearEnd: '2026-12-31',
      networks: [],
      funding: null,
    })
    expect(insuranceTypeLabel(r.plan!.insuranceType)).toBe('Group plan')
  })

  it('the payer’s own contact: the number that answers, the fax, the email; no claims address when none was sent', () => {
    expect(r.payerContacts).toEqual({
      contacts: [{ name: 'CUSTOMER RELATIONS', phones: ['8004875553'], faxes: ['4023092580'], emails: ['GROUP@AMERITAS.COM'], urls: [] }],
      claimsAddress: null,
    })
  })

  it('what the deductible applies to, from the payer’s note on the deductible row', () => {
    expect(r.deductibleApplies).toEqual({ preventive: false, basic: true, major: true, note: 'BASIC/MAJOR/SELECT' })
  })

  it('eight tiers: the four the card had plus diagnostic, perio, endo and oral surgery; ortho priced at the patient’s full share is "not covered"', () => {
    expect(r.coveragePct).toEqual({ preventive: 100, basic: 100, major: 100, ortho: 0, diagnostic: 100, perio: 100, endo: 100, oralSurgery: 100 })
    // This payer prices in-and-out together — there is no separate OON side.
    expect(r.coveragePctOut).toBeNull()
  })

  it('a line per form procedure: allowance, next-eligible date and notes from the code’s rows; the percent says whether the code or its category was priced', () => {
    const by = new Map(r.procedures!.map((p) => [p.key, p]))
    expect(r.procedures!.map((p) => p.key)).toEqual(FORM_PROCEDURES.map((p) => p.key))
    expect(by.get('exam')).toMatchObject({ code: 'D0120', planPays: 100, pctSource: 'tier', limit: '2 per plan year', nextOn: '2024-06-13' })
    expect(by.get('fmx')).toMatchObject({ code: 'D0210', limit: '1 every 5 years', nextOn: '2028-12-08' })
    expect(by.get('bitewings')).toMatchObject({ code: 'D0272', limit: '1 per plan year' })
    expect(by.get('srp')).toMatchObject({ code: 'D4341', limit: '1 every 2 years' })
    expect(by.get('perio_maint')).toMatchObject({ limit: '2 per plan year', notes: ['CHARTING MAY BE REQUIRED FOR PERIODONTAL PROCEDURES.'] })
    // The occlusal guard is priced ON THE CODE at the patient's full share: not covered, and the sheet's YES/NO reads NO.
    expect(by.get('occlusal_guard')).toMatchObject({ code: 'D9944', planPays: 0, pctSource: 'code' })
    // The crown's "paid on prep date" rides the code's own notes; the boilerplate every row carries is stripped.
    expect(by.get('crown')).toMatchObject({ code: 'D2710', limit: '1 every 10 years', notes: ['PAID ON PREP DATE'] })
    for (const p of r.procedures!) expect(p.notes.join(' ')).not.toMatch(/SIMILAR PROCEDURES PERFORMED/)
  })

  it('replacement windows and the pays-on date, from the crown / denture limitation rows and their notes', () => {
    expect(r.replacement).toEqual({ crownBridgeMonths: 120, dentureMonths: 120, paysOn: 'prep' })
    expect(replacementWords(120)).toBe('10 years')
  })

  it('downgrades are the payer’s own sentences; age limits stay null when no age was stated', () => {
    expect(r.downgrades).toEqual([
      'CROWN - PORCELAIN AND RESIN BENEFITS ARE CONSIDERED FOR ANTERIOR AND BICUSPID TEETH ONLY.',
      'COMPOSITE - PORCELAIN AND RESIN BENEFITS ARE CONSIDERED FOR ANTERIOR AND BICUSPID TEETH ONLY.',
    ])
    expect(r.ageLimits).toBeNull()
  })

  it('the MISC box holds only the sentences that answer no line: once each, boilerplate stripped, the placed clauses gone', () => {
    const notes = r.payerNotes!
    expect(notes.length).toBeGreaterThan(5)
    expect(new Set(notes.map((n) => n.toUpperCase())).size).toBe(notes.length)
    expect(notes).not.toContain('SIMILAR PROCEDURES PERFORMED MAY IMPACT LIMITATION.')
    // Read into their own lines (missingToothClause, noWaitingPeriods, downgrades) — not repeated in the box.
    expect(notes).not.toContain('MISSING TOOTH EXCLUSION APPLIES.')
    expect(notes).not.toContain('THERE ARE NO WAITING PERIODS ON THIS PLAN.')
    for (const d of r.downgrades!) expect(notes).not.toContain(d)
    expect(notes.some((n) => /FINAL BENEFIT CALCULATION/.test(n))).toBe(true)
  })

  it('"no waiting periods" is read as a positive fact, not filed as a waiting period', () => {
    expect(r.noWaitingPeriods).toBe(true)
    expect(r.waitingPeriods).toEqual([])
    expect(r.notes.some((n) => /NO WAITING PERIODS/i.test(n))).toBe(false)
    expect(r.missingToothClause).toBe(true)
  })
})

/** A hand-built answer for the shapes the Ameritas mock does not exercise. */
function answer(benefits: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    payerId: '77777',
    payer: { name: { organization: 'DELTA DENTAL OF CALIFORNIA' }, address: { addressLine1: 'PO BOX 997330', city: 'SACRAMENTO', state: 'CA', postalCode: '95899' } },
    subscriber: {
      memberId: 'DD1',
      name: { person: { firstName: 'MIA', lastName: 'HAYES' } },
      dateOfBirth: '1988-03-12',
      dates: { plan: { start: '2026-07-01', end: '2027-06-30' } },
      additionalInformation: { group: { number: 'G-100', name: 'HARBOR LOGISTICS' } },
    },
    plans: [{ benefits: { statuses: [{ status: 'ACTIVE_COVERAGE', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '35' }, insuranceType: 'PREFERRED_PROVIDER_ORGANIZATION' }], ...benefits } }],
    ...extra,
  }
}

describe('normalizeStediResponse — the sheet’s fields, the other shapes', () => {
  it('a plan-year maximum reads the plan dates as the benefit year; the employer rides the group name; the payer’s address is the claims address', () => {
    const r = normalizeStediResponse(
      answer({
        outOfPocket: [{ amount: '1500', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '35' }, timePeriod: 'SERVICE_YEAR' }],
      }),
      { ...REQ, payerId: '77777' },
      NOW,
    )
    expect(r.plan).toMatchObject({ groupNumber: 'G-100', groupName: 'HARBOR LOGISTICS', insuranceType: 'PREFERRED_PROVIDER_ORGANIZATION', benefitYear: 'plan', benefitYearStart: '2026-07-01', benefitYearEnd: '2027-06-30' })
    expect(r.payerContacts).toEqual({ contacts: [], claimsAddress: 'PO BOX 997330, SACRAMENTO, CA 95899' })
  })

  it('a claims address on a benefit row’s related entity is found when the payer block has none', () => {
    const a = answer({
      limitations: [{ coverageLevel: 'INDIVIDUAL', messages: ['SEND CLAIMS TO'], relatedEntities: [{ type: 'PAYER', address: { addressLine1: '100 MAIN ST', addressLine2: 'STE 4', city: 'BOISE', state: 'ID', postalCode: '83702' } }] }],
    })
    delete (a.payer as Record<string, unknown>).address
    expect(normalizeStediResponse(a, REQ, NOW).payerContacts?.claimsAddress).toBe('100 MAIN ST, STE 4, BOISE, ID 83702')
  })

  it('deductible applies-to reads a "does not apply to preventive" note and a tier-scoped row', () => {
    const r = normalizeStediResponse(
      answer({
        deductible: [
          { amount: '50', coverageLevel: 'INDIVIDUAL', timePeriod: 'CALENDAR_YEAR', messages: ['DEDUCTIBLE DOES NOT APPLY TO PREVENTIVE SERVICES'] },
          { amount: '50', coverageLevel: 'INDIVIDUAL', timePeriod: 'CALENDAR_YEAR', service: { system: 'STC', value: '36' } },
        ],
      }),
      REQ,
      NOW,
    )
    expect(r.deductibleApplies).toMatchObject({ preventive: false, major: true })
  })

  it('age limits come out of the payer’s sentences on the fluoride, sealant and ortho rows', () => {
    const r = normalizeStediResponse(
      answer({
        coInsurance: [
          { percent: '0', coverageLevel: 'INDIVIDUAL', service: { system: 'CDT', value: 'D1206' }, messages: ['FLUORIDE COVERED THROUGH AGE 14'] },
          { percent: '0', coverageLevel: 'INDIVIDUAL', service: { system: 'CDT', value: 'D1351' }, messages: ['SEALANTS ON PERMANENT MOLARS UNDER AGE 16'] },
          { percent: '0.5', coverageLevel: 'INDIVIDUAL', service: { system: 'STC', value: '38' }, messages: ['ORTHODONTICS FOR DEPENDENT CHILDREN TO AGE 19'] },
        ],
        benefitDescription: [{ coverageLevel: 'INDIVIDUAL', messages: ['DEPENDENT CHILDREN COVERED THROUGH AGE 26'] }],
      }),
      REQ,
      NOW,
    )
    expect(r.ageLimits).toEqual({ fluoride: 14, sealants: 16, ortho: 19, dependent: 26 })
    const sealants = r.procedures!.find((p) => p.key === 'sealants')!
    expect(sealants).toMatchObject({ planPays: 100, pctSource: 'code' })
  })

  it('a procedure the payer never mentioned, on a plan with no priced tiers, is left off rather than invented', () => {
    const r = normalizeStediResponse(answer({}), REQ, NOW)
    expect(r.procedures).toEqual([])
    expect(r.replacement).toBeNull()
    expect(r.downgrades).toEqual([])
    expect(r.deductibleApplies).toBeNull()
  })

  it('tierForCdt follows the ADA ranges the per-code percent falls back on', () => {
    expect(tierForCdt('D0120')).toBe('diagnostic')
    expect(tierForCdt('D1110')).toBe('preventive')
    expect(tierForCdt('D2391')).toBe('basic')
    expect(tierForCdt('D2740')).toBe('major')
    expect(tierForCdt('D3310')).toBe('endo')
    expect(tierForCdt('D4341')).toBe('perio')
    expect(tierForCdt('D5110')).toBe('major')
    expect(tierForCdt('D7140')).toBe('oralSurgery')
    expect(tierForCdt('D8080')).toBe('ortho')
    expect(tierForCdt('nope')).toBeNull()
  })
})
