import { describe, it, expect } from 'vitest'
import {
  CAC_DIAL_DOWN_CENTS,
  CAC_DIAL_UP_CENTS,
  CAC_LAG_DAYS,
  CHANNEL_TRIAL_BARS,
  SPENDABLE_CHANNELS,
  assessDials,
  isMonthMature,
  monthKeyOf,
  type MonthCohortInput,
} from '@/lib/marketing-dials'
import { MARKETING_CHANNELS } from '@/lib/marketing-attribution'

/** 2026-09-08: June is mature (lag ran out Aug 30), July is not (Sep 30). */
const NOW = new Date('2026-09-08T12:00:00Z')

function cohort(over: Partial<MonthCohortInput> & { month: string }): MonthCohortInput {
  return {
    spendByChannel: {},
    signupsByChannel: {},
    payingByChannel: {},
    totalSignups: 0,
    totalPaying: 0,
    ...over,
  }
}

describe('month math', () => {
  it('keys months in UTC', () => {
    expect(monthKeyOf(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09')
    expect(monthKeyOf(new Date('2026-08-31T23:59:59Z'))).toBe('2026-08')
  })
  it('a month matures exactly one lag after it ends', () => {
    const end = Date.UTC(2026, 6, 1) // July 1 = June's end
    const lagMs = CAC_LAG_DAYS * 24 * 60 * 60 * 1000
    expect(isMonthMature('2026-06', new Date(end + lagMs - 1))).toBe(false)
    expect(isMonthMature('2026-06', new Date(end + lagMs))).toBe(true)
    expect(isMonthMature('2026-06', NOW)).toBe(true)
    expect(isMonthMature('2026-07', NOW)).toBe(false)
  })
})

describe('assessDials — the recommendation', () => {
  it('no spend recorded → step one (show the plan), never a verdict', () => {
    const a = assessDials([cohort({ month: '2026-08', totalSignups: 3 })], NOW)
    expect(a.recommendation).toBe('no_spend')
  })

  it('fresh spend inside the lag → collecting, not a scare', () => {
    const a = assessDials(
      [cohort({ month: '2026-08', spendByChannel: { google_ads: 1000_00 } })],
      NOW,
    )
    expect(a.recommendation).toBe('collecting')
    expect(a.reason).toContain(`${CAC_LAG_DAYS}-day`)
    expect(a.months[0].mature).toBe(false)
  })

  it('a mature month under the dial-up bar with real conversions → dial up', () => {
    const a = assessDials(
      [
        cohort({
          month: '2026-06',
          spendByChannel: { google_ads: 1500_00 },
          totalSignups: 10,
          totalPaying: 2, // $750 CAC
        }),
      ],
      NOW,
    )
    expect(a.recommendation).toBe('dial_up')
    expect(a.months[0].cacCents).toBe(750_00)
    expect(a.months[0].cacCents).toBeLessThan(CAC_DIAL_UP_CENTS)
  })

  it('two consecutive mature months over the ceiling → dial down', () => {
    const a = assessDials(
      [
        cohort({ month: '2026-05', spendByChannel: { google_ads: 2000_00 }, totalSignups: 4, totalPaying: 1 }),
        cohort({ month: '2026-06', spendByChannel: { google_ads: 1800_00 }, totalSignups: 3, totalPaying: 1 }),
      ],
      NOW,
    )
    expect(a.recommendation).toBe('dial_down')
    expect(a.months.every((m) => m.overCeiling)).toBe(true)
  })

  it('one bad month does not dial down — the rule says two consecutive', () => {
    const a = assessDials(
      [
        cohort({ month: '2026-05', spendByChannel: { google_ads: 1000_00 }, totalSignups: 5, totalPaying: 1 }), // $1000 — fine
        cohort({ month: '2026-06', spendByChannel: { google_ads: 2000_00 }, totalSignups: 3, totalPaying: 1 }), // $2000 — over
      ],
      NOW,
    )
    expect(a.recommendation).not.toBe('dial_down')
  })

  it('zero conversions is not an infinite CAC: $1k mature with nothing paying stays under the ceiling', () => {
    const a = assessDials(
      [cohort({ month: '2026-06', spendByChannel: { google_ads: 1000_00 }, totalSignups: 2 })],
      NOW,
    )
    const m = a.months[0]
    expect(m.cacCents).toBeNull()
    expect(m.overCeiling).toBe(false) // one conversion would have been $1,000 — under the bar
    expect(a.recommendation).toBe('hold')
    expect(a.reason).toContain('no paying clinic')
  })

  it('…but zero conversions on spend the ceiling itself cannot excuse DOES count against it', () => {
    const a = assessDials(
      [
        cohort({ month: '2026-05', spendByChannel: { google_ads: 2000_00 } }),
        cohort({ month: '2026-06', spendByChannel: { google_ads: 2000_00 } }),
      ],
      NOW,
    )
    expect(a.months.every((m) => m.overCeiling)).toBe(true)
    expect(a.recommendation).toBe('dial_down')
  })

  it('blended means blended: untracked paying clinics lower the CAC', () => {
    const a = assessDials(
      [
        cohort({
          month: '2026-06',
          spendByChannel: { google_ads: 1500_00 },
          signupsByChannel: { google_ads: 2 },
          payingByChannel: { google_ads: 1 },
          totalSignups: 4,
          totalPaying: 2, // one attributed + one untracked
        }),
      ],
      NOW,
    )
    expect(a.months[0].cacCents).toBe(750_00)
  })

  it('immature months are shown but never judged: the verdict reads only mature ones', () => {
    const a = assessDials(
      [
        cohort({ month: '2026-06', spendByChannel: { google_ads: 1500_00 }, totalSignups: 6, totalPaying: 2 }),
        cohort({ month: '2026-08', spendByChannel: { google_ads: 5000_00 } }), // fresh, scary, immature
      ],
      NOW,
    )
    expect(a.recommendation).toBe('dial_up') // June's $750, not August's zero-converts
  })

  it('malformed month keys are dropped, never judged', () => {
    const a = assessDials([cohort({ month: 'junk', spendByChannel: { google_ads: 9_999_00 } })], NOW)
    expect(a.months).toHaveLength(0)
    expect(a.recommendation).toBe('no_spend')
  })
})

describe('assessDials — the per-channel bars', () => {
  it('google spend under $120/trial is within the bar; over is over; no signups is called out', () => {
    const run = (trials: number, spend = 600_00) =>
      assessDials(
        [
          cohort({
            month: '2026-06',
            spendByChannel: { google_ads: spend },
            signupsByChannel: trials > 0 ? { google_ads: trials } : {},
            totalSignups: trials,
          }),
        ],
        NOW,
      ).months[0].channels.find((c) => c.channel === 'google_ads')!

    expect(run(6)).toMatchObject({ costPerTrialCents: 100_00, bar: 'within' })
    expect(run(4)).toMatchObject({ costPerTrialCents: 150_00, bar: 'over' })
    expect(run(0)).toMatchObject({ costPerTrialCents: null, bar: 'no_trials' })
  })

  it('channels without a bar report spend and cost but no verdict', () => {
    const m = assessDials(
      [
        cohort({
          month: '2026-06',
          spendByChannel: { referral: 500_00 },
          signupsByChannel: { referral: 1 },
          totalSignups: 1,
        }),
      ],
      NOW,
    ).months[0]
    expect(m.channels.find((c) => c.channel === 'referral')).toMatchObject({
      costPerTrialCents: 500_00,
      bar: null,
    })
  })

  it('the bar registry and the spendable list only name real channels', () => {
    for (const c of Object.keys(CHANNEL_TRIAL_BARS)) {
      expect(MARKETING_CHANNELS).toContain(c)
    }
    for (const c of SPENDABLE_CHANNELS) {
      expect(MARKETING_CHANNELS).toContain(c)
    }
  })
})
