import { describe, it, expect } from 'vitest'
import {
  resolveEmailAutomations,
  normalizeEmailOverride,
  EMAIL_AUTOMATION_SPECS,
  EMAIL_AUTOMATION_KEYS,
  EMAIL_SLOT_MAX,
} from '@/lib/types/email-automations'

/**
 * The client-safe registry + resolver is the contract behind the whole feature:
 * defaults reproduce the current copy, a partial override merges over them, junk
 * can't poison the column, and normalize keeps an untouched Save from storing
 * anything (so the send path stays on its byte-identical literal).
 */

describe('resolveEmailAutomations', () => {
  it('null → every email is its default, enabled', () => {
    const r = resolveEmailAutomations(null)
    for (const k of EMAIL_AUTOMATION_KEYS) {
      expect(r[k].enabled).toBe(true)
      expect(r[k].subject).toBe(EMAIL_AUTOMATION_SPECS[k].slotDefaults.subject)
      expect(r[k].body).toBe(EMAIL_AUTOMATION_SPECS[k].slotDefaults.body)
    }
  })

  it('merges a partial override over defaults; untouched slots stay default', () => {
    const r = resolveEmailAutomations({ booking_confirmation: { subject: 'Custom subject' } })
    expect(r.booking_confirmation.subject).toBe('Custom subject')
    expect(r.booking_confirmation.body).toBe(EMAIL_AUTOMATION_SPECS.booking_confirmation.slotDefaults.body)
  })

  it('drops unknown keys and unknown slots', () => {
    const r = resolveEmailAutomations({
      not_a_key: { subject: 'x' },
      booking_confirmation: { bogusSlot: 'y', subject: 'ok' },
    })
    expect(Object.keys(r).sort()).toEqual([...EMAIL_AUTOMATION_KEYS].sort())
    expect(r.booking_confirmation.subject).toBe('ok')
    expect((r.booking_confirmation as Record<string, unknown>).bogusSlot).toBeUndefined()
  })

  it('ignores a blank/whitespace slot (falls back to default) — never sends empty', () => {
    const r = resolveEmailAutomations({ booking_confirmation: { body: '   ' } })
    expect(r.booking_confirmation.body).toBe(EMAIL_AUTOMATION_SPECS.booking_confirmation.slotDefaults.body)
  })

  it('clamps an over-long slot to the max', () => {
    const r = resolveEmailAutomations({ booking_confirmation: { body: 'x'.repeat(EMAIL_SLOT_MAX + 5000) } })
    expect(r.booking_confirmation.body.length).toBe(EMAIL_SLOT_MAX)
  })

  it('honours enabled=false ONLY for emails whose on/off lives in this column', () => {
    const r = resolveEmailAutomations({
      booking_confirmation: { enabled: false }, // email_automations → respected
      appointment_reminder: { enabled: false }, // reminder_settings → ignored here
      review_request: { enabled: false }, // review_config → ignored here
    })
    expect(r.booking_confirmation.enabled).toBe(false)
    expect(r.appointment_reminder.enabled).toBe(true)
    expect(r.review_request.enabled).toBe(true)
  })
})

describe('normalizeEmailOverride', () => {
  it('drops slots equal to the default (an untouched Save stores nothing)', () => {
    const spec = EMAIL_AUTOMATION_SPECS.booking_confirmation
    expect(normalizeEmailOverride('booking_confirmation', { ...spec.slotDefaults })).toBeUndefined()
  })

  it('keeps a genuinely changed slot (trimmed)', () => {
    expect(normalizeEmailOverride('booking_confirmation', { subject: '  Different!  ' })).toEqual({ subject: 'Different!' })
  })

  it('records enabled:false only for an email_automations email', () => {
    expect(normalizeEmailOverride('booking_confirmation', { enabled: false })).toEqual({ enabled: false })
    expect(normalizeEmailOverride('appointment_reminder', { enabled: false })).toBeUndefined()
  })

  it('drops empty/whitespace slots', () => {
    expect(normalizeEmailOverride('booking_confirmation', { subject: '   ' })).toBeUndefined()
  })
})

describe('registry integrity', () => {
  it('every spec has a subject + body default and non-empty defaults for each slotField', () => {
    for (const k of EMAIL_AUTOMATION_KEYS) {
      const spec = EMAIL_AUTOMATION_SPECS[k]
      expect(spec.slotDefaults.subject.length).toBeGreaterThan(0)
      expect(spec.slotDefaults.body.length).toBeGreaterThan(0)
      for (const f of spec.slotFields) {
        expect((spec.slotDefaults[f.slot] ?? '').length, `${k}.${f.slot} default`).toBeGreaterThan(0)
      }
    }
  })
})
