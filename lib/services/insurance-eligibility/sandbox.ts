import 'server-only'
import { FORM_PROCEDURES, type EligibilityRequest, type EligibilityResult, type FormProcedureKey, type ProcedureBenefit } from '@/lib/insurance-eligibility'
import type { EligibilityProvider } from './provider'

/**
 * The SANDBOX driver — practice answers, never a payer.
 *
 * DETERMINISTIC: the same card details always get the same answer, so a
 * front desk that re-checks a patient sees a stable story rather than a
 * dice roll, and the tests can pin every scenario. Nothing here networks.
 *
 * STEERING (lib/insurance-eligibility.ts SANDBOX_STEERING): a member ID that
 * ends in a known suffix forces a state — `0000` coverage ended, `9999` not
 * found, `5555` needs a look, `0001` the payer times out (the driver THROWS,
 * which is how the service's error lane stays demoable). Anything else lands
 * on one of the four active plans by hash.
 *
 * Every date is derived from the `now` the service passes in (never
 * `Date.now()`), so seeded rows dated in the past read as if the check had
 * really happened then.
 */

export type SandboxScenarioKey =
  | 'active_ppo'
  | 'active_rich'
  | 'active_exhausted'
  | 'active_waiting'
  | 'active_total_only'
  | 'inactive'
  | 'not_found'
  | 'needs_review'

export const SANDBOX_SCENARIO_KEYS: readonly SandboxScenarioKey[] = [
  'active_ppo',
  'active_rich',
  'active_exhausted',
  'active_waiting',
  'active_total_only',
  'inactive',
  'not_found',
  'needs_review',
]

const ACTIVE_SCENARIOS: readonly SandboxScenarioKey[] = ['active_ppo', 'active_rich', 'active_exhausted', 'active_waiting']

export const SANDBOX_TIMEOUT_MESSAGE = 'Sandbox: simulated payer timeout'

/** FNV-1a 32-bit over the identifying fields. */
export function hashRequest(req: EligibilityRequest): number {
  const key = [
    req.carrierName.trim().toLowerCase(),
    req.memberId.replace(/\D/g, ''),
    req.patient.dateOfBirth,
    req.patient.lastName.trim().toLowerCase(),
  ].join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function memberDigits(req: EligibilityRequest): string {
  return req.memberId.replace(/\D/g, '')
}

export function pickSandboxScenario(req: EligibilityRequest): SandboxScenarioKey | 'timeout' {
  const digits = memberDigits(req)
  if (digits.endsWith('0000')) return 'inactive'
  if (digits.endsWith('9999')) return 'not_found'
  if (digits.endsWith('5555')) return 'needs_review'
  if (digits.endsWith('0001')) return 'timeout'
  if (digits.endsWith('7777')) return 'active_total_only'
  return ACTIVE_SCENARIOS[hashRequest(req) % ACTIVE_SCENARIOS.length]
}

const PLAN_NAMES: ReadonlyArray<[RegExp, string]> = [
  [/delta/i, 'Delta Dental PPO'],
  [/cigna/i, 'Cigna DPPO Advantage'],
  [/metlife/i, 'MetLife PDP Plus'],
  [/aetna/i, 'Aetna Dental PPO'],
  [/guardian/i, 'Guardian DentalGuard Preferred'],
  [/humana/i, 'Humana Dental PPO'],
  [/united ?healthcare|uhc/i, 'UnitedHealthcare Dental PPO'],
  [/anthem|blue ?cross|bcbs/i, 'Anthem Dental Complete'],
  [/principal/i, 'Principal Dental PPO'],
  [/ameritas/i, 'Ameritas Dental PPO'],
]

export function sandboxPlanName(carrierName: string): string {
  const hit = PLAN_NAMES.find(([re]) => re.test(carrierName))
  return hit ? hit[1] : `${carrierName.trim()} Dental PPO`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
}

function firstOfMonthUtc(d: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1))
}

function lastOfPreviousMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
}

function janFirstUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
}

const EMPLOYERS = ['Harbor Logistics', 'Cedar County Schools', 'Northwind Credit Union', 'Brightline Manufacturing', 'Lakeside Health Partners'] as const

/**
 * THE VERIFICATION SHEET'S FIELDS, practice-answer edition (2026-10-08): the
 * plan and group facts, the payer's contact, what the deductible applies to,
 * the per-procedure lines, replacement windows, age limits and downgrades a
 * real 271 carries. Derived from the same hash and clock as everything else
 * here, so a re-check reads the same story. Percentages ride the scenario's
 * own tiers; a procedure line says its percent came from the tier
 * (`pctSource: 'tier'`) exactly as the live normalizer would.
 */
function sheetFacts(
  req: EligibilityRequest,
  now: Date,
  o: {
    tiers: NonNullable<EligibilityResult['coveragePct']>
    benefitYear: 'calendar' | 'plan'
    effective: string
    last: { exam: number | null; prophy: number | null; bw: number | null; fmx: number | null }
    guard: number | null
    paysOn: 'seat' | 'prep'
    orthoAge: number | null
    downgrades: string[]
  },
): Pick<EligibilityResult, 'plan' | 'payerContacts' | 'deductibleApplies' | 'procedures' | 'replacement' | 'ageLimits' | 'downgrades' | 'payerNotes'> {
  const h = hashRequest(req)
  const year = now.getUTCFullYear()
  const back = (months: number | null) => (months == null ? null : isoDate(addMonthsUtc(now, -months)))
  const ahead = (months: number | null, every: number) => (months == null ? null : isoDate(addMonthsUtc(now, every - months)))
  const tier = (t: FormProcedureKey) => o.tiers[FORM_PROCEDURES.find((p) => p.key === t)!.tier] ?? null
  const line = (key: FormProcedureKey, extra: Partial<Pick<ProcedureBenefit, 'planPays' | 'pctSource' | 'limit' | 'lastOn' | 'nextOn' | 'notes'>> = {}): ProcedureBenefit => {
    const def = FORM_PROCEDURES.find((p) => p.key === key)!
    return {
      key,
      code: def.codes[0],
      label: def.label,
      planPays: tier(key),
      pctSource: tier(key) == null ? null : ('tier' as const),
      limit: null,
      lastOn: null,
      nextOn: null,
      notes: [] as string[],
      ...extra,
    }
  }
  const guardLine = o.guard == null ? line('occlusal_guard', { planPays: 0, pctSource: 'code' }) : line('occlusal_guard', { planPays: o.guard, pctSource: 'code', limit: '1 every 5 years' })
  return {
    plan: {
      groupNumber: `G${(h % 900_000) + 100_000}`,
      groupName: EMPLOYERS[h % EMPLOYERS.length],
      planNumber: null,
      insuranceType: 'PREFERRED_PROVIDER_ORGANIZATION',
      benefitYear: o.benefitYear,
      benefitYearStart: o.benefitYear === 'calendar' ? `${year}-01-01` : o.effective,
      benefitYearEnd: o.benefitYear === 'calendar' ? `${year}-12-31` : isoDate(addMonthsUtc(new Date(`${o.effective}T00:00:00Z`), 12)),
    },
    payerContacts: {
      contacts: [{ name: 'Provider services', phones: ['800-555-0147'], faxes: [], emails: [], urls: [] }],
      claimsAddress: 'P.O. Box 7100, Dental Claims, Anytown, OH 43000',
    },
    deductibleApplies: { preventive: false, basic: true, major: true, note: null },
    procedures: [
      line('er_exam'),
      line('exam', { limit: '2 per year', lastOn: back(o.last.exam), nextOn: ahead(o.last.exam, 6) }),
      line('bitewings', { limit: '1 per year', lastOn: back(o.last.bw), nextOn: ahead(o.last.bw, 12) }),
      line('pa'),
      line('pano', { limit: '1 every 3 years', lastOn: back(o.last.fmx), nextOn: ahead(o.last.fmx, 36) }),
      line('fmx', { limit: '1 every 3 years', lastOn: back(o.last.fmx), nextOn: ahead(o.last.fmx, 36) }),
      line('srp', { limit: '1 every 2 years' }),
      line('perio_maint', { limit: '2 per year', notes: ['Perio charting may be requested.'] }),
      line('prophy', { limit: '2 per year', lastOn: back(o.last.prophy), nextOn: ahead(o.last.prophy, 6) }),
      line('fluoride', { limit: '2 per year' }),
      line('sealants', { limit: '1 per tooth every 3 years', notes: ['Permanent molars only.'] }),
      guardLine,
      line('crown', { limit: '1 every 5 years', notes: [o.paysOn === 'prep' ? 'Paid on the prep date.' : 'Paid on the seat date.'] }),
      line('bridge', { limit: '1 every 5 years' }),
      line('denture', { limit: '1 every 5 years' }),
    ],
    replacement: { crownBridgeMonths: 60, dentureMonths: 60, paysOn: o.paysOn },
    ageLimits: { fluoride: 14, sealants: 16, ortho: o.orthoAge, dependent: 26 },
    downgrades: o.downgrades,
    payerNotes: [
      ...o.downgrades,
      `Crowns, bridges and dentures replace once every 5 years, paid on the ${o.paysOn} date.`,
      'Fluoride through age 14; sealants through age 16 on permanent molars.',
      'Pretreatment estimates are recommended for treatment over $300.',
      'Final benefit is determined when the claim is received. This is not a guarantee of payment.',
    ],
  }
}

/**
 * Render one scenario as a result. Pure and exported so the demo seeder can
 * pin a persona to a scenario and store EXACTLY what the driver would say.
 */
export function renderSandboxScenario(key: SandboxScenarioKey, req: EligibilityRequest, now: Date): EligibilityResult {
  const payerName = req.carrierName.trim()
  const planName = sandboxPlanName(payerName)
  const asOf = now.toISOString()
  const base: Omit<EligibilityResult, 'status'> = {
    payerName,
    planName,
    coverage: { effective: isoDate(janFirstUtc(now)), termination: null },
    network: 'unknown',
    annualMax: null,
    deductible: null,
    familyMax: null,
    familyDeductible: null,
    orthoLifetimeMax: null,
    coveragePct: null,
    waitingPeriods: [],
    frequencies: [],
    missingToothClause: null,
    notes: [],
    asOf,
  }
  const freq = (lastExam: number | null, lastProphy: number | null, lastBw: number | null, lastFmx: number | null) => [
    { code: 'exam' as const, label: 'Exams', limit: '2 per year', lastOn: lastExam == null ? null : isoDate(addMonthsUtc(now, -lastExam)) },
    { code: 'prophy' as const, label: 'Cleanings', limit: '2 per year', lastOn: lastProphy == null ? null : isoDate(addMonthsUtc(now, -lastProphy)) },
    { code: 'bitewings' as const, label: 'Bitewing X-rays', limit: '1 per year', lastOn: lastBw == null ? null : isoDate(addMonthsUtc(now, -lastBw)) },
    { code: 'fmx' as const, label: 'Full-mouth X-rays', limit: '1 every 3 years', lastOn: lastFmx == null ? null : isoDate(addMonthsUtc(now, -lastFmx)) },
  ]

  switch (key) {
    case 'active_ppo':
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 150_000, usedCents: 62_000, remainingCents: 88_000 },
        deductible: { individualCents: 5_000, metCents: 2_500, remainingCents: 2_500 },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
        coveragePctOut: { preventive: 80, basic: 60, major: 40, ortho: null, diagnostic: 80, perio: 60, endo: 60, oralSurgery: 60 },
        noWaitingPeriods: true,
        frequencies: freq(5, 5, 13, 26),
        missingToothClause: false,
        notes: ['Bitewings were last taken over a year ago, so a new set is covered.'],
        ...sheetFacts(req, now, {
          tiers: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
          benefitYear: 'calendar',
          effective: base.coverage.effective!,
          last: { exam: 5, prophy: 5, bw: 13, fmx: 26 },
          guard: null,
          paysOn: 'seat',
          orthoAge: null,
          downgrades: ['Posterior composite fillings are paid at the amalgam rate.'],
        }),
      }
    case 'active_rich':
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 200_000, usedCents: 30_000, remainingCents: 170_000 },
        deductible: { individualCents: 5_000, metCents: 5_000, remainingCents: 0 },
        familyMax: { totalCents: 400_000, usedCents: 90_000, remainingCents: 310_000 },
        familyDeductible: { individualCents: 15_000, metCents: 10_000, remainingCents: 5_000 },
        orthoLifetimeMax: { totalCents: 150_000, usedCents: 0, remainingCents: 150_000 },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: 50, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
        coveragePctOut: { preventive: 100, basic: 70, major: 50, ortho: 50, diagnostic: 100, perio: 70, endo: 70, oralSurgery: 70 },
        noWaitingPeriods: true,
        frequencies: freq(4, 4, 4, 30),
        missingToothClause: false,
        notes: ['Orthodontics covered at 50% for dependents under 19.'],
        ...sheetFacts(req, now, {
          tiers: { preventive: 100, basic: 80, major: 50, ortho: 50, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
          benefitYear: 'calendar',
          effective: base.coverage.effective!,
          last: { exam: 4, prophy: 4, bw: 4, fmx: 30 },
          guard: 50,
          paysOn: 'prep',
          orthoAge: 19,
          downgrades: [],
        }),
      }
    case 'active_total_only':
      // The honesty scenario: a payer that answers "the maximum is $1,500"
      // and nothing about what is used. The card must say so, not show $0.
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 150_000, usedCents: null, remainingCents: null },
        deductible: { individualCents: 5_000, metCents: null, remainingCents: null },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
        frequencies: freq(null, null, null, null),
        missingToothClause: null,
        notes: ['This payer states the yearly maximum and deductible but not how much has been used — call them before quoting major work.'],
        ...sheetFacts(req, now, {
          tiers: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
          benefitYear: 'plan',
          effective: base.coverage.effective!,
          last: { exam: null, prophy: null, bw: null, fmx: null },
          guard: null,
          paysOn: 'seat',
          orthoAge: null,
          downgrades: [],
        }),
      }
    case 'active_exhausted':
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 150_000, usedCents: 142_000, remainingCents: 8_000 },
        deductible: { individualCents: 5_000, metCents: 5_000, remainingCents: 0 },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
        noWaitingPeriods: true,
        frequencies: freq(2, 2, 2, 8),
        missingToothClause: true,
        notes: [
          'Only a small amount of this year’s maximum is left — worth a conversation before major work.',
          'Missing-tooth clause applies: replacing teeth lost before coverage began isn’t covered.',
        ],
        ...sheetFacts(req, now, {
          tiers: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: 80, oralSurgery: 80 },
          benefitYear: 'calendar',
          effective: base.coverage.effective!,
          last: { exam: 2, prophy: 2, bw: 2, fmx: 8 },
          guard: null,
          paysOn: 'seat',
          orthoAge: null,
          downgrades: ['Posterior composite fillings are paid at the amalgam rate.'],
        }),
      }
    case 'active_waiting': {
      const effective = firstOfMonthUtc(now, -2)
      return {
        ...base,
        status: 'active',
        coverage: { effective: isoDate(effective), termination: null },
        annualMax: { totalCents: 100_000, usedCents: 0, remainingCents: 100_000 },
        deductible: { individualCents: 7_500, metCents: 0, remainingCents: 7_500 },
        coveragePct: { preventive: 100, basic: 70, major: 50, ortho: null, diagnostic: 100, perio: 70, endo: 70, oralSurgery: 70 },
        waitingPeriods: [
          { category: 'basic', endsOn: isoDate(addMonthsUtc(effective, 6)) },
          { category: 'major', endsOn: isoDate(addMonthsUtc(effective, 12)) },
        ],
        frequencies: freq(null, null, null, null),
        missingToothClause: true,
        notes: ['New coverage — preventive care is covered now; fillings and crowns wait out their periods.'],
        ...sheetFacts(req, now, {
          tiers: { preventive: 100, basic: 70, major: 50, ortho: null, diagnostic: 100, perio: 70, endo: 70, oralSurgery: 70 },
          benefitYear: 'plan',
          effective: isoDate(effective),
          last: { exam: null, prophy: null, bw: null, fmx: null },
          guard: null,
          paysOn: 'seat',
          orthoAge: null,
          downgrades: [],
        }),
      }
    }
    case 'inactive': {
      const ended = lastOfPreviousMonthUtc(now)
      return {
        ...base,
        status: 'inactive',
        coverage: { effective: isoDate(addMonthsUtc(janFirstUtc(now), -24)), termination: isoDate(ended) },
        notes: [`Coverage ended ${isoDate(ended)}. Ask the patient whether they have a newer card.`],
      }
    }
    case 'not_found':
      return {
        ...base,
        status: 'not_found',
        planName: null,
        coverage: { effective: null, termination: null },
        notes: [
          `${payerName} found no member matching this ID and date of birth. Check the digits, or try the subscriber’s details.`,
        ],
      }
    case 'needs_review':
      return {
        ...base,
        status: 'needs_review',
        notes: ['The member ID matches a policy, but the subscriber on file doesn’t match the name given. Confirm who holds it.'],
      }
  }
}

export const sandboxProvider: EligibilityProvider = {
  id: 'sandbox',
  async check(req, ctx) {
    const key = pickSandboxScenario(req)
    if (key === 'timeout') throw new Error(SANDBOX_TIMEOUT_MESSAGE)
    return { result: renderSandboxScenario(key, req, ctx.now), raw: null }
  },
}
