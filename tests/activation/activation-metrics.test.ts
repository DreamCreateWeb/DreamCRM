import { describe, it, expect } from 'vitest'
import { A1_TARGET_HOURS, COHORT_DAYS, computeActivationMetrics, describeHours, hoursTo, inCohort, median } from '@/lib/activation-metrics'
import { STUCK } from '@/lib/first-week'
import type { Activation } from '@/lib/activation'

/**
 * docs/ACTIVATION.md law 7 — activation is measured. The pure arithmetic
 * over the stamps: the cohort window, time from org creation to each
 * event, the median, the share inside the 48-hour line, and the count
 * stuck without data past day 3.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const H = 60 * 60 * 1000
const ago = (hours: number) => new Date(NOW.getTime() - hours * H)
const NONE: Activation = { a1: null, a2: null, a3: null, a4: null, a5: null }
const row = (createdHoursAgo: number, over: Partial<Activation> = {}) => ({ createdAt: ago(createdHoursAgo), activation: { ...NONE, ...over } })

describe('the arithmetic', () => {
  it('hoursTo counts from creation and floors imported history at zero', () => {
    expect(hoursTo(ago(10), ago(4))).toBe(6)
    expect(hoursTo(ago(4), ago(10))).toBe(0)
  })
  it('median handles odd, even and empty', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('describeHours reads like a person says it', () => {
    expect(describeHours(null)).toBe('—')
    expect(describeHours(0.4)).toBe('24m')
    expect(describeHours(6.4)).toBe('6h')
    expect(describeHours(30)).toBe('1.3 days')
    expect(describeHours(48)).toBe('2 days')
    expect(describeHours(24 * 12.4)).toBe('12 days')
  })
  it('the cohort is the window, nothing before it and nothing from the future', () => {
    const rows = [row(1), row(24 * (COHORT_DAYS - 1)), row(24 * (COHORT_DAYS + 1)), row(-5)]
    expect(inCohort(rows, NOW)).toHaveLength(2)
  })
})

describe('computeActivationMetrics', () => {
  it('reports each event reached + its median time, the 48h share, and who is stuck past day 3', () => {
    const rows = [
      row(24 * 10, { a1: ago(24 * 10 - 12), a2: ago(24 * 9) }), // A1 in 12h, A2 in 24h
      row(24 * 5, { a1: ago(24 * 5 - 60) }), // A1 in 60h — outside the line
      row(24 * 4), // no A1, day 4 — stuck
      row(24 * 1), // no A1, day 1 — not stuck yet
    ]
    const m = computeActivationMetrics(rows, NOW)
    expect(m.clinics).toBe(4)
    const a1 = m.events.find((e) => e.key === 'a1')!
    expect(a1.reached).toBe(2)
    expect(a1.medianHours).toBe(36)
    const a2 = m.events.find((e) => e.key === 'a2')!
    expect(a2).toMatchObject({ reached: 1, medianHours: 24 })
    expect(m.events.find((e) => e.key === 'a5')).toMatchObject({ reached: 0, medianHours: null })
    // The day-1 clinic without A1 is undecided, not a miss: 1 of 3 judged (audit round 2).
    expect(m.a1Within).toEqual({ reached: 1, decided: 3, share: 1 / 3 })
    expect(m.noDataPastDue).toBe(1)
    expect(STUCK.noDataByDay).toBe(3)
    expect(A1_TARGET_HOURS).toBe(48)
  })
  it('a cohort of fresh signups alone has no 48h share yet — null, not 0%', () => {
    const m = computeActivationMetrics([row(2), row(20)], NOW)
    expect(m.a1Within).toEqual({ reached: 0, decided: 0, share: null })
    expect(computeActivationMetrics([row(2, { a1: ago(1) }), row(20)], NOW).a1Within).toEqual({ reached: 1, decided: 1, share: 1 })
  })
  it('an empty cohort has null shares and medians, never zeros dressed as facts', () => {
    const m = computeActivationMetrics([], NOW)
    expect(m.clinics).toBe(0)
    expect(m.a1Within).toEqual({ reached: 0, decided: 0, share: null })
    expect(m.events.every((e) => e.medianHours === null && e.reached === 0)).toBe(true)
    expect(m.events.map((e) => e.key)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
  })
})
