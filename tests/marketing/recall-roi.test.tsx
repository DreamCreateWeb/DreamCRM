import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PLAN_PRICE_MONTHLY,
  VISITS_PER_PATIENT_PER_YEAR,
  WIN_BACK_SCENARIOS,
  computeRecallRoi,
} from '@/lib/recall-roi'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import RoiCalculator from '@/app/(marketing)/roi/roi-calculator'

/**
 * The recall-revenue calculator (marketing-engine Part 9 A①). The math is
 * the product here, and its honesty laws are the grader's: arithmetic on
 * the visitor's inputs, hedged scenarios (never one rosy number), junk
 * degrades to zeros — never NaN on a marketing page.
 */

describe('computeRecallRoi', () => {
  it('the headline is pure arithmetic on the inputs', () => {
    const r = computeRecallRoi({ activePatients: 1000, onSchedulePct: 60, visitValue: 150 })
    expect(r.offSchedulePatients).toBe(400)
    expect(r.missedVisitsPerYear).toBe(400 * VISITS_PER_PATIENT_PER_YEAR)
    expect(r.atStakePerYear).toBe(800 * 150)
    expect(r.atStakePerMonth).toBe(Math.round((800 * 150) / 12))
  })

  it('the scenarios stay hedged: three of them, all capped well under 100%', () => {
    const r = computeRecallRoi({ activePatients: 1000, onSchedulePct: 60, visitValue: 150 })
    expect(r.scenarios).toHaveLength(3)
    for (const s of r.scenarios) {
      expect(s.ratePct).toBeLessThanOrEqual(40)
      expect(s.revenuePerYear).toBeLessThan(r.atStakePerYear)
    }
    // Ordered cautious → strong, and monotone.
    expect(r.scenarios[0].revenuePerYear).toBeLessThan(r.scenarios[2].revenuePerYear)
    expect(WIN_BACK_SCENARIOS.every((s) => s.rate < 1)).toBe(true)
  })

  it('the break-even line divides the real plan price by the visitor’s own fee', () => {
    const r = computeRecallRoi({ activePatients: 1000, onSchedulePct: 60, visitValue: 150 })
    expect(r.breakEvenVisitsPerMonth).toBe(Math.ceil(PLAN_PRICE_MONTHLY / 150))
    // A $600 visit → 1; zero fee → no line rather than Infinity.
    expect(computeRecallRoi({ activePatients: 100, onSchedulePct: 0, visitValue: 600 }).breakEvenVisitsPerMonth).toBe(1)
    expect(computeRecallRoi({ activePatients: 100, onSchedulePct: 0, visitValue: 0 }).breakEvenVisitsPerMonth).toBe(0)
  })

  it('junk degrades to zeros, never NaN — this renders on a public page', () => {
    const r = computeRecallRoi({ activePatients: NaN, onSchedulePct: 400, visitValue: -50 })
    expect(r.atStakePerYear).toBe(0)
    expect(r.offSchedulePatients).toBe(0)
    expect(Number.isNaN(r.atStakePerMonth)).toBe(false)
    // 100% on schedule = honestly nothing at stake.
    expect(computeRecallRoi({ activePatients: 2000, onSchedulePct: 100, visitValue: 200 }).atStakePerYear).toBe(0)
  })
})

describe('the calculator surface', () => {
  it('renders inputs, the headline, three scenarios, the break-even line, and the privacy promise', () => {
    render(<RoiCalculator />)
    expect(screen.getByLabelText('Active patients')).toBeInTheDocument()
    expect(screen.getByText(/Left on the table each year/i)).toBeInTheDocument()
    expect(screen.getByText(/Cautious/)).toBeInTheDocument()
    expect(screen.getByText(/Strong/)).toBeInTheDocument()
    expect(screen.getByText(/break-even line/i)).toBeInTheDocument()
    expect(screen.getByText(/not a projection/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing you type is sent, stored, or seen by us/i)).toBeInTheDocument()
  })

  it('/roi is a public marketing path (middleware + sitemap in one move)', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/roi')
  })
})
