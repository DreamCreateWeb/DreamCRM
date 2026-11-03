import { describe, it, expect } from 'vitest'
import { callBackDayKey, callBackLabel, callBackSlipped, followedUpLabel } from '@/lib/lead-touch-labels'

/**
 * THE inquiry touch labels (ML-22) — one voice for the board row and the
 * drawer. The call-back is a DAY on the clinic's calendar: both sides of
 * every comparison are clinic-local day keys, so "today" is the clinic's
 * today even when the server (UTC) or a remote viewer has already rolled
 * over. Anti-shame: a slipped day reads "Call back was Tue", never
 * "overdue".
 */
const TZ = 'America/Chicago'
// Thursday 2026-07-30, 9:30 PM Chicago — already Friday in UTC.
const NOW = new Date('2026-07-31T02:30:00Z')
const noonChicago = (day: string) => new Date(`${day}T17:00:00Z`)

describe('callBackLabel', () => {
  it('reads the clinic’s today, not UTC’s', () => {
    expect(callBackLabel(noonChicago('2026-07-30'), NOW, TZ)).toBe('Call back today')
    expect(callBackLabel(noonChicago('2026-07-31'), NOW, TZ)).toBe('Call back tomorrow')
  })

  it('names the weekday inside the week ahead and the date beyond it', () => {
    expect(callBackLabel(noonChicago('2026-08-01'), NOW, TZ)).toBe('Call back Sat')
    expect(callBackLabel(noonChicago('2026-08-04'), NOW, TZ)).toBe('Call back Tue')
    expect(callBackLabel(noonChicago('2026-08-05'), NOW, TZ)).toBe('Call back Wed')
    expect(callBackLabel(noonChicago('2026-08-06'), NOW, TZ)).toBe('Call back Aug 6')
    expect(callBackLabel(noonChicago('2026-11-12'), NOW, TZ)).toBe('Call back Nov 12')
  })

  it('a day that slipped is said plainly, without shame', () => {
    expect(callBackLabel(noonChicago('2026-07-28'), NOW, TZ)).toBe('Call back was Jul 28')
    expect(callBackSlipped(noonChicago('2026-07-28'), NOW, TZ)).toBe(true)
    expect(callBackSlipped(noonChicago('2026-07-30'), NOW, TZ)).toBe(false)
    expect(callBackSlipped(null, NOW, TZ)).toBe(false)
  })

  it('nothing parked → nothing said', () => {
    expect(callBackLabel(null, NOW, TZ)).toBeNull()
    expect(callBackLabel(undefined, NOW, TZ)).toBeNull()
  })
})

describe('followedUpLabel', () => {
  it('speaks in the board’s age voice', () => {
    expect(followedUpLabel(new Date(NOW.getTime() - 2 * 24 * 3_600_000), NOW)).toBe('Followed up 2d ago')
    expect(followedUpLabel(new Date(NOW.getTime() - 5 * 3_600_000), NOW)).toBe('Followed up 5h ago')
    expect(followedUpLabel(new Date(NOW.getTime() - 60_000), NOW)).toBe('Followed up just now')
    expect(followedUpLabel(null, NOW)).toBeNull()
  })
})

describe('callBackDayKey', () => {
  it('is the date input’s value in the clinic’s calendar', () => {
    expect(callBackDayKey(noonChicago('2026-08-04'), TZ)).toBe('2026-08-04')
    expect(callBackDayKey(null, TZ)).toBe('')
  })
})
