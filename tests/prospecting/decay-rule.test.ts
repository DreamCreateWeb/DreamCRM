import { describe, it, expect } from 'vitest'

/**
 * DECAY (P-03) — the pure rule. Which rows rest, which never do, what the
 * resting sentence says (a UTC date, marked), and where a row wakes to.
 */

import {
  decayVerdict,
  isRestingReason,
  restingReason,
  wakeStatus,
  withRestingReason,
  withoutRestingReason,
  type DecayInput,
} from '@/lib/prospect-decay'
import { DECAYABLE_STATUSES } from '@/lib/db/schema/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const CONFIG = { staleAfterDays: 90 }

function input(over: Partial<DecayInput> = {}): DecayInput {
  return {
    status: 'enriched',
    lastTouchAt: new Date(NOW.getTime() - 120 * DAY),
    createdAt: new Date(NOW.getTime() - 200 * DAY),
    nextFollowUpAt: null,
    hasOpenEnrollment: false,
    ...over,
  }
}

describe('decayVerdict', () => {
  it('rests a decayable row whose last touch is older than staleAfterDays', () => {
    const v = decayVerdict(input(), CONFIG, NOW)
    expect(v.dormant).toBe(true)
    expect(v.reason).toBe('No touch since Jul 13, 2026 UTC — resting')
  })

  it('every decayable status rests; engaged, converted, suppressed, disqualified, dormant and merged never do', () => {
    for (const s of DECAYABLE_STATUSES) expect(decayVerdict(input({ status: s }), CONFIG, NOW).dormant, s).toBe(true)
    for (const s of ['engaged', 'converted', 'suppressed', 'disqualified', 'not_interested', 'dormant', 'merged', 'discovered', 'enriching']) {
      expect(decayVerdict(input({ status: s }), CONFIG, NOW).dormant, s).toBe(false)
    }
  })

  it('a touch inside the window keeps it awake — on the boundary too', () => {
    expect(decayVerdict(input({ lastTouchAt: new Date(NOW.getTime() - 89 * DAY) }), CONFIG, NOW).dormant).toBe(false)
    expect(decayVerdict(input({ lastTouchAt: new Date(NOW.getTime() - 90 * DAY) }), CONFIG, NOW).dormant).toBe(false)
    expect(decayVerdict(input({ lastTouchAt: new Date(NOW.getTime() - 90 * DAY - 1) }), CONFIG, NOW).dormant).toBe(true)
  })

  it('a future follow-up or an open enrollment means it is being worked — never rests', () => {
    expect(decayVerdict(input({ nextFollowUpAt: new Date(NOW.getTime() + DAY) }), CONFIG, NOW).dormant).toBe(false)
    expect(decayVerdict(input({ hasOpenEnrollment: true }), CONFIG, NOW).dormant).toBe(false)
    // An OVERDUE follow-up is not a future one.
    expect(decayVerdict(input({ nextFollowUpAt: new Date(NOW.getTime() - DAY) }), CONFIG, NOW).dormant).toBe(true)
  })

  it('a row never touched is anchored on its birth — a fresh one stays, an old one rests', () => {
    expect(decayVerdict(input({ lastTouchAt: null, createdAt: new Date(NOW.getTime() - 10 * DAY) }), CONFIG, NOW).dormant).toBe(false)
    const v = decayVerdict(input({ lastTouchAt: null, createdAt: new Date(NOW.getTime() - 100 * DAY) }), CONFIG, NOW)
    expect(v.dormant).toBe(true)
    expect(v.reason).toBe('No touch since Aug 2, 2026 UTC — resting')
  })

  it('honours the configured clock', () => {
    expect(decayVerdict(input({ lastTouchAt: new Date(NOW.getTime() - 40 * DAY) }), { staleAfterDays: 30 }, NOW).dormant).toBe(true)
    expect(decayVerdict(input({ lastTouchAt: new Date(NOW.getTime() - 40 * DAY) }), { staleAfterDays: 180 }, NOW).dormant).toBe(false)
  })
})

describe('the resting sentence', () => {
  it('is a plain UTC-marked sentence, recognised and put FIRST, once', () => {
    const since = new Date('2026-07-13T23:30:00Z')
    expect(restingReason(since)).toBe('No touch since Jul 13, 2026 UTC — resting')
    expect(isRestingReason(restingReason(since))).toBe(true)
    expect(isRestingReason('Google listing matched and open')).toBe(false)
    const reasons = withRestingReason(['Google listing matched and open', restingReason(new Date('2026-01-01T00:00:00Z'))], since)
    expect(reasons).toEqual(['No touch since Jul 13, 2026 UTC — resting', 'Google listing matched and open'])
    expect(withoutRestingReason(reasons)).toEqual(['Google listing matched and open'])
    expect(withRestingReason(null, since)).toEqual(['No touch since Jul 13, 2026 UTC — resting'])
  })
})

describe('wakeStatus', () => {
  it('goes back where it came from, else enriched', () => {
    expect(wakeStatus('call_list')).toBe('call_list')
    expect(wakeStatus('contacted')).toBe('contacted')
    expect(wakeStatus(null)).toBe('enriched')
    expect(wakeStatus('converted')).toBe('enriched') // never rested from there
    expect(wakeStatus('nonsense')).toBe('enriched')
  })
})

describe('a cold caller’s hold (P-02 × P-03)', () => {
  it('a row assigned to a caller never rests, however old its last touch', () => {
    const stale = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-11-10T12:00:00Z')
    const base = { status: 'call_list', lastTouchAt: stale, createdAt: stale, nextFollowUpAt: null, hasOpenEnrollment: false }
    expect(decayVerdict(base, { staleAfterDays: 90 }, now).dormant).toBe(true)
    expect(decayVerdict({ ...base, assignedToCaller: true }, { staleAfterDays: 90 }, now).dormant).toBe(false)
  })
})
