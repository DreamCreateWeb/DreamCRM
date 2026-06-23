import { describe, it, expect } from 'vitest'
import { isWithinOfficeHours } from '@/lib/clinic-timezone'
import { resolvePortalSettings, DEFAULT_AUTO_REPLY_MESSAGE } from '@/lib/types/portal'

/**
 * After-hours auto-reply foundations: the timezone-aware office-hours check
 * that gates it, and the portal-settings parsing for the autoReply block.
 */

// A standard Mon–Fri 9–5 week, Sat/Sun closed.
const WEEK = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { closed: true },
  sun: { closed: true },
}

// Helper: a UTC instant. We pass an explicit timezone so the check resolves
// clinic-local wall-clock regardless of where the test runs.
const at = (iso: string) => new Date(iso)

describe('isWithinOfficeHours', () => {
  it('is open midday on a weekday (clinic timezone)', () => {
    // 2026-06-23 is a Tuesday. 15:00 UTC = 11:00 America/New_York (EDT) → open.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(true)
  })

  it('is closed late evening on a weekday', () => {
    // 02:00 UTC Wed = 22:00 Tue New York → after 17:00 → closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-24T02:00:00Z'))).toBe(false)
  })

  it('is closed before opening', () => {
    // 12:00 UTC = 08:00 New York → before 09:00 → closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-23T12:00:00Z'))).toBe(false)
  })

  it('is closed on a closed day (Sunday)', () => {
    // 2026-06-21 is a Sunday; 15:00 UTC = 11:00 NY but sun is closed.
    expect(isWithinOfficeHours(WEEK, 'America/New_York', at('2026-06-21T15:00:00Z'))).toBe(false)
  })

  it('respects the timezone — same instant differs by zone', () => {
    // 23:30 UTC Tue = 19:30 NY (closed) but 16:30 LA (open, before 17:00).
    const inst = at('2026-06-23T23:30:00Z')
    expect(isWithinOfficeHours(WEEK, 'America/New_York', inst)).toBe(false)
    expect(isWithinOfficeHours(WEEK, 'America/Los_Angeles', inst)).toBe(true)
  })

  it('returns false for null/malformed hours', () => {
    expect(isWithinOfficeHours(null, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
    expect(isWithinOfficeHours({ tue: { open: 'bad', close: '17:00' } }, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
  })

  it('treats an inverted window (close <= open) as closed', () => {
    expect(isWithinOfficeHours({ tue: { open: '17:00', close: '09:00' } }, 'America/New_York', at('2026-06-23T15:00:00Z'))).toBe(false)
  })
})

describe('resolvePortalSettings — autoReply', () => {
  it('defaults to disabled with a null (built-in) message', () => {
    const s = resolvePortalSettings({})
    expect(s.autoReply).toEqual({ enabled: false, message: null })
  })

  it('parses an enabled auto-reply with a custom message', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: true, message: 'We are closed — back at 8am.' } })
    expect(s.autoReply.enabled).toBe(true)
    expect(s.autoReply.message).toBe('We are closed — back at 8am.')
  })

  it('coerces a blank custom message to null (use the default)', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: true, message: '   ' } })
    expect(s.autoReply.message).toBeNull()
  })

  it('ignores junk values', () => {
    const s = resolvePortalSettings({ autoReply: { enabled: 'yes', message: 42 } })
    expect(s.autoReply).toEqual({ enabled: false, message: null })
  })

  it('ships a usable default message with the {clinic} token', () => {
    expect(DEFAULT_AUTO_REPLY_MESSAGE).toContain('{clinic}')
  })
})
