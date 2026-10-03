import { describe, it, expect } from 'vitest'
import {
  canUseInsuranceTool,
  effectiveInsuranceDriver,
  needsPracticeNpi,
  usageLine,
  INCLUDED_MONTHLY_INSURANCE_CHECKS,
  isBilledDriver,
} from '@/lib/insurance-eligibility'
import { getVisibleModules, getRegistry } from '@/lib/modules'
import { PREVIEW_CAPABILITIES, isPreviewCapability } from '@/lib/autonomy'

/**
 * THE RELEASE (polish phase 6, 2026-10-03): the insurance tool is a clinic
 * feature for EVERY clinic now. The preview that held it to platform admins
 * (owner ruling 2026-09-30) is over, and this file pins the open state the
 * same way it pinned the closed one — one predicate, one module entry, one
 * capability list — plus the two rules that make the release safe: a live
 * check needs the practice's NPI, and billed checks have a monthly allowance.
 */
describe('insurance tool — released to every clinic', () => {
  it('canUseInsuranceTool admits every clinic tenant and nobody else', () => {
    expect(canUseInsuranceTool({ tenantType: 'clinic' })).toBe(true)
    expect(canUseInsuranceTool({ tenantType: 'patient' })).toBe(false)
    expect(canUseInsuranceTool({ tenantType: 'platform' })).toBe(false)
    expect(canUseInsuranceTool({ tenantType: 'partner' })).toBe(false)
    expect(canUseInsuranceTool({ tenantType: null })).toBe(false)
    expect(canUseInsuranceTool({})).toBe(false)
  })

  it('the sidebar module carries no platform-admin flag and shows for every clinic role', () => {
    const def = getRegistry('clinic').modules.find((m) => m.id === 'insurance')
    expect(def).toBeTruthy()
    expect(def?.platformAdminOnly).toBeUndefined()
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(getVisibleModules('clinic', role).map((m) => m.id)).toContain('insurance')
      expect(getVisibleModules('clinic', role, { platformAdmin: false }).map((m) => m.id)).toContain('insurance')
    }
  })

  it('no preview capability remains — the roster lane shows for every clinic', () => {
    expect(PREVIEW_CAPABILITIES).toEqual([])
    expect(isPreviewCapability('insurance_check')).toBe(false)
  })
})

describe('the readiness rule — a live check needs the practice NPI', () => {
  it('only the live driver can be not ready; sandbox and test mode never are', () => {
    expect(needsPracticeNpi('sandbox', null, {})).toBe(false)
    expect(needsPracticeNpi('stedi_test', null, {})).toBe(false)
    expect(needsPracticeNpi('stedi', null, {})).toBe(true)
  })

  it('a stored 10-digit NPI (punctuation ignored) or the platform fallback makes it ready; a short one does not', () => {
    expect(needsPracticeNpi('stedi', '123-456-7893', {})).toBe(false)
    expect(needsPracticeNpi('stedi', '12345', {})).toBe(true)
    expect(needsPracticeNpi('stedi', null, { STEDI_DEFAULT_NPI: '1999999984' })).toBe(false)
    expect(needsPracticeNpi('stedi', null, { STEDI_DEFAULT_NPI: '19' })).toBe(true)
  })

  it('the demo rule: a real clinic without an NPI is NOT ready; the demo clinic falls back to the labelled sandbox', () => {
    expect(effectiveInsuranceDriver({ driver: 'stedi', storedNpi: null, isDemo: false, env: {} })).toEqual({ driver: 'stedi', needsNpi: true })
    expect(effectiveInsuranceDriver({ driver: 'stedi', storedNpi: null, isDemo: true, env: {} })).toEqual({ driver: 'sandbox', needsNpi: false })
    // With an NPI (or the fallback) the demo gets the SAME driver as everyone — no silent swap.
    expect(effectiveInsuranceDriver({ driver: 'stedi', storedNpi: '1234567893', isDemo: true, env: {} })).toEqual({ driver: 'stedi', needsNpi: false })
    expect(effectiveInsuranceDriver({ driver: 'stedi', storedNpi: null, isDemo: true, env: { STEDI_DEFAULT_NPI: '1999999984' } })).toEqual({ driver: 'stedi', needsNpi: false })
    // Test mode and the sandbox are untouched by the rule.
    expect(effectiveInsuranceDriver({ driver: 'stedi_test', storedNpi: null, isDemo: true, env: {} })).toEqual({ driver: 'stedi_test', needsNpi: false })
    expect(effectiveInsuranceDriver({ driver: 'sandbox', storedNpi: null, isDemo: false, env: {} })).toEqual({ driver: 'sandbox', needsNpi: false })
  })
})

describe('the included allowance', () => {
  it('is 200 billed checks a month, and only the live driver is billed', () => {
    expect(INCLUDED_MONTHLY_INSURANCE_CHECKS).toBe(200)
    expect(isBilledDriver('stedi')).toBe(true)
    expect(isBilledDriver('stedi_test')).toBe(false)
    expect(isBilledDriver('sandbox')).toBe(false)
  })

  it('says plainly where the month stands', () => {
    expect(usageLine({ used: 12, included: 200, unreadable: false })).toBe('12 of 200 checks used this month')
    expect(usageLine({ used: 0, included: 200, unreadable: false })).toBe('0 of 200 checks used this month')
    expect(usageLine({ used: 200, included: 200, unreadable: false })).toBe('All 200 included checks used this month')
    expect(usageLine({ used: 240, included: 200, unreadable: false })).toBe('All 200 included checks used this month')
  })
})
