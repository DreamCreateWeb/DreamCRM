import { describe, it, expect } from 'vitest'
import {
  BREAKDOWN_BASE_SERVICE,
  BREAKDOWN_CODES,
  BREAKDOWN_COPY,
  BREAKDOWN_MAX_CHECKS,
  answeredKeys,
  breakdownBudget,
  mergeBreakdown,
  procedureAnswered,
  procedureKeyForCode,
  summarizeBreakdown,
  unansweredCodes,
} from '@/lib/insurance-breakdown'
import { FORM_PROCEDURES, type EligibilityResult, type ProcedureBenefit } from '@/lib/insurance-eligibility'

/**
 * THE FULL BREAKDOWN — the pure half (2026-10-08): which lines count as
 * answered, which codes are still to ask, how a per-code answer folds into
 * the plan-wide one, what the allowance lets through, and the receipt.
 */

function line(key: ProcedureBenefit['key'], over: Partial<ProcedureBenefit> = {}): ProcedureBenefit {
  const def = FORM_PROCEDURES.find((p) => p.key === key)!
  return { key, code: def.codes[0], label: def.label, planPays: 80, pctSource: 'tier', limit: null, lastOn: null, nextOn: null, notes: [], ...over }
}

function result(over: Partial<EligibilityResult> = {}): EligibilityResult {
  return {
    status: 'active',
    payerName: 'Delta Dental',
    planName: 'PPO',
    coverage: { effective: '2026-01-01', termination: null },
    network: 'unknown',
    annualMax: { totalCents: 150_000, usedCents: 0, remainingCents: 150_000 },
    deductible: null,
    coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null },
    waitingPeriods: [],
    frequencies: [],
    missingToothClause: null,
    notes: [],
    asOf: '2026-10-08T15:00:00.000Z',
    ...over,
  }
}

describe('the code list', () => {
  it('asks about the canonical code of every sheet line, with the dental question riding along', () => {
    expect(BREAKDOWN_CODES).toEqual(FORM_PROCEDURES.map((p) => p.codes[0]))
    expect(BREAKDOWN_CODES).toContain('D0140')
    expect(BREAKDOWN_CODES).toContain('D9944')
    expect(BREAKDOWN_BASE_SERVICE).toEqual({ system: 'STC', value: '35' })
    expect(BREAKDOWN_MAX_CHECKS).toBe(1 + BREAKDOWN_CODES.length)
    expect(procedureKeyForCode('D0272')).toBe('bitewings')
    expect(procedureKeyForCode('D9999')).toBeNull()
  })
})

describe('answered / unanswered', () => {
  it('a category rate alone is the plan talking; a code price, a limit, a date or a note is the line answered', () => {
    expect(procedureAnswered(line('exam'))).toBe(false)
    expect(procedureAnswered(line('exam', { pctSource: 'code' }))).toBe(true)
    expect(procedureAnswered(line('exam', { limit: '2 per year' }))).toBe(true)
    expect(procedureAnswered(line('exam', { lastOn: '2026-04-01' }))).toBe(true)
    expect(procedureAnswered(line('exam', { notes: ['x'] }))).toBe(true)
  })

  it('unanswered codes come in sheet order and skip the answered lines', () => {
    const r = result({ procedures: [line('exam', { limit: '2 per year' }), line('prophy'), line('crown', { nextOn: '2027-01-01' })] })
    expect(answeredKeys(r)).toEqual(['exam', 'crown'])
    const missing = unansweredCodes(r)
    expect(missing).not.toContain('D0120')
    expect(missing).not.toContain('D2740')
    expect(missing[0]).toBe('D0140')
    expect(missing).toHaveLength(BREAKDOWN_CODES.length - 2)
  })
})

describe('mergeBreakdown', () => {
  it('replaces the base line with the per-code answer, keeps sheet order, and never touches the plan-level money', () => {
    const base = result({
      procedures: [line('exam'), line('prophy'), line('crown')],
      payerNotes: ['A'],
      downgrades: [],
      replacement: null,
      ageLimits: null,
    })
    const extra = result({
      annualMax: { totalCents: 1, usedCents: 1, remainingCents: 0 },
      procedures: [line('prophy', { planPays: 100, pctSource: 'code', limit: '2 per year', lastOn: '2026-04-30', nextOn: '2026-10-30', notes: ['ADULT PROPHY'] })],
      payerNotes: ['a', 'B'],
      downgrades: ['Posterior composites at the amalgam rate.'],
      replacement: { crownBridgeMonths: 60, dentureMonths: null, paysOn: 'prep' },
      ageLimits: { fluoride: 14, sealants: null, ortho: null, dependent: null },
    })
    const merged = mergeBreakdown(base, 'D1110', extra)
    expect(merged.annualMax).toEqual(base.annualMax)
    expect(merged.procedures!.map((p) => p.key)).toEqual(['exam', 'prophy', 'crown'])
    expect(merged.procedures![1]).toMatchObject({ pctSource: 'code', planPays: 100, limit: '2 per year', notes: ['ADULT PROPHY'] })
    expect(merged.procedures![0]).toEqual(line('exam'))
    // Notes union case-insensitively; downgrades and rules fill in.
    expect(merged.payerNotes).toEqual(['A', 'B'])
    expect(merged.downgrades).toEqual(['Posterior composites at the amalgam rate.'])
    expect(merged.replacement).toEqual({ crownBridgeMonths: 60, dentureMonths: null, paysOn: 'prep' })
    expect(merged.ageLimits).toEqual({ fluoride: 14, sealants: null, ortho: null, dependent: null })
  })

  it('a per-code answer that says nothing specific changes nothing; a base rule is never overridden by a repeat', () => {
    const base = result({ procedures: [line('exam')], replacement: { crownBridgeMonths: 84, dentureMonths: null, paysOn: 'seat' } })
    const merged = mergeBreakdown(base, 'D0120', result({ procedures: [line('exam')], replacement: { crownBridgeMonths: 60, dentureMonths: 60, paysOn: 'prep' } }))
    expect(merged.procedures).toEqual([line('exam')])
    expect(merged.replacement).toEqual({ crownBridgeMonths: 84, dentureMonths: 60, paysOn: 'seat' })
  })

  it('a line the base never had is added in sheet order', () => {
    const base = result({ procedures: [line('crown')] })
    const merged = mergeBreakdown(base, 'D0120', result({ procedures: [line('exam', { limit: '2 per year' })] }))
    expect(merged.procedures!.map((p) => p.key)).toEqual(['exam', 'crown'])
  })
})

describe('breakdownBudget', () => {
  it('is what the month still allows, fail-open on an unreadable or missing count', () => {
    expect(breakdownBudget({ used: 190, included: 200, unreadable: false }, 15)).toBe(10)
    expect(breakdownBudget({ used: 200, included: 200, unreadable: false }, 15)).toBe(0)
    expect(breakdownBudget({ used: 0, included: 200, unreadable: false }, 15)).toBe(15)
    expect(breakdownBudget({ used: 999, included: 200, unreadable: true }, 15)).toBe(15)
    expect(breakdownBudget(null, 15)).toBe(15)
  })
})

describe('the receipt and the copy', () => {
  it('names the mode by how the payer answered', () => {
    const r = result({ procedures: [line('exam', { limit: '2 per year' }), line('prophy', { limit: '2 per year' })] })
    expect(summarizeBreakdown({ requestedCodes: ['D0120', 'D1110'], result: r, perCodeAsked: [], failedCodes: [], checks: 1, capped: false })).toMatchObject({ mode: 'single', checks: 1, answeredKeys: ['exam', 'prophy'], silentCodes: [] })
    expect(summarizeBreakdown({ requestedCodes: ['D0120', 'D1110'], result: r, perCodeAsked: ['D0120', 'D1110'], failedCodes: [], checks: 3, capped: false }).mode).toBe('per_code')
    expect(summarizeBreakdown({ requestedCodes: ['D0120', 'D1110', 'D2740'], result: r, perCodeAsked: ['D2740'], failedCodes: ['D2740'], checks: 2, capped: false })).toMatchObject({ mode: 'mixed', silentCodes: ['D2740'], failedCodes: ['D2740'] })
    expect(summarizeBreakdown({ requestedCodes: ['D0120', 'D1110', 'D2740'], result: r, perCodeAsked: ['D2740'], failedCodes: [], checks: 2, capped: true }).mode).toBe('capped')
  })

  it('the confirm says what it asks and what it can cost, with the month’s standing when known; a practice answer costs nothing', () => {
    const billed = BREAKDOWN_COPY.confirmBody({ used: 12, included: 200, unreadable: false }, true)
    expect(billed).toContain(`each of the ${BREAKDOWN_CODES.length} procedures`)
    expect(billed).toContain(`up to ${BREAKDOWN_MAX_CHECKS}`)
    expect(billed).toContain('12 of 200')
    expect(BREAKDOWN_COPY.confirmBody({ used: 12, included: 200, unreadable: true }, true)).not.toContain('12 of 200')
    expect(BREAKDOWN_COPY.confirmBody(null, false)).toContain('nothing goes to a payer')
    expect(BREAKDOWN_COPY.pill(1)).toBe('Full breakdown · 1 check')
    expect(BREAKDOWN_COPY.receipt({ requestedCodes: ['a', 'b'], answeredKeys: ['exam'], silentCodes: [], failedCodes: [], checks: 2, mode: 'capped' })).toMatch(/stopped at this month’s allowance/)
  })
})
