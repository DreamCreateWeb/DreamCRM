import { describe, it, expect } from 'vitest'

/**
 * Deliverability watchdog math — the immune system. Below the sample floor
 * never trips; strict `>` at the threshold; bounce and complaint paths;
 * disabled never trips; zero sends never divides.
 */

import { assessDeliverability } from '@/lib/prospect-deliverability'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const wd = (over: Partial<(typeof PROSPECTING_DEFAULTS)['watchdog']> = {}) => ({
  ...PROSPECTING_DEFAULTS.watchdog,
  ...over,
})

describe('assessDeliverability', () => {
  it('never trips below the minimum sample', () => {
    // 3 bounces on 10 sends = 30%, but minSends is 20.
    const v = assessDeliverability({ sent: 10, bounces: 3, complaints: 0 }, wd())
    expect(v.tripped).toBe(false)
    expect(v.bouncePct).toBe(30)
  })

  it('trips on bounce rate strictly above the threshold', () => {
    // maxBouncePct 5; 6/100 = 6% > 5 → trip.
    const v = assessDeliverability({ sent: 100, bounces: 6, complaints: 0 }, wd())
    expect(v.tripped).toBe(true)
    expect(v.reason).toContain('bounce rate 6.0%')
  })

  it('does NOT trip exactly at the threshold (strict >)', () => {
    // 5/100 = exactly 5%.
    expect(assessDeliverability({ sent: 100, bounces: 5, complaints: 0 }, wd()).tripped).toBe(false)
  })

  it('trips on complaint rate above the fractional threshold', () => {
    // maxComplaintPct 0.3; 1/100 = 1% > 0.3 → trip.
    const v = assessDeliverability({ sent: 100, bounces: 0, complaints: 1 }, wd())
    expect(v.tripped).toBe(true)
    expect(v.reason).toContain('complaint rate')
  })

  it('disabled watchdog never trips', () => {
    expect(assessDeliverability({ sent: 100, bounces: 50, complaints: 50 }, wd({ enabled: false })).tripped).toBe(false)
  })

  it('zero sends never divides by zero', () => {
    const v = assessDeliverability({ sent: 0, bounces: 0, complaints: 0 }, wd())
    expect(v.tripped).toBe(false)
    expect(v.bouncePct).toBe(0)
    expect(v.complaintPct).toBe(0)
  })
})
