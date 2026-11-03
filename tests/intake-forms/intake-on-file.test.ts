import { describe, it, expect } from 'vitest'
import {
  intakeRefreshCutoff,
  isIntakeOnFile,
  isVisitSpecificRule,
  pickAutoSendForm,
  ruleCoversVisitType,
} from '@/lib/intake-on-file'
import { coerceAppointmentTypeIds, coerceRefreshMonths } from '@/lib/types/forms'

/**
 * lib/intake-on-file.ts — the ONE "intake on file" predicate + the one chooser
 * of which rule a visit gets (ML-27). Pure; the clinic-tz law for the window.
 */

const NOW = new Date('2026-06-10T15:00:00Z') // 11 AM Eastern, 10 AM Central

function rule(over: Record<string, unknown> = {}) {
  return {
    id: 'f',
    isDefault: 0,
    autoSendAudience: 'all',
    appointmentTypeIds: null,
    refreshMonths: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('coercers (client-safe, lib/types/forms.ts)', () => {
  it('appointment type ids: null / [] / junk read as "every visit"; strings are trimmed + deduped', () => {
    expect(coerceAppointmentTypeIds(null)).toBeNull()
    expect(coerceAppointmentTypeIds([])).toBeNull()
    expect(coerceAppointmentTypeIds('sedation')).toBeNull()
    expect(coerceAppointmentTypeIds([' sedation ', 'sedation', 3, ''])).toEqual(['sedation'])
  })

  it('refresh months: whole months inside 1..60, else null (never re-ask)', () => {
    expect(coerceRefreshMonths(null)).toBeNull()
    expect(coerceRefreshMonths(0)).toBeNull()
    expect(coerceRefreshMonths(61)).toBeNull()
    expect(coerceRefreshMonths('12')).toBe(12)
    expect(coerceRefreshMonths(11.6)).toBe(12)
  })
})

describe('intakeRefreshCutoff — a CLINIC-LOCAL month boundary (timezone rule 2)', () => {
  it('no window → no cutoff', () => {
    expect(intakeRefreshCutoff(null, NOW, 'America/New_York')).toBeNull()
  })

  it('12 months back from June 2026 is 1 June 2025 at the clinic’s midnight, not 365 days ago', () => {
    const ny = intakeRefreshCutoff(12, NOW, 'America/New_York')!
    expect(ny.toISOString()).toBe('2025-06-01T04:00:00.000Z') // EDT midnight
    const la = intakeRefreshCutoff(12, NOW, 'America/Los_Angeles')!
    expect(la.toISOString()).toBe('2025-06-01T07:00:00.000Z') // PDT midnight
  })
})

describe('isIntakeOnFile — THE predicate', () => {
  it('nothing submitted → not on file', () => {
    expect(isIntakeOnFile(rule(), { any: null, ofForm: null }, NOW, 'America/New_York')).toBe(false)
  })

  it('a general rule with no window: any submission, ever (the old rule, unchanged)', () => {
    expect(isIntakeOnFile(rule(), { any: new Date('2019-01-01T00:00:00Z'), ofForm: null }, NOW, 'America/New_York')).toBe(true)
  })

  it('a general rule with a window: paperwork older than the cutoff no longer counts', () => {
    const r = rule({ refreshMonths: 12 })
    expect(isIntakeOnFile(r, { any: new Date('2025-05-31T12:00:00Z'), ofForm: null }, NOW, 'America/New_York')).toBe(false)
    expect(isIntakeOnFile(r, { any: new Date('2025-06-01T12:00:00Z'), ofForm: null }, NOW, 'America/New_York')).toBe(true)
  })

  it('a visit-specific rule counts only ITS form — last year’s general intake does not cover a consent', () => {
    const consent = rule({ appointmentTypeIds: ['sedation'] })
    expect(isVisitSpecificRule(consent)).toBe(true)
    expect(isIntakeOnFile(consent, { any: new Date('2026-06-01T00:00:00Z'), ofForm: null }, NOW, 'America/New_York')).toBe(false)
    expect(isIntakeOnFile(consent, { any: null, ofForm: new Date('2026-06-01T00:00:00Z') }, NOW, 'America/New_York')).toBe(true)
  })
})

describe('pickAutoSendForm — the one chooser', () => {
  const intake = rule({ id: 'intake', isDefault: 1 })
  const update = rule({ id: 'update', autoSendAudience: 'returning' })
  const consent = rule({ id: 'consent', appointmentTypeIds: ['sedation', 'extraction'] })

  it('covers: null types = every visit; a listed type = only that visit', () => {
    expect(ruleCoversVisitType(intake, 'cleaning')).toBe(true)
    expect(ruleCoversVisitType(consent, 'cleaning')).toBe(false)
    expect(ruleCoversVisitType(consent, 'sedation')).toBe(true)
    expect(ruleCoversVisitType(consent, null)).toBe(false)
  })

  it('a sedation visit gets the consent, a cleaning gets the intake, and a visit nothing covers gets null', () => {
    expect(pickAutoSendForm([intake, update, consent], { isNewPatient: true, appointmentType: 'sedation' })?.id).toBe('consent')
    expect(pickAutoSendForm([intake, update, consent], { isNewPatient: true, appointmentType: 'cleaning' })?.id).toBe('intake')
    expect(pickAutoSendForm([consent], { isNewPatient: true, appointmentType: 'cleaning' })).toBeNull()
  })

  it('audience: returning beats all/default; unknown audience (the cron) never lets an audience form outrank the general one', () => {
    expect(pickAutoSendForm([intake, update], { isNewPatient: false, appointmentType: 'cleaning' })?.id).toBe('update')
    expect(pickAutoSendForm([intake, update], { isNewPatient: true, appointmentType: 'cleaning' })?.id).toBe('intake')
    expect(pickAutoSendForm([intake, update], { isNewPatient: null, appointmentType: 'cleaning' })?.id).toBe('intake')
  })

  it('a visit-specific form aimed at the other audience steps aside for the general forms', () => {
    const returningConsent = rule({ id: 'rc', appointmentTypeIds: ['sedation'], autoSendAudience: 'returning' })
    expect(pickAutoSendForm([intake, returningConsent], { isNewPatient: true, appointmentType: 'sedation' })?.id).toBe('intake')
    expect(pickAutoSendForm([intake, returningConsent], { isNewPatient: false, appointmentType: 'sedation' })?.id).toBe('rc')
  })

  it('falls back to the default when nothing else matches (the rule getBookingIntakeForm always had)', () => {
    const onlyReturning = rule({ id: 'only-returning', autoSendAudience: 'returning', isDefault: 1 })
    expect(pickAutoSendForm([onlyReturning], { isNewPatient: true, appointmentType: 'cleaning' })?.id).toBe('only-returning')
  })
})
