import { describe, it, expect } from 'vitest'
import { nextRunwaySlot, RUNWAY_MIN_HOURS, RUNWAY_SEND_HOUR } from '@/lib/dream-team-runway'
import { expiryDayLabel, cycleLabel } from '@/lib/types/dream-team'

/**
 * THE VETO RUNWAY's math (docs/ai-operations.md, D4). The slot must always
 * be a clinic-local RUNWAY_SEND_HOUR at least RUNWAY_MIN_HOURS away — the
 * veto window is the deep-sleep lanes' consent mechanism, so a short runway
 * is a broken promise.
 */

const TZ = 'America/Chicago'

function localHour(d: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(d),
  )
}

describe('nextRunwaySlot', () => {
  it('a morning draft stages for TOMORROW 10 AM — same-day 10 AM would be under the minimum runway', () => {
    // 8 AM Chicago (13:00 UTC in winter): today's 10 AM is only 2h out.
    const now = new Date('2026-01-15T14:00:00Z') // 8:00 AM CST
    const slot = nextRunwaySlot(now, TZ)
    expect(slot.getTime() - now.getTime()).toBeGreaterThanOrEqual(RUNWAY_MIN_HOURS * 3600_000)
    expect(localHour(slot, TZ)).toBe(RUNWAY_SEND_HOUR)
    // Tomorrow, not the day after.
    expect(slot.getTime() - now.getTime()).toBeLessThan(36 * 3600_000)
  })

  it('an evening draft stages for tomorrow 10 AM (a 14h runway clears the minimum)', () => {
    const now = new Date('2026-01-15T02:00:00Z') // 8:00 PM CST Jan 14
    const slot = nextRunwaySlot(now, TZ)
    expect(localHour(slot, TZ)).toBe(RUNWAY_SEND_HOUR)
    expect(slot.getTime() - now.getTime()).toBeGreaterThanOrEqual(RUNWAY_MIN_HOURS * 3600_000)
  })

  it('a LATE-NIGHT draft (11 PM) skips to the day AFTER tomorrow’s 10 AM — tomorrow’s is only 11h out', () => {
    const now = new Date('2026-01-16T05:00:00Z') // 11:00 PM CST Jan 15
    const slot = nextRunwaySlot(now, TZ)
    expect(localHour(slot, TZ)).toBe(RUNWAY_SEND_HOUR)
    expect(slot.getTime() - now.getTime()).toBeGreaterThanOrEqual(RUNWAY_MIN_HOURS * 3600_000)
  })

  it('the slot is always strictly in the future and hour-aligned across timezones', () => {
    for (const tz of ['America/New_York', 'America/Los_Angeles', 'America/Chicago']) {
      for (const iso of ['2026-06-01T00:30:00Z', '2026-06-01T12:00:00Z', '2026-06-01T23:45:00Z']) {
        const now = new Date(iso)
        const slot = nextRunwaySlot(now, tz)
        expect(slot.getTime()).toBeGreaterThan(now.getTime())
        expect(localHour(slot, tz)).toBe(RUNWAY_SEND_HOUR)
      }
    }
  })
})

describe('expiryDayLabel — the tone dot, in words', () => {
  it('names today, tomorrow, and the days between', () => {
    expect(expiryDayLabel('2026-08-23', '2026-08-23')).toBe('Retires today')
    expect(expiryDayLabel('2026-08-23', '2026-08-24')).toBe('Retires tomorrow')
    expect(expiryDayLabel('2026-08-23', '2026-08-26')).toBe('Retires in 3 days')
  })

  it('says nothing when the card has a week of life left — a countdown that never changes is noise', () => {
    expect(expiryDayLabel('2026-08-23', '2026-09-05')).toBeNull()
    expect(expiryDayLabel('2026-08-23', null)).toBeNull()
  })

  it('reads a card already past its day as retiring today, never negative', () => {
    expect(expiryDayLabel('2026-08-23', '2026-08-20')).toBe('Retires today')
  })

  it('degrades to silence on junk rather than rendering NaN at a person', () => {
    expect(expiryDayLabel('not-a-day', '2026-08-24')).toBeNull()
    expect(expiryDayLabel('2026-08-23', 'nonsense')).toBeNull()
  })

  it('crosses a month and a year boundary by real days, not by digits', () => {
    expect(expiryDayLabel('2026-08-31', '2026-09-01')).toBe('Retires tomorrow')
    expect(expiryDayLabel('2026-12-31', '2027-01-02')).toBe('Retires in 2 days')
  })
})

describe('cycleLabel — the heartbeat in words', () => {
  const now = new Date('2026-08-23T12:00:00Z')
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000)

  it('reads coarsely, because the pass is hourly', () => {
    expect(cycleLabel(ago(0), now)).toBe('just now')
    expect(cycleLabel(ago(1), now)).toBe('just now')
    expect(cycleLabel(ago(12), now)).toBe('12 minutes ago')
    expect(cycleLabel(ago(60), now)).toBe('an hour ago')
    expect(cycleLabel(ago(200), now)).toBe('3 hours ago')
    expect(cycleLabel(ago(60 * 30), now)).toBe('yesterday')
    expect(cycleLabel(ago(60 * 24 * 4), now)).toBe('4 days ago')
  })

  it('never renders arithmetic at a person — a future stamp reads as just now', () => {
    expect(cycleLabel(new Date(now.getTime() + 5 * 60_000), now)).toBe('just now')
  })

  it('says nothing at all when no pass has stamped yet', () => {
    expect(cycleLabel(null, now)).toBeNull()
    expect(cycleLabel(undefined, now)).toBeNull()
  })
})
