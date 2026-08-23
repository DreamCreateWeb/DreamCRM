import { describe, it, expect } from 'vitest'
import { nextRunwaySlot, RUNWAY_MIN_HOURS, RUNWAY_SEND_HOUR } from '@/lib/dream-team-runway'

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
