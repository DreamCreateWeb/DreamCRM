import { describe, it, expect } from 'vitest'
import {
  REMINDER_DEFAULTS,
  REMINDER_MAX_TOUCHES,
  REMINDER_OFFSET_MAX_HOURS,
  REMINDER_OFFSET_MIN_HOURS,
  reminderTouchTemplate,
  resolveReminderSettings,
} from '@/lib/types/reminders'

describe('resolveReminderSettings — merge-over-defaults', () => {
  it('returns defaults (enabled, [72, 24]) for null / undefined / non-object', () => {
    expect(resolveReminderSettings(null)).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings(undefined)).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings('nope')).toEqual(REMINDER_DEFAULTS)
    expect(resolveReminderSettings(42)).toEqual(REMINDER_DEFAULTS)
  })

  it('default journey is 3-days + day-before and enabled is true', () => {
    expect(REMINDER_DEFAULTS).toEqual({ enabled: true, touchOffsets: [72, 24], formsReminder: true })
  })

  it('merges a partial blob over defaults (missing keys inherit)', () => {
    expect(resolveReminderSettings({ enabled: false })).toEqual({ enabled: false, touchOffsets: [72, 24], formsReminder: true })
    expect(resolveReminderSettings({ touchOffsets: [48] })).toEqual({ enabled: true, touchOffsets: [48], formsReminder: true })
  })

  it('LEGACY: a stored single offsetHours resolves to a one-touch journey at that offset', () => {
    expect(resolveReminderSettings({ enabled: true, offsetHours: 48 }).touchOffsets).toEqual([48])
    expect(resolveReminderSettings({ offsetHours: 24 }).touchOffsets).toEqual([24])
  })

  it('ignores junk-typed values', () => {
    expect(resolveReminderSettings({ enabled: 'yes', offsetHours: 'soon', touchOffsets: 'later' })).toEqual(
      REMINDER_DEFAULTS,
    )
    // junk entries inside the array are dropped, survivors kept
    expect(resolveReminderSettings({ touchOffsets: ['x', 48, null] }).touchOffsets).toEqual([48])
  })

  it('clamps each touch into [MIN, MAX], rounds, de-dupes, sorts DESC, caps the count', () => {
    expect(resolveReminderSettings({ touchOffsets: [1] }).touchOffsets).toEqual([REMINDER_OFFSET_MIN_HOURS])
    expect(resolveReminderSettings({ touchOffsets: [9999] }).touchOffsets).toEqual([REMINDER_OFFSET_MAX_HOURS])
    expect(resolveReminderSettings({ touchOffsets: [25.7] }).touchOffsets).toEqual([26])
    expect(resolveReminderSettings({ touchOffsets: [24, 72, 24] }).touchOffsets).toEqual([72, 24])
    expect(
      resolveReminderSettings({ touchOffsets: [8, 24, 48, 72, 168] }).touchOffsets,
    ).toHaveLength(REMINDER_MAX_TOUCHES)
    // keeps the LARGEST offsets when capping (the journey leads with the early touches)
    expect(resolveReminderSettings({ touchOffsets: [8, 24, 48, 72, 168] }).touchOffsets).toEqual([168, 72, 48])
  })

  it('an empty/garbage array falls back to the default journey', () => {
    expect(resolveReminderSettings({ touchOffsets: [] }).touchOffsets).toEqual([72, 24])
    expect(resolveReminderSettings({ touchOffsets: ['a', null] }).touchOffsets).toEqual([72, 24])
  })

  it('does not mutate the shared defaults object', () => {
    const a = resolveReminderSettings({ enabled: false })
    a.touchOffsets.push(999)
    expect(REMINDER_DEFAULTS.touchOffsets).toEqual([72, 24])
  })
})

describe('reminderTouchTemplate', () => {
  it('keys the per-touch idempotency log rows', () => {
    expect(reminderTouchTemplate(72)).toBe('auto_reminder_72h')
    expect(reminderTouchTemplate(24)).toBe('auto_reminder_24h')
  })
})
