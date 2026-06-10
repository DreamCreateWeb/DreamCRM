import { describe, it, expect } from 'vitest'

/**
 * Day-0 resolution safety. A freshly-onboarded clinic has a clinic_profile row
 * where nearly every jsonb/text field is null. Every public-facing + dashboard
 * resolver must degrade to an honest empty state, NOT throw — a single
 * unguarded null-deref crashes a page the clinic's prospective patients can hit
 * the moment the org exists (the subdomain is live immediately).
 *
 * These exercise the pure resolution helpers directly (no DB) with the exact
 * null/empty shapes a fresh profile carries. The DB-backed resolvers
 * (getSlotsForDay, getActivationChecklist) are covered in day0-defaults.test.ts.
 */

import { resolvePortalSettings, DEFAULT_PORTAL_SETTINGS } from '@/lib/types/portal'
import { resolveLeadForm, DEFAULT_LEAD_FORMS } from '@/lib/types/lead-forms'
import { buildClinicNavLinks, todaysHoursLabel } from '@/lib/clinic-site-helpers'

describe('resolvePortalSettings — fresh profile', () => {
  it('returns defaults for null / undefined / non-object', () => {
    expect(resolvePortalSettings(null)).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(resolvePortalSettings(undefined)).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(resolvePortalSettings('garbage')).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(resolvePortalSettings(42)).toEqual(DEFAULT_PORTAL_SETTINGS)
  })

  it('returns a deep clone (mutating the result never poisons the default)', () => {
    const a = resolvePortalSettings(null)
    a.features.booking = false
    a.booking.allowedTypes.push('root_canal')
    expect(DEFAULT_PORTAL_SETTINGS.features.booking).toBe(true)
    expect(DEFAULT_PORTAL_SETTINGS.booking.allowedTypes).not.toContain('root_canal')
  })

  it('merges a partial stored value over defaults without throwing', () => {
    const merged = resolvePortalSettings({ features: { payments: true } })
    expect(merged.features.payments).toBe(true)
    expect(merged.features.booking).toBe(true) // inherited
    expect(merged.booking.allowedTypes).toEqual(DEFAULT_PORTAL_SETTINGS.booking.allowedTypes)
  })
})

describe('resolveLeadForm — fresh profile (the day-0 lead pipeline)', () => {
  it('null leadForms → built-in default fields for both forms', () => {
    expect(resolveLeadForm(null, 'contact')).toEqual(DEFAULT_LEAD_FORMS.contact)
    expect(resolveLeadForm(null, 'insurance_verifier')).toEqual(
      DEFAULT_LEAD_FORMS.insurance_verifier,
    )
  })

  it('undefined + empty object both fall back to defaults', () => {
    expect(resolveLeadForm(undefined, 'contact')).toEqual(DEFAULT_LEAD_FORMS.contact)
    expect(resolveLeadForm({}, 'contact')).toEqual(DEFAULT_LEAD_FORMS.contact)
  })

  it('the contact + insurance-verifier forms have usable fields day 0', () => {
    // The lead pipeline (contact + insurance verifier) is the clinic's
    // acquisition funnel — it MUST work before they configure anything.
    expect(resolveLeadForm(null, 'contact').length).toBeGreaterThan(0)
    expect(resolveLeadForm(null, 'insurance_verifier').length).toBeGreaterThan(0)
  })
})

describe('buildClinicNavLinks — fresh profile (no services, all gates false)', () => {
  it('builds nav with zero services and no throw; universal sections present', () => {
    const links = buildClinicNavLinks({
      basePath: '',
      services: [],
      hasBlog: false,
    })
    const labels = links.map((l) => l.label)
    // Universal, render-safe-on-empty sections always present.
    expect(labels).toContain('Services')
    expect(labels).toContain('Patients')
    expect(labels).toContain('About')
    expect(labels).toContain('Contact')
    // With zero services, "Special Services" must NOT appear.
    expect(labels).not.toContain('Special Services')
    // About dropdown's FAQ child is universal (renders defaults on empty).
    const about = links.find((l) => l.label === 'About')
    expect(about?.children?.some((c) => c.label === 'FAQ')).toBe(true)
    // Services parent has no children dropdown when there are no core services.
    const services = links.find((l) => l.label === 'Services')
    expect(services?.children).toBeUndefined()
  })

  it('does not surface gated children when their booleans are false/absent', () => {
    const links = buildClinicNavLinks({ basePath: '', services: [], hasBlog: false })
    const about = links.find((l) => l.label === 'About')
    const childLabels = about?.children?.map((c) => c.label) ?? []
    // Team / Blog / Careers gate on hasTeam/hasBlog/hasCareers (default false).
    expect(childLabels).not.toContain('Meet Our Team')
    expect(childLabels).not.toContain('Blog')
    expect(childLabels).not.toContain('Careers')
    // Dental Plans gates on hasDentalPlans (default false).
    const patients = links.find((l) => l.label === 'Patients')
    expect(patients?.children?.map((c) => c.label)).not.toContain('Dental Plans')
  })
})

describe('todaysHoursLabel — defensive against null hours', () => {
  it('null / undefined / non-object → "Closed today" instead of throwing', () => {
    // A fresh clinic before day-0 seeding (or one that cleared its hours) can
    // pass null here; the helper must not crash the footer/portal.
    expect(() => todaysHoursLabel(null)).not.toThrow()
    expect(todaysHoursLabel(null)).toBe('Closed today')
    expect(todaysHoursLabel(undefined)).toBe('Closed today')
    // @ts-expect-error — exercising the runtime guard with a bad shape.
    expect(todaysHoursLabel('nope')).toBe('Closed today')
  })

  it('a closed-today entry reads "Closed today"', () => {
    expect(todaysHoursLabel({})).toBe('Closed today')
  })
})
