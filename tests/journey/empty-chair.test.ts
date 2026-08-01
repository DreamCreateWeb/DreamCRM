import { describe, it, expect } from 'vitest'
import {
  FILL_WINDOW_START_DAYS,
  FILL_WINDOW_END_DAYS,
  SOFT_DAY_RATIO,
  MIN_SOFT_DAYS,
  MIN_DAY_OPENINGS,
  softDays,
  worthFilling,
  openCount,
  describeDays,
  fillSubject,
  fillBody,
  fillLedgerSummary,
  fillCardTitle,
  planStillTrue,
  type DayLoad,
} from '@/lib/empty-chair'

/**
 * THE EMPTY CHAIR (Phase 5, limb 2), pure half.
 *
 * The judgement calls — which days count as quiet, whether a week is worth
 * interrupting a human about, whether a card that named specific days is
 * still true — are the parts worth pinning, and none of them need a database.
 */

const day = (over: Partial<DayLoad> = {}): DayLoad => ({
  dateKey: '2026-08-06',
  label: 'Thursday',
  open: 10,
  total: 16,
  ...over,
})

describe('the window', () => {
  it('starts far enough out that an invitation can still be acted on', () => {
    // Nobody rearranges their week for a cleaning on eighteen hours' notice.
    expect(FILL_WINDOW_START_DAYS).toBeGreaterThanOrEqual(2)
  })

  it('spans exactly seven days, so a weekday never appears twice', () => {
    // The card names days by weekday ("Thursday and Friday"). An eight-day
    // window would put the same weekday at both ends and the sentence would
    // stop meaning one thing.
    expect(FILL_WINDOW_END_DAYS - FILL_WINDOW_START_DAYS + 1).toBe(7)
  })
})

describe('which days count as quiet', () => {
  it('a day at or above the ratio is soft; below it is not', () => {
    expect(softDays([day({ open: 8, total: 16 })])).toHaveLength(1) // exactly 0.5
    expect(softDays([day({ open: 7, total: 16 })])).toHaveLength(0)
    expect(SOFT_DAY_RATIO).toBe(0.5)
  })

  it('IGNORES a day with almost no openings — half of four slots is not a campaign', () => {
    expect(softDays([day({ open: 4, total: 4 })])).toHaveLength(0)
    expect(softDays([day({ open: MIN_DAY_OPENINGS, total: MIN_DAY_OPENINGS })])).toHaveLength(1)
  })

  it('preserves the caller’s order, so the card reads in date order', () => {
    const out = softDays([
      day({ label: 'Wednesday', dateKey: 'w' }),
      day({ label: 'Thursday', dateKey: 't', open: 2, total: 16 }),
      day({ label: 'Friday', dateKey: 'f' }),
    ])
    expect(out.map((d) => d.label)).toEqual(['Wednesday', 'Friday'])
  })
})

describe('is it worth interrupting a human', () => {
  it('one quiet day is a Tuesday — two is a week worth doing something about', () => {
    expect(worthFilling([day()])).toBe(false)
    expect(worthFilling([day({ dateKey: 'a' }), day({ dateKey: 'b' })])).toBe(true)
    expect(MIN_SOFT_DAYS).toBe(2)
  })

  it('a full week says nothing', () => {
    expect(worthFilling([day({ open: 1, total: 16 }), day({ open: 0, total: 16 })])).toBe(false)
  })

  it('an empty window says nothing rather than reporting a perfect week', () => {
    expect(worthFilling([])).toBe(false)
    expect(openCount([])).toBe(0)
  })

  it('counts the openings only on the days it will actually name', () => {
    const days = [
      day({ dateKey: 'a', open: 10, total: 16 }),
      day({ dateKey: 'b', open: 2, total: 16 }), // busy — not named, not counted
      day({ dateKey: 'c', open: 12, total: 16 }),
    ]
    expect(openCount(days)).toBe(22)
  })
})

describe('the way a person says it', () => {
  it('lists one, two and three days the way a human would', () => {
    expect(describeDays(['Thursday'])).toBe('Thursday')
    expect(describeDays(['Thursday', 'Friday'])).toBe('Thursday and Friday')
    expect(describeDays(['Wed', 'Thu', 'Fri'])).toBe('Wed, Thu and Fri')
  })

  it('degrades to nothing rather than rendering an empty list', () => {
    expect(describeDays([])).toBe('')
    expect(describeDays(['  ', ''])).toBe('')
  })

  it('the subject line is about the reader’s actual week, not "we have openings"', () => {
    expect(fillSubject(['Thursday', 'Friday'])).toBe('We’ve got room Thursday and Friday')
  })

  it('still writes a sendable subject when the days went missing', () => {
    expect(fillSubject([])).toBe('We’ve got room this week')
  })

  it('the body is hospitality, never a confession — no shame, no desperation', () => {
    const body = fillBody(['Thursday', 'Friday'])
    expect(body).toContain('{{firstName}}')
    expect(body).toContain('on Thursday and Friday')
    // Anti-shame law: never tell a patient how long they've been away, and
    // never let the practice sound like it is begging.
    for (const forbidden of ['overdue', 'haven’t seen you', 'empty', 'slow', 'desperate', 'last chance']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('the card title leads with the number, then the ask', () => {
    const days = [
      day({ dateKey: 'a', label: 'Thursday', open: 10, total: 16 }),
      day({ dateKey: 'b', label: 'Friday', open: 12, total: 16 }),
    ]
    expect(fillCardTitle(days, 34)).toBe(
      '22 open times Thursday and Friday — invite 34 patients who are due?',
    )
  })

  it('the ledger sentence names who and when, and gets its singulars right', () => {
    expect(fillLedgerSummary(34, ['Thursday', 'Friday'])).toBe(
      'Invited 34 patients in for Thursday and Friday',
    )
    expect(fillLedgerSummary(1, ['Thursday'])).toBe('Invited 1 patient in for Thursday')
    expect(fillLedgerSummary(9, [])).toBe('Invited 9 patients in this week')
  })
})

describe('is the card still true', () => {
  const window = [
    day({ dateKey: '2026-08-06', label: 'Thursday' }),
    day({ dateKey: '2026-08-07', label: 'Friday' }),
  ]

  it('true while every named day is still in the window and still quiet', () => {
    expect(planStillTrue(['2026-08-06', '2026-08-07'], window)).toBe(true)
  })

  it('FALSE when one named day filled up — the email names them all', () => {
    const filled = [window[0], day({ dateKey: '2026-08-07', label: 'Friday', open: 1, total: 16 })]
    expect(planStillTrue(['2026-08-06', '2026-08-07'], filled)).toBe(false)
  })

  it('FALSE when a named day has come and gone — an invitation to last Thursday is wrong, not late', () => {
    expect(planStillTrue(['2026-08-06', '2026-08-07'], [window[1]])).toBe(false)
  })

  it('FALSE with no named days at all — a card that promised nothing cannot be kept', () => {
    expect(planStillTrue([], window)).toBe(false)
  })
})
