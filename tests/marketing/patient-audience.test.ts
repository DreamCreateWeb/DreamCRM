import { describe, expect, it } from 'vitest'
import {
  PatientAudienceFilter,
  type PatientAudienceFilterT,
} from '@/lib/services/marketing'

/**
 * Schema-level tests for the patient audience filter. The full
 * `resolvePatientAudience` integration (which queries patient +
 * appointment + invoices) is exercised via the demo seeder + the
 * end-to-end flow — these focus on the Zod parsing semantics so
 * filter defaults stay correct as the schema grows.
 */
describe('PatientAudienceFilter', () => {
  it('fills in sensible defaults when the input is empty', () => {
    const parsed = PatientAudienceFilter.parse({})
    // Defaults to "for email marketing send": require email opt-in,
    // don't require sms opt-in, exclude archived patients.
    expect(parsed.requireEmailOptIn).toBe(true)
    expect(parsed.requireSmsOptIn).toBe(false)
    expect(parsed.includeArchived).toBe(false)
  })

  it('honors explicit channel opt-in overrides', () => {
    const sms = PatientAudienceFilter.parse({ requireSmsOptIn: true })
    expect(sms.requireSmsOptIn).toBe(true)
    expect(sms.requireEmailOptIn).toBe(true) // still defaults to true

    // SMS-only audience (Phase B) skips the email opt-in requirement
    const smsOnly = PatientAudienceFilter.parse({
      requireSmsOptIn: true,
      requireEmailOptIn: false,
    })
    expect(smsOnly.requireEmailOptIn).toBe(false)
    expect(smsOnly.requireSmsOptIn).toBe(true)
  })

  it('accepts the dental lifecycle stages', () => {
    const lifecycle = PatientAudienceFilter.parse({
      lifecycles: ['new', 'active', 'at_risk', 'lapsed'],
    })
    expect(lifecycle.lifecycles).toEqual(['new', 'active', 'at_risk', 'lapsed'])
  })

  it('rejects unknown lifecycle stages', () => {
    expect(() =>
      PatientAudienceFilter.parse({ lifecycles: ['nope_not_a_stage'] }),
    ).toThrow()
  })

  it('accepts the 4 recall status values', () => {
    const recall = PatientAudienceFilter.parse({
      recallStatuses: ['due', 'overdue', 'scheduled', 'na'],
    })
    expect(recall.recallStatuses).toEqual(['due', 'overdue', 'scheduled', 'na'])
  })

  it('rejects negative last-visit windows (positive integers only)', () => {
    expect(() => PatientAudienceFilter.parse({ lastVisitAtLeastDaysAgo: -1 })).toThrow()
    expect(() => PatientAudienceFilter.parse({ lastVisitWithinDays: -5 })).toThrow()
    // Zero is valid — "this exact moment" makes sense for date math
    const z = PatientAudienceFilter.parse({ lastVisitAtLeastDaysAgo: 0 })
    expect(z.lastVisitAtLeastDaysAgo).toBe(0)
  })

  it('preserves both boolean-shaped filters separately', () => {
    const both = PatientAudienceFilter.parse({
      hasOutstandingBalance: true,
      birthdayThisMonth: true,
    })
    expect(both.hasOutstandingBalance).toBe(true)
    expect(both.birthdayThisMonth).toBe(true)
  })

  it('can express the demo-seeded "Recall due" segment', () => {
    const recall: PatientAudienceFilterT = PatientAudienceFilter.parse({
      recallStatuses: ['due', 'overdue'],
      requireEmailOptIn: true,
      includeArchived: false,
    })
    expect(recall.recallStatuses).toEqual(['due', 'overdue'])
    expect(recall.requireEmailOptIn).toBe(true)
    expect(recall.includeArchived).toBe(false)
  })

  it('can express the "Birthday this month" segment with only the boolean toggle', () => {
    const birthday = PatientAudienceFilter.parse({ birthdayThisMonth: true })
    expect(birthday.birthdayThisMonth).toBe(true)
    expect(birthday.requireEmailOptIn).toBe(true) // default
  })
})
