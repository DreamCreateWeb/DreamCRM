import { describe, it, expect } from 'vitest'
import { followUpForOutcome, followUpDueLabel } from '@/lib/prospect-followup'

/**
 * The follow-up cadence — a non-terminal call outcome schedules the next
 * nudge so a warm prospect never goes cold; a terminal one clears it.
 */

const NOW = new Date('2026-07-04T12:00:00Z')
const day = 24 * 60 * 60 * 1000

describe('followUpForOutcome', () => {
  it('schedules callbacks soonest, voicemail/no-answer a bit later', () => {
    expect(followUpForOutcome('callback', NOW).at!.getTime()).toBe(NOW.getTime() + 1 * day)
    expect(followUpForOutcome('voicemail', NOW).at!.getTime()).toBe(NOW.getTime() + 2 * day)
    expect(followUpForOutcome('no_answer', NOW).at!.getTime()).toBe(NOW.getTime() + 2 * day)
    expect(followUpForOutcome('callback', NOW).reason).toMatch(/callback/i)
  })

  it('clears the follow-up on a terminal outcome', () => {
    for (const o of ['demo_booked', 'won', 'not_interested', 'anything_else']) {
      expect(followUpForOutcome(o, NOW)).toEqual({ at: null, reason: null })
    }
  })
})

describe('followUpDueLabel', () => {
  it('reads naturally relative to now', () => {
    expect(followUpDueLabel(new Date(NOW.getTime()), NOW)).toBe('due today')
    expect(followUpDueLabel(new Date(NOW.getTime() - day), NOW)).toBe('due yesterday')
    expect(followUpDueLabel(new Date(NOW.getTime() - 3 * day), NOW)).toBe('due 3 days ago')
  })
})
