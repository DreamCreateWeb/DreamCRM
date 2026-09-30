import 'server-only'
import type { EligibilityRequest, EligibilityResult } from '@/lib/insurance-eligibility'
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
  | 'inactive'
  | 'not_found'
  | 'needs_review'

export const SANDBOX_SCENARIO_KEYS: readonly SandboxScenarioKey[] = [
  'active_ppo',
  'active_rich',
  'active_exhausted',
  'active_waiting',
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
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null },
        frequencies: freq(5, 5, 13, 26),
        missingToothClause: false,
        notes: ['Bitewings were last taken over a year ago, so a new set is covered.'],
      }
    case 'active_rich':
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 200_000, usedCents: 30_000, remainingCents: 170_000 },
        deductible: { individualCents: 5_000, metCents: 5_000, remainingCents: 0 },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: 50 },
        frequencies: freq(4, 4, 4, 30),
        missingToothClause: false,
        notes: ['Orthodontics covered at 50% for dependents under 19, lifetime maximum $1,500.'],
      }
    case 'active_exhausted':
      return {
        ...base,
        status: 'active',
        annualMax: { totalCents: 150_000, usedCents: 142_000, remainingCents: 8_000 },
        deductible: { individualCents: 5_000, metCents: 5_000, remainingCents: 0 },
        coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null },
        frequencies: freq(2, 2, 2, 8),
        missingToothClause: true,
        notes: [
          'Only a small amount of this year’s maximum is left — worth a conversation before major work.',
          'Missing-tooth clause applies: replacing teeth lost before coverage began isn’t covered.',
        ],
      }
    case 'active_waiting': {
      const effective = firstOfMonthUtc(now, -2)
      return {
        ...base,
        status: 'active',
        coverage: { effective: isoDate(effective), termination: null },
        annualMax: { totalCents: 100_000, usedCents: 0, remainingCents: 100_000 },
        deductible: { individualCents: 7_500, metCents: 0, remainingCents: 7_500 },
        coveragePct: { preventive: 100, basic: 70, major: 50, ortho: null },
        waitingPeriods: [
          { category: 'basic', endsOn: isoDate(addMonthsUtc(effective, 6)) },
          { category: 'major', endsOn: isoDate(addMonthsUtc(effective, 12)) },
        ],
        frequencies: freq(null, null, null, null),
        missingToothClause: true,
        notes: ['New coverage — preventive care is covered now; fillings and crowns wait out their periods.'],
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
    return renderSandboxScenario(key, req, ctx.now)
  },
}
