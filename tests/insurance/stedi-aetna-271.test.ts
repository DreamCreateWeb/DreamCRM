import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeStediResponse } from '@/lib/stedi-eligibility'
import { FREQ_TO_KEY, fundingWords, lineFacts, networkWords, scopeWords, sharesWords, type EligibilityRequest } from '@/lib/insurance-eligibility'
import { procedureAnswered } from '@/lib/insurance-breakdown'

/**
 * THE AETNA 271 (2026-10-08): the first real payer the client checked, a
 * child on a parent's PPO, captured through the live endpoint and redacted
 * (names, ids, dates of birth and the raw X12 replaced; every benefit row
 * kept). It broke the sheet four ways, pinned here: plan RULES stamped
 * FAMILY (every percent, frequency and scope) were filtered out; "1 every
 * 60 MONTHS" rides `delivery.frequency`, not `period`; "2 remaining" with
 * the last visit's date is a second row on the same line, which the dedupe
 * threw away; and every sentence landed in the MISC box.
 */
const AETNA = JSON.parse(readFileSync(join(process.cwd(), 'tests/insurance/fixtures/stedi-aetna-ppo-redacted.json'), 'utf8')) as Record<string, unknown>
const NOW = new Date('2026-10-08T15:00:00Z')
const req: EligibilityRequest = {
  patient: { firstName: 'Sam', lastName: 'Sample', dateOfBirth: '2020-01-01' },
  carrierName: 'Aetna',
  memberId: 'W000000000',
  groupNumber: null,
  relationship: 'self',
  subscriber: null,
  payerId: '60054',
  payerName: 'Aetna',
}

describe('normalizeStediResponse — the Aetna PPO 271', () => {
  const r = normalizeStediResponse(AETNA, req, NOW)

  it('is active, with the plan named on the status row and the dependent’s own plan start', () => {
    expect(r.status).toBe('active')
    expect(r.payerName).toBe('AETNA INC')
    expect(r.planName).toBe('PPO Dental 2000')
    expect(r.coverage).toEqual({ effective: '2025-09-01', termination: null })
  })

  it('reads the money: the maximum and what is left, the deductible, the ortho lifetime pot labelled only by a word', () => {
    expect(r.annualMax).toEqual({ totalCents: 150_000, usedCents: 15_700, remainingCents: 134_300 })
    expect(r.deductible).toEqual({ individualCents: 5_000, metCents: 0, remainingCents: 5_000 })
    expect(r.orthoLifetimeMax).toEqual({ totalCents: 150_000, usedCents: 0, remainingCents: 150_000 })
  })

  it('reads the tiers off FAMILY-level rows — a plan rule is plan-wide, whatever level the payer stamps on it', () => {
    expect(r.coveragePct).toEqual({ preventive: 100, basic: 80, major: 50, ortho: 50, diagnostic: 100, perio: 80, endo: 80, oralSurgery: null })
  })

  it('plan facts: group, employer, PPO, calendar year, the three networks and self-funding', () => {
    expect(r.plan).toMatchObject({
      groupNumber: '000000000000000',
      groupName: 'SAMPLE EMPLOYER',
      planNumber: '0000000',
      insuranceType: 'PREFERRED_PROVIDER_ORGANIZATION_PPO',
      benefitYear: 'calendar',
      networks: ['STANDARD DENTAL NETWORK', 'PPO II NETWORK', 'DENTAL EXTEND NETWORK'],
      funding: 'self',
    })
    expect(networkWords(r.plan!.networks)).toBe('Standard Dental, PPO II, Dental Extend networks')
    expect(fundingWords(r.plan!.funding)).toBe('Self-funded plan')
    expect(r.payerContacts?.claimsAddress).toBe('PO Box 14094, Lexington, KY 40512')
  })

  it('the deductible applies to basic and major and is waived on preventive — from the waivers on the category rows, with adjunctive (STC 28) not speaking for basic', () => {
    expect(r.deductibleApplies).toEqual({ preventive: false, basic: true, major: true, note: null })
  })

  it('frequencies are MERGED per line: the allowance, what is left, the last visit, the scope, the shared codes and the waiver', () => {
    const by = Object.fromEntries(r.frequencies.map((f) => [f.label, f]))
    expect(by['Diagnostic (exams & x-rays)']).toEqual({
      code: 'other',
      label: 'Diagnostic (exams & x-rays)',
      limit: '3 per calendar year',
      lastOn: '2026-04-01',
      nextOn: null,
      remaining: 2,
      scope: 'per full mouth',
      sharesWith: ['D0145', 'D0150', 'D0180'],
      noDeductible: true,
    })
    expect(by['Preventive (cleanings & fluoride)']).toMatchObject({ limit: '3 per calendar year', remaining: 2, lastOn: '2026-04-01', sharesWith: ['D1120', 'D4346'], noDeductible: true })
    // "1 every 60 MONTHS" rides delivery.frequency — in years at a desk.
    expect(by['Crowns']).toMatchObject({ limit: '1 every 5 years', scope: 'teeth 1–32', sharesWith: ['D2960', 'D2961', 'D2962', 'D2975', 'D2510-D2794'] })
    expect(by['Dentures & bridges']).toMatchObject({ limit: '1 every 5 years', scope: 'teeth 1–16' })
    expect(by['Dentures & bridges'].noDeductible).toBeUndefined()
    expect(r.frequencies).toHaveLength(4)
    // Every category row answers a category, not a sheet line.
    for (const f of r.frequencies) expect(FREQ_TO_KEY[f.code]).toBeUndefined()
    expect(lineFacts(by['Diagnostic (exams & x-rays)'])).toEqual(['per full mouth', 'counts with D0145, D0150, D0180', 'no deductible', '2 left this period'])
  })

  it('replacement windows come off the STC rows when the payer counts by category; the dependent age off "CHLD TO 26"', () => {
    expect(r.replacement).toEqual({ crownBridgeMonths: 60, dentureMonths: 60, paysOn: null })
    expect(r.ageLimits).toEqual({ fluoride: null, sealants: null, ortho: null, dependent: 26 })
  })

  it('the procedure lines carry the category rate only — nothing specific was asked on a code, so none counts as answered', () => {
    expect(r.procedures!.map((p) => p.key).length).toBe(15)
    for (const p of r.procedures!) {
      expect(p.pctSource).toBe('tier')
      expect(procedureAnswered(p)).toBe(false)
    }
  })

  it('every sentence is placed: the MISC box holds only what answers no line', () => {
    expect(r.missingToothClause).toBe(true)
    expect(r.downgrades).toEqual(['ALTERNATE BENEFITS MAY APPLY'])
    expect(r.payerNotes).toEqual(['Not covered: Maxillofacial Prosthetics'])
    expect(r.notes).toEqual([])
  })
})

describe('the sentence sorter — the shapes payers write in', () => {
  function withLimits(rows: unknown[], extra: Record<string, unknown> = {}) {
    return normalizeStediResponse(
      {
        payer: { name: { organization: 'P' } },
        subscriber: { memberId: 'M', name: { person: { firstName: 'A', lastName: 'B' } }, dateOfBirth: '1990-01-01' },
        plans: [{ benefits: { statuses: [{ status: 'ACTIVE_COVERAGE', service: { system: 'STC', value: '35' } }], limitations: rows, ...extra } }],
      },
      req,
      NOW,
    )
  }

  it('a comma-joined message splits only when every piece is a known fact; a sentence with commas stays whole', () => {
    const r = withLimits([
      { service: { system: 'CDT', value: 'D0120' }, serviceLimits: [{ delivery: { quantity: { value: '2' }, period: { value: 1, qualifier: 'CALENDAR_YEAR' } } }], messages: ['Shares frequency with D0145,D0150,DEDUCTIBLE DOES NOT APPLY'] },
      { service: { system: 'CDT', value: 'D1351' }, serviceLimits: [{ delivery: { quantity: { value: '1' }, period: { value: 3, qualifier: 'YEARS' } } }], messages: ['PRETREATMENTS ARE RECOMMENDED, BUT NOT REQUIRED, ANY TIME TOTAL EXPENSES EXCEED $200.', 'TOOTH NUMBER 02 TO 03 14 TO 15,TOOTH NUMBER 18 TO 19 30 TO 31'] },
    ])
    const exam = r.procedures!.find((p) => p.key === 'exam')!
    expect(exam).toMatchObject({ limit: '2 per calendar year', sharesWith: ['D0145', 'D0150'], deductibleApplies: false, notes: [] })
    const seal = r.procedures!.find((p) => p.key === 'sealants')!
    expect(seal.scope).toBe('teeth 2–3, 14–15, 18–19, 30–31')
    expect(seal.notes).toEqual(['PRETREATMENTS ARE RECOMMENDED, BUT NOT REQUIRED, ANY TIME TOTAL EXPENSES EXCEED $200.'])
    expect(r.payerNotes).toEqual(['PRETREATMENTS ARE RECOMMENDED, BUT NOT REQUIRED, ANY TIME TOTAL EXPENSES EXCEED $200.'])
  })

  it('counters and bare category words are payer-internal and vanish; a structured age ceiling reads into the age limits', () => {
    const r = withLimits([
      { service: { system: 'STC', value: '41' }, serviceLimits: [{ delivery: { quantity: { value: '2', qualifier: 'VISITS' }, period: { value: 1, qualifier: 'CALENDAR_YEAR' } } }], messages: ['DENTAL PROPHYLAXIS COUNTER', 'Preventative'] },
      { service: { system: 'CDT', value: 'D1206' }, serviceLimits: [{ ageMaximum: 14 }] },
      { service: { system: 'STC', value: '38' }, serviceLimits: [{ ageMaximum: 99 }] },
    ])
    expect(r.payerNotes).toEqual([])
    expect(r.frequencies[0]).toMatchObject({ label: 'Preventive (cleanings & fluoride)', limit: '2 per calendar year' })
    expect(r.ageLimits).toEqual({ fluoride: 14, sealants: null, ortho: null, dependent: null })
  })

  it('"N remaining" is a count of what is left, never an allowance, and a lone remaining row still makes a line', () => {
    const r = withLimits([{ service: { system: 'CDT', value: 'D1110' }, serviceLimits: [{ delivery: { quantity: { value: '1' }, period: { qualifier: 'REMAINING' } } }], dates: { latestVisit: { start: '2026-03-02' } } }])
    expect(r.frequencies).toEqual([{ code: 'prophy', label: 'Cleanings', limit: '', lastOn: '2026-03-02', nextOn: null, remaining: 1 }])
    const prophy = r.procedures!.find((p) => p.key === 'prophy')!
    expect(prophy).toMatchObject({ limit: null, remaining: 1, lastOn: '2026-03-02' })
    expect(procedureAnswered(prophy)).toBe(true)
  })

  it('a plan-wide percent row that names its tier is that tier’s rate', () => {
    const r = withLimits([], {
      coInsurance: [
        { coverageLevel: 'FAMILY', service: { system: 'STC', value: '30' }, percent: '0', messages: ['Preventative'] },
        { coverageLevel: 'FAMILY', service: { system: 'STC', value: '30' }, percent: '0.2', messages: ['Basic'] },
        { coverageLevel: 'FAMILY', service: { system: 'STC', value: '30' }, percent: '0.5', messages: ['Major,Ortho'] },
      ],
    })
    expect(r.coveragePct).toMatchObject({ preventive: 100, basic: 80, major: 50, ortho: 50 })
  })

  it('wording helpers', () => {
    expect(scopeWords('TOOTH NUMBER 01 TO 32')).toBe('teeth 1–32')
    expect(scopeWords('PER FULL MOUTH')).toBe('per full mouth')
    expect(sharesWords([])).toBeNull()
    expect(networkWords(['PPO NETWORK'])).toBe('PPO network')
    expect(fundingWords(null)).toBeNull()
    expect(lineFacts({ deductibleApplies: true })).toEqual(['deductible applies'])
  })
})
