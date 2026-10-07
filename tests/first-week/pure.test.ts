import { describe, it, expect } from 'vitest'
import { ACTIVATION_EVENTS, STUCK, activationProgress, dayNumber, daysSince, stageOf, stuckFlags, type FirstWeekRowInput } from '@/lib/first-week'

/**
 * The cockpit's pure half (docs/ACTIVATION.md Parts 3 + 5): day arithmetic,
 * activation progress, the stage word, and the STUCK sentences — each rule
 * fires on its threshold and names the next move, and a healthy row says
 * nothing.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function row(overrides: Partial<FirstWeekRowInput> = {}): FirstWeekRowInput {
  return {
    createdAt: daysAgo(1),
    facts: [],
    patientCount: 0,
    workLast7: 0,
    openCards: 0,
    oldestOpenCardAt: null,
    lastStaffSignInAt: daysAgo(0),
    activation: { a1: null, a2: null, a3: null, a4: null, a5: null },
    pendingOnUs: [],
    digestOn: true,
    ...overrides,
  }
}

describe('day arithmetic + stage', () => {
  it('counts whole days since the org was made, never negative', () => {
    expect(dayNumber(daysAgo(0), NOW)).toBe(0)
    expect(dayNumber(daysAgo(6), NOW)).toBe(6)
    expect(dayNumber(new Date(NOW.getTime() + 60_000), NOW)).toBe(0)
    expect(daysSince(null, NOW)).toBeNull()
    expect(daysSince(daysAgo(3), NOW)).toBe(3)
  })

  it('names the stage by the day', () => {
    expect(stageOf(row({ createdAt: daysAgo(0) }), NOW)).toBe('new')
    expect(stageOf(row({ createdAt: daysAgo(3) }), NOW)).toBe('first-week')
    expect(stageOf(row({ createdAt: daysAgo(20) }), NOW)).toBe('first-month')
    expect(stageOf(row({ createdAt: daysAgo(45) }), NOW)).toBe('settled')
  })
})

describe('activation progress', () => {
  it('lists the five events in order and names the next one', () => {
    expect(ACTIVATION_EVENTS.map((e) => e.key)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
    expect(activationProgress({ a1: null, a2: null, a3: null, a4: null, a5: null })).toEqual({ done: [], next: 'a1' })
    expect(activationProgress({ a1: daysAgo(2), a2: daysAgo(1), a3: null, a4: null, a5: null })).toEqual({ done: ['a1', 'a2'], next: 'a3' })
    expect(activationProgress({ a1: null, a2: daysAgo(1), a3: null, a4: null, a5: daysAgo(1) })).toEqual({ done: ['a2', 'a5'], next: 'a1' })
    expect(activationProgress({ a1: daysAgo(5), a2: daysAgo(4), a3: daysAgo(3), a4: daysAgo(2), a5: daysAgo(1) }).next).toBeNull()
  })
})

describe('stuck flags', () => {
  it('a healthy new clinic is not stuck', () => {
    expect(stuckFlags(row(), NOW)).toEqual([])
  })

  it('no data by day 3 names the PMS call; before day 3 it waits', () => {
    expect(stuckFlags(row({ createdAt: daysAgo(STUCK.noDataByDay - 1) }), NOW)).toEqual([])
    const flags = stuckFlags(row({ createdAt: daysAgo(STUCK.noDataByDay) }), NOW)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatch(/No data by day 3 — call about the PMS/)
    expect(stuckFlags(row({ createdAt: daysAgo(STUCK.noDataByDay), activation: { a1: daysAgo(2), a2: null, a3: null, a4: null, a5: null } }), NOW)).toEqual([])
  })

  it('nobody signed in by day 7 vs. staff went quiet for 7 days are different sentences', () => {
    const never = stuckFlags(row({ createdAt: daysAgo(7), lastStaffSignInAt: null, activation: { a1: daysAgo(6), a2: null, a3: null, a4: null, a5: null }, workLast7: 3 }), NOW)
    expect(never).toEqual([expect.stringMatching(/No active staff session yet/)])
    const quiet = stuckFlags(row({ createdAt: daysAgo(20), lastStaffSignInAt: daysAgo(9), activation: { a1: daysAgo(19), a2: null, a3: null, a4: null, a5: null }, workLast7: 3 }), NOW)
    expect(quiet).toEqual([expect.stringMatching(/No active staff session for 9 days/)])
    expect(stuckFlags(row({ createdAt: daysAgo(2), lastStaffSignInAt: null }), NOW)).toEqual([])
  })

  it('the machine going quiet counts only once data is connected and the clinic is a week old', () => {
    const quietMachine = row({ createdAt: daysAgo(10), activation: { a1: daysAgo(9), a2: null, a3: null, a4: null, a5: null }, workLast7: 0 })
    expect(stuckFlags(quietMachine, NOW)).toEqual([expect.stringMatching(/machine did nothing this week — check the Guardian/)])
    expect(stuckFlags(row({ createdAt: daysAgo(10), workLast7: 0 }), NOW)).toEqual([expect.stringMatching(/No data by day 10/)])
    expect(stuckFlags({ ...quietMachine, workLast7: 1 }, NOW)).toEqual([])
  })

  it('the morning email still off on day 1 is a reason to call (S7) — and it comes last', () => {
    expect(stuckFlags(row({ createdAt: daysAgo(0), digestOn: false }), NOW)).toEqual([])
    const flags = stuckFlags(row({ createdAt: daysAgo(STUCK.digestOffByDay), digestOn: false }), NOW)
    expect(flags).toEqual([expect.stringMatching(/The morning email is off — nothing arrives on day two/)])
    const both = stuckFlags(row({ createdAt: daysAgo(STUCK.noDataByDay), digestOn: false }), NOW)
    expect(both.map((f) => f.slice(0, 12))).toEqual(['No data by d', 'The morning '])
    expect(stuckFlags(row({ createdAt: daysAgo(STUCK.digestOffByDay), digestOn: true }), NOW)).toEqual([])
  })

  it('cards waiting 3+ days, and doors pending on us 5+ days, each name the move; the order is fixed', () => {
    const flags = stuckFlags(
      row({
        createdAt: daysAgo(12),
        activation: { a1: daysAgo(11), a2: null, a3: null, a4: null, a5: null },
        workLast7: 0,
        openCards: 2,
        oldestOpenCardAt: daysAgo(4),
        pendingOnUs: [
          { label: 'The PMS connection', since: daysAgo(6) },
          { label: 'Texting (carriers)', since: daysAgo(1) },
        ],
      }),
      NOW,
    )
    expect(flags).toEqual([
      expect.stringMatching(/machine did nothing/),
      '2 cards waiting on them for 4 days — a nudge, or take it off their plate.',
      'The PMS connection has been on us for 6 days.',
    ])
  })
})
