import { describe, it, expect } from 'vitest'
import {
  todayYmd,
  addDaysYmd,
  followupDueState,
  formatDueLabel,
} from '@/lib/types/followups'

const TODAY = '2026-06-18'

describe('todayYmd / addDaysYmd', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(todayYmd(new Date(2026, 5, 18, 9, 0, 0))).toBe('2026-06-18')
    expect(todayYmd(new Date(2026, 0, 3))).toBe('2026-01-03') // zero-padded
  })
  it('adds days across month boundaries', () => {
    expect(addDaysYmd('2026-06-18', 3)).toBe('2026-06-21')
    expect(addDaysYmd('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysYmd('2026-06-18', -3)).toBe('2026-06-15')
  })
})

describe('followupDueState', () => {
  it('classifies relative to today', () => {
    expect(followupDueState('2026-06-15', TODAY)).toBe('overdue')
    expect(followupDueState('2026-06-18', TODAY)).toBe('today')
    expect(followupDueState('2026-06-21', TODAY)).toBe('soon') // within 7 days
    expect(followupDueState('2026-06-25', TODAY)).toBe('soon') // exactly +7
    expect(followupDueState('2026-07-10', TODAY)).toBe('later')
    expect(followupDueState(null, TODAY)).toBe('none')
  })
})

describe('formatDueLabel', () => {
  it('renders friendly relative labels', () => {
    expect(formatDueLabel('2026-06-18', TODAY)).toBe('Today')
    expect(formatDueLabel('2026-06-19', TODAY)).toBe('Tomorrow')
    expect(formatDueLabel('2026-06-15', TODAY)).toBe('Overdue · Jun 15')
    expect(formatDueLabel('2026-06-25', TODAY)).toBe('Jun 25')
    expect(formatDueLabel(null, TODAY)).toBe('No due date')
  })
})
