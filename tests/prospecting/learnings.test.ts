import { describe, it, expect } from 'vitest'
import {
  lossReasonForSuppression,
  buildOutreachLearnings,
  summarizeLearnings,
  LEARNINGS_MIN_SAMPLE,
} from '@/lib/prospect-learnings'
import type { WinLossReport } from '@/lib/types/prospecting'

function report(over: Partial<WinLossReport> = {}): WinLossReport {
  return {
    windowDays: 90,
    won: 6,
    lost: 6,
    winRatePct: 50,
    lossReasons: [
      { reason: 'using_competitor', label: 'Happy with a competitor', count: 4 },
      { reason: 'price', label: 'Too expensive', count: 2 },
    ],
    segments: [
      { segment: 'weak_presence', label: 'Weak presence', won: 4, lost: 1, winRatePct: 80 },
      { segment: 'no_website', label: 'No website', won: 2, lost: 5, winRatePct: 29 },
    ],
    avgTouchesToWin: 2.5,
    ...over,
  }
}

describe('lossReasonForSuppression', () => {
  it('maps the known suppression reasons and defaults to other', () => {
    expect(lossReasonForSuppression('unsub')).toBe('unsubscribed')
    expect(lossReasonForSuppression('bounce')).toBe('bounced')
    expect(lossReasonForSuppression('complaint')).toBe('replied_no')
    expect(lossReasonForSuppression('reply_not_interested')).toBe('replied_no')
    expect(lossReasonForSuppression('existing_customer')).toBe('no_need')
    expect(lossReasonForSuppression('whatever')).toBe('other')
  })
})

describe('buildOutreachLearnings', () => {
  it('returns empty below the min sample (a thin sample never skews the pitch)', () => {
    expect(buildOutreachLearnings(report({ won: 2, lost: 2 }))).toBe('')
    // exactly at the threshold it engages
    expect(buildOutreachLearnings(report({ won: LEARNINGS_MIN_SAMPLE, lost: 0 }))).not.toBe('')
  })

  it('surfaces the best-converting profile and the top actionable objection', () => {
    const out = buildOutreachLearnings(report())
    expect(out).toContain("WHAT'S WORKING")
    expect(out).toContain('Weak presence')
    expect(out).toContain('80%')
    expect(out.toLowerCase()).toContain('happy with a competitor')
  })

  it('ignores non-actionable loss reasons (no_response/bounced) for the preempt line', () => {
    const out = buildOutreachLearnings(
      report({
        lossReasons: [
          { reason: 'no_response', label: 'Went quiet / no response', count: 9 },
          { reason: 'bounced', label: 'Email bounced / undeliverable', count: 3 },
        ],
      }),
    )
    // A best segment still shows, but no "most common reason we lose" preempt.
    expect(out).not.toContain('Most common reason we lose')
  })

  it('returns empty when nothing actionable surfaces at all', () => {
    const out = buildOutreachLearnings(
      report({
        segments: [{ segment: 'no_website', label: 'No website', won: 1, lost: 1, winRatePct: 50 }],
        lossReasons: [{ reason: 'no_response', label: 'Went quiet / no response', count: 12 }],
      }),
    )
    // segment sample < 3 → no best-segment line; loss reason non-actionable → empty
    expect(out).toBe('')
  })
})

describe('summarizeLearnings', () => {
  it('returns [] below the min sample', () => {
    expect(summarizeLearnings(report({ won: 1, lost: 1 }))).toEqual([])
  })

  it('gives human one-liners for the panel', () => {
    const out = summarizeLearnings(report())
    expect(out.join(' ')).toContain('50%')
    expect(out.join(' ')).toContain('Weak presence')
    expect(out.join(' ').toLowerCase()).toContain('happy with a competitor')
    expect(out.join(' ')).toContain('2.5')
  })
})
