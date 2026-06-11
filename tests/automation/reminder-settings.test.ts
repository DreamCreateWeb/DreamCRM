import { describe, it, expect } from 'vitest'
import {
  REMINDER_DEFAULTS,
  REMINDER_OFFSET_MAX_HOURS,
  REMINDER_OFFSET_MIN_HOURS,
  resolveReminderSettings,
} from '@/lib/types/reminders'

describe('resolveReminderSettings — merge-over-defaults', () => {
  it('returns defaults (enabled, 24h) for null / undefined / non-object', () => {
    expect(resolveReminderSettings(null)).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings(undefined)).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings('nope')).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings(42)).toEqual(REMINDER_DEFAULTS)
  })

  it('default offset is 24 and enabled is true', () => {
    expect(REMINDER_DEFAULTS).toEqual({ enabled: true, offsetHours: 24 })
  })

  it('merges a partial blob over defaults (missing keys inherit)', () => {
    expect(resolveReminderSettings({ enabled: false })).toEqual({ enabled: false, offsetHours: 24 })
    expect(resolveReminderSettings({ offsetHours: 48 })).toEqual({ enabled: true, offsetHours: 48 })
  })

  it('ignores junk-typed values', () => {
    expect(resolveReminderSettings({ enabled: 'yes', offsetHours: 'soon' })).toEqual(REMINDER_DEFAULTS)
  })

  it('clamps offsetHours into [MIN, MAX] and rounds', () => {
    expect(resolveReminderSettings({ offsetHours: 1 }).offsetHours).toBe(REMINDER_OFFSET_MIN_HOURS)
    expect(resolveReminderSettings({ offsetHours: 9999 }).offsetHours).toBe(REMINDER_OFFSET_MAX_HOURS)
    expect(resolveReminderSettings({ offsetHours: 25.7 }).offsetHours).toBe(26)
  })

  it('does not mutate the shared defaults object', () => {
    const a = resolveReminderSettings({ enabled: false })
    a.offsetHours = 999
    expect(REMINDER_DEFAULTS.offsetHours).toBe(24)
  })
})
