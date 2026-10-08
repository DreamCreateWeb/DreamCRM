import {
  FORM_PROCEDURES,
  type BreakdownSummary,
  type EligibilityResult,
  type EligibilityService,
  type FormProcedureKey,
  type InsuranceUsage,
  type ProcedureBenefit,
} from '@/lib/insurance-eligibility'

/**
 * THE FULL BREAKDOWN — the pure half (2026-10-08).
 *
 * A plan-wide check asks the payer one question ("Dental Care") and most
 * payers answer with the plan: the maximum, the deductible, the category
 * rates, and whatever procedure limits they volunteer. A desk's breakdown
 * form wants the LINE: this code's own rate, its frequency, the last date
 * it was paid, the next date it is covered. Payers give that when asked
 * for the code. So the Full breakdown asks for every code on the sheet —
 * first all of them in one request (a payer that honours every EQ answers
 * in one billed check), then one at a time for whatever came back without
 * anything specific (a payer that reads only the first), stopping at the
 * month's allowance. One stored row carries the merged answer and the
 * receipt (`BreakdownSummary`), and bills as many checks as it took.
 *
 * Client-safe: the code list, the merge, the budget arithmetic and the
 * copy. The service half is lib/services/insurance-eligibility/index.ts
 * (`runFullBreakdown`).
 */

/** The canonical code of every line on the sheet — what a breakdown asks about. */
export const BREAKDOWN_CODES: readonly string[] = FORM_PROCEDURES.map((p) => p.codes[0])

/** The dental question every request still carries, so the plan facts ride the same answer. */
export const BREAKDOWN_BASE_SERVICE: EligibilityService = { system: 'STC', value: '35' }

/** The most checks a breakdown can cost: one for all codes, then one per code. */
export const BREAKDOWN_MAX_CHECKS = 1 + BREAKDOWN_CODES.length

/** A line counts as answered when the payer said something SPECIFIC to the code — a category rate alone is the plan talking. */
export function procedureAnswered(p: ProcedureBenefit): boolean {
  return p.pctSource === 'code' || !!p.limit || !!p.lastOn || !!p.nextOn || p.notes.length > 0
}

/** The form keys a result answers specifically. */
export function answeredKeys(result: EligibilityResult): FormProcedureKey[] {
  return (result.procedures ?? []).filter(procedureAnswered).map((p) => p.key)
}

/** The canonical codes still without a specific answer, in sheet order. */
export function unansweredCodes(result: EligibilityResult): string[] {
  const answered = new Set(answeredKeys(result))
  return FORM_PROCEDURES.filter((p) => !answered.has(p.key)).map((p) => p.codes[0])
}

export function procedureKeyForCode(code: string): FormProcedureKey | null {
  return FORM_PROCEDURES.find((p) => p.codes.includes(code))?.key ?? null
}

function union(a: string[] | undefined, b: string[] | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const k = x.trim().toUpperCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

/**
 * Fold a per-code answer into the running result. The per-code answer's
 * line for THAT code replaces the base line (the base line was the plan's
 * category rate; this is the payer on the code itself). Everything
 * plan-level stays as the base check said it — the maximum and deductible
 * are the same answer repeated, and a repeat never overrides the first.
 * Notes, downgrades and rules are unioned; a replacement window or age
 * limit the base lacked is filled from the per-code answer.
 */
export function mergeBreakdown(base: EligibilityResult, code: string, extra: EligibilityResult): EligibilityResult {
  const key = procedureKeyForCode(code)
  const line = key ? (extra.procedures ?? []).find((p) => p.key === key) : undefined
  let procedures = base.procedures ?? []
  if (line && procedureAnswered(line)) {
    const idx = procedures.findIndex((p) => p.key === line.key)
    procedures = idx >= 0 ? procedures.map((p, i) => (i === idx ? line : p)) : [...procedures, line]
    // Keep the sheet's order.
    const order = new Map(FORM_PROCEDURES.map((p, i) => [p.key, i]))
    procedures = [...procedures].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
  }
  const replacement =
    base.replacement || extra.replacement
      ? {
          crownBridgeMonths: base.replacement?.crownBridgeMonths ?? extra.replacement?.crownBridgeMonths ?? null,
          dentureMonths: base.replacement?.dentureMonths ?? extra.replacement?.dentureMonths ?? null,
          paysOn: base.replacement?.paysOn ?? extra.replacement?.paysOn ?? null,
        }
      : null
  const ageLimits =
    base.ageLimits || extra.ageLimits
      ? {
          fluoride: base.ageLimits?.fluoride ?? extra.ageLimits?.fluoride ?? null,
          sealants: base.ageLimits?.sealants ?? extra.ageLimits?.sealants ?? null,
          ortho: base.ageLimits?.ortho ?? extra.ageLimits?.ortho ?? null,
          dependent: base.ageLimits?.dependent ?? extra.ageLimits?.dependent ?? null,
        }
      : null
  const seenFreq = new Set((base.frequencies ?? []).map((f) => `${f.code}:${f.label}`))
  const frequencies = [...(base.frequencies ?? []), ...(extra.frequencies ?? []).filter((f) => !seenFreq.has(`${f.code}:${f.label}`))]
  return {
    ...base,
    procedures,
    frequencies,
    replacement,
    ageLimits,
    downgrades: union(base.downgrades, extra.downgrades),
    payerNotes: union(base.payerNotes, extra.payerNotes),
    missingToothClause: base.missingToothClause ?? extra.missingToothClause,
    noWaitingPeriods: base.noWaitingPeriods || extra.noWaitingPeriods || undefined,
  }
}

/**
 * How many more payer checks the month allows right now. The allowance is
 * an INCLUDED count, not a wall: a breakdown that would cross it stops at
 * it and says so (`mode: 'capped'`). Fail-open like the allowance itself —
 * an unreadable count never refuses the desk.
 */
export function breakdownBudget(usage: InsuranceUsage | null | undefined, wanted: number): number {
  if (!usage || usage.unreadable) return wanted
  return Math.max(0, Math.min(wanted, usage.included - usage.used))
}

export function summarizeBreakdown(args: {
  requestedCodes: string[]
  result: EligibilityResult
  perCodeAsked: string[]
  failedCodes: string[]
  checks: number
  capped: boolean
}): BreakdownSummary {
  const answered = answeredKeys(args.result)
  const answeredSet = new Set(answered)
  const silentCodes = args.perCodeAsked.filter((c) => {
    const k = procedureKeyForCode(c)
    return !k || !answeredSet.has(k)
  })
  const mode: BreakdownSummary['mode'] = args.capped ? 'capped' : args.perCodeAsked.length === 0 ? 'single' : args.perCodeAsked.length >= args.requestedCodes.length ? 'per_code' : 'mixed'
  return { requestedCodes: args.requestedCodes, answeredKeys: answered, silentCodes, failedCodes: args.failedCodes, checks: args.checks, mode }
}

export const BREAKDOWN_COPY = {
  button: 'Full breakdown',
  again: 'Breakdown again',
  pill: (checks: number) => `Full breakdown · ${checks} ${checks === 1 ? 'check' : 'checks'}`,
  confirmTitle: 'Pull the full breakdown?',
  confirmLabel: 'Ask the payer',
  /** Said before any check goes out: what it asks and what it can cost. */
  confirmBody(usage: InsuranceUsage | null | undefined, billed: boolean): string {
    const n = BREAKDOWN_CODES.length
    const lead = `Asks the payer about each of the ${n} procedures on the sheet — the rate, the frequency, the last date and the next covered date for that code.`
    if (!billed) return `${lead} A practice answer: nothing goes to a payer.`
    const budget = usage && !usage.unreadable ? ` ${usage.used} of ${usage.included} of this month’s included checks are used; it stops at the allowance.` : ''
    return `${lead} Most payers answer in one check; a payer that reads one code at a time can take up to ${BREAKDOWN_MAX_CHECKS}.${budget}`
  },
  /** On the card, how the payer answered. */
  receipt(b: BreakdownSummary): string {
    const asked = b.requestedCodes.length
    const got = b.answeredKeys.length
    switch (b.mode) {
      case 'single':
        return `${got} of ${asked} lines answered in one check.`
      case 'per_code':
        return `The payer answers one code at a time — ${got} of ${asked} lines answered in ${b.checks} checks.`
      case 'mixed':
        return `${got} of ${asked} lines answered in ${b.checks} checks.`
      case 'capped':
        return `${got} of ${asked} lines answered in ${b.checks} checks — stopped at this month’s allowance; the rest print as blanks.`
    }
  },
} as const
