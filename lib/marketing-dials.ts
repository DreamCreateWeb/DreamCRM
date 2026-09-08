import {
  MARKETING_CHANNELS,
  type MarketingChannel,
} from '@/lib/marketing-attribution'

/**
 * The dials — the PURE core of marketing-engine slice 3 (docs/
 * marketing-engine.md Part 3 + Part 7 ruling #3). The machine computes CAC
 * and cost-per-trial against the funnel the sensor layer already reads,
 * holds the research's kill bars, and renders a RECOMMENDATION — the owner
 * moves the money. Nothing here spends, schedules, or touches an ad
 * platform.
 *
 * Honesty laws (the same ones the grader lives by):
 *  - A cohort still inside the conversion lag is COLLECTING, never a
 *    verdict. Every fresh month reads zero-paying at first; screaming
 *    "dial down" at it would train the owner to ignore the dial.
 *  - Zero conversions is not an infinite CAC on a chart. A mature month
 *    with spend and no paying clinic exceeds the ceiling only when the
 *    spend ALONE does (even one conversion wouldn't have saved it);
 *    below that, the per-channel cost-per-trial bars are the instrument
 *    that catches a channel burning money.
 *  - Blended means blended: the paying denominator counts every new
 *    paying clinic in the cohort, attributed or not — untracked converts
 *    are still revenue the spend period produced.
 */

// ── The master dial rule (Part 3; owner-tunable by editing these) ────────
/** Blended CAC above this for two consecutive mature months → dial down. */
export const CAC_DIAL_DOWN_CENTS = 1_600_00
/** Blended CAC below this (with real conversions) → dial up. */
export const CAC_DIAL_UP_CENTS = 800_00
/** Conversion lag: a signup cohort is judged only after this many days
 *  past its month's end (trial + decision time). */
export const CAC_LAG_DAYS = 60

/** Per-channel cost-per-TRIAL kill bars from the Part 3 table. Channels
 *  without an entry have no bar — spend there is judged blended-only. */
export const CHANNEL_TRIAL_BARS: Partial<Record<MarketingChannel, number>> = {
  google_ads: 120_00, // competitor/alternative terms: cost/trial <$120
  meta_ads: 80_00, // trial $30–80; over $80 is the kill bar
}

/** Channels the spend-entry form offers. The schema accepts any registry
 *  channel; this is just what a human plausibly buys. */
export const SPENDABLE_CHANNELS: MarketingChannel[] = [
  'google_ads',
  'meta_ads',
  'social',
  'email',
  'referral',
]

/** Part 7 ruling #3, rendered while spend sits at step one — code-owned
 *  copy so the plan on screen is exactly the plan that was decided. */
export const STEP_ONE_PLAN = {
  headline: 'The first $1,000: one channel, all of it',
  lines: [
    'Google Search, competitor “alternative / pricing” terms only — the one channel whose floor fits a $1k budget.',
    'Manual bidding, exact match — smart bidding gets no signal at this level.',
    'Land every click on /compare. Judge on cost per trial under $120.',
    'Meta unlocks at the next budget step, never by splitting this one.',
  ],
} as const

// ── Month keys ───────────────────────────────────────────────────────────
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** UTC calendar-month key ('2026-09') — same UTC bucketing as the rollup. */
export function monthKeyOf(d: Date): string {
  return d.toISOString().slice(0, 7)
}

/** First instant AFTER the month (UTC). */
function monthEnd(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1))
}

/** A cohort is judged only once the lag has fully run. */
export function isMonthMature(month: string, now: Date): boolean {
  return now.getTime() >= monthEnd(month).getTime() + CAC_LAG_DAYS * 24 * 60 * 60 * 1000
}

// ── Assessment shapes ────────────────────────────────────────────────────
export interface MonthChannelDial {
  channel: MarketingChannel
  spendCents: number
  /** Signups (= trials started; every signup starts a trial) attributed to
   *  this channel in the month's cohort. */
  trials: number
  /** Spend ÷ trials; null when nothing converted to a trial yet. */
  costPerTrialCents: number | null
  /** Verdict against the channel's kill bar; null when no bar or no spend. */
  bar: 'within' | 'over' | 'no_trials' | null
}

export interface MonthDial {
  month: string
  mature: boolean
  spendCents: number
  /** New paying clinics from this month's signup cohort (all channels +
   *  untracked — blended means blended). */
  paying: number
  /** Total signups in the cohort. */
  trials: number
  /** Blended CAC; null when nothing is paying yet. */
  cacCents: number | null
  /** True when this mature month counts against the ceiling: a real CAC
   *  over the bar, or zero conversions on spend the ceiling itself
   *  couldn't excuse. */
  overCeiling: boolean
  channels: MonthChannelDial[]
}

export type DialRecommendation =
  | 'no_spend' // nothing recorded — show the step-one plan
  | 'collecting' // spend recorded, no mature month yet — the lag is running
  | 'dial_up' // latest mature month under $800 with real conversions
  | 'dial_down' // two consecutive mature months over the ceiling
  | 'hold' // mature data, between the bars

export interface DialsAssessment {
  months: MonthDial[]
  recommendation: DialRecommendation
  /** One warm sentence the panel shows beside the verdict. */
  reason: string
}

export interface MonthCohortInput {
  month: string
  /** Recorded spend per channel, cents. */
  spendByChannel: Partial<Record<MarketingChannel, number>>
  /** Signups per channel in this month's cohort ('' key not allowed —
   *  untracked signups ride the two totals below). */
  signupsByChannel: Partial<Record<MarketingChannel, number>>
  /** Paying-today per channel from this cohort. */
  payingByChannel: Partial<Record<MarketingChannel, number>>
  /** Cohort totals INCLUDING untracked signups. */
  totalSignups: number
  totalPaying: number
}

const centsFmt = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`

/**
 * The whole verdict, pure and deterministic. Months arrive in any order;
 * the assessment sorts oldest → newest and judges only mature months.
 */
export function assessDials(cohorts: MonthCohortInput[], now: Date): DialsAssessment {
  const months: MonthDial[] = cohorts
    .filter((c) => MONTH_KEY_RE.test(c.month))
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((c) => {
      const spendCents = MARKETING_CHANNELS.reduce((n, ch) => n + (c.spendByChannel[ch] ?? 0), 0)
      const mature = isMonthMature(c.month, now)
      const paying = Math.max(0, c.totalPaying)
      const trials = Math.max(0, c.totalSignups)
      const cacCents = paying > 0 && spendCents > 0 ? Math.round(spendCents / paying) : null
      // Zero conversions at maturity beats the ceiling only when the spend
      // alone does — one conversion at that spend would still be over.
      const overCeiling =
        mature &&
        spendCents > 0 &&
        (cacCents != null ? cacCents > CAC_DIAL_DOWN_CENTS : spendCents > CAC_DIAL_DOWN_CENTS)
      const channels: MonthChannelDial[] = MARKETING_CHANNELS.filter(
        (ch) => (c.spendByChannel[ch] ?? 0) > 0 || (c.signupsByChannel[ch] ?? 0) > 0,
      ).map((ch) => {
        const spend = c.spendByChannel[ch] ?? 0
        const chTrials = c.signupsByChannel[ch] ?? 0
        const costPerTrialCents = spend > 0 && chTrials > 0 ? Math.round(spend / chTrials) : null
        const barCents = CHANNEL_TRIAL_BARS[ch]
        let bar: MonthChannelDial['bar'] = null
        if (barCents != null && spend > 0) {
          bar = chTrials === 0 ? 'no_trials' : costPerTrialCents! <= barCents ? 'within' : 'over'
        }
        return { channel: ch, spendCents: spend, trials: chTrials, costPerTrialCents, bar }
      })
      return { month: c.month, mature, spendCents, paying, trials, cacCents, overCeiling, channels }
    })

  const spent = months.filter((m) => m.spendCents > 0)
  if (spent.length === 0) {
    return {
      months,
      recommendation: 'no_spend',
      reason: 'No spend recorded yet — the plan below is where the first $1,000 goes.',
    }
  }

  const mature = spent.filter((m) => m.mature)
  if (mature.length === 0) {
    const latest = spent[spent.length - 1]
    return {
      months,
      recommendation: 'collecting',
      reason: `Spend is in and the ${CAC_LAG_DAYS}-day conversion window is still running on ${latest.month} — no verdict yet, and that’s the honest answer.`,
    }
  }

  // Dial down: the last two mature months BOTH over the ceiling.
  const lastTwo = mature.slice(-2)
  if (lastTwo.length === 2 && lastTwo.every((m) => m.overCeiling)) {
    return {
      months,
      recommendation: 'dial_down',
      reason: `Blended CAC has been over ${centsFmt(CAC_DIAL_DOWN_CENTS)} for two straight judged months — dial down and fix trial→paid before spending more.`,
    }
  }

  const latest = mature[mature.length - 1]
  if (latest.cacCents != null && latest.cacCents < CAC_DIAL_UP_CENTS) {
    return {
      months,
      recommendation: 'dial_up',
      reason: `${latest.month} came in at ${centsFmt(latest.cacCents)} per paying clinic — under the ${centsFmt(CAC_DIAL_UP_CENTS)} bar. The dial says up: add budget to what’s converting.`,
    }
  }

  return {
    months,
    recommendation: 'hold',
    reason:
      latest.cacCents != null
        ? `${latest.month} blended CAC: ${centsFmt(latest.cacCents)} — between the bars. Hold, and keep working trial→paid.`
        : `${latest.month} spent ${centsFmt(latest.spendCents)} with no paying clinic attributed yet — under the ceiling, but watch the per-channel bars below.`,
  }
}
