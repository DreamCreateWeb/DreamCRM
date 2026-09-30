import { describe, it, expect } from 'vitest'
import { canUseInsuranceTool } from '@/lib/insurance-eligibility'
import { getVisibleModules, getRegistry } from '@/lib/modules'
import { PREVIEW_CAPABILITIES, isPreviewCapability } from '@/lib/autonomy'

/**
 * THE RELEASE GATE (owner ruling 2026-09-30): the insurance tool is a
 * preview reachable only by platform admins until it is released. One
 * predicate, one module flag, one capability list — pinned here so the
 * feature cannot leak to a real clinic by a single missed surface.
 */
describe('insurance tool preview gate', () => {
  it('canUseInsuranceTool is true only for platform admins', () => {
    expect(canUseInsuranceTool({ platformAdmin: true })).toBe(true)
    expect(canUseInsuranceTool({ platformAdmin: false })).toBe(false)
    expect(canUseInsuranceTool({ platformAdmin: null })).toBe(false)
    expect(canUseInsuranceTool({})).toBe(false)
  })

  it('the sidebar module is flagged platformAdminOnly and hidden without the flag, for every role', () => {
    const def = getRegistry('clinic').modules.find((m) => m.id === 'insurance')
    expect(def?.platformAdminOnly).toBe(true)
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(getVisibleModules('clinic', role).map((m) => m.id)).not.toContain('insurance')
      expect(getVisibleModules('clinic', role, { platformAdmin: false }).map((m) => m.id)).not.toContain('insurance')
      expect(getVisibleModules('clinic', role, { platformAdmin: true }).map((m) => m.id)).toContain('insurance')
    }
  })

  it('the flag hides nothing else — every other clinic module is unchanged for staff', () => {
    const staff = getVisibleModules('clinic', 'owner', { platformAdmin: false }).map((m) => m.id)
    const admin = getVisibleModules('clinic', 'owner', { platformAdmin: true }).map((m) => m.id)
    expect(admin.filter((id) => !staff.includes(id))).toEqual(['insurance'])
  })

  it('insurance_check is a preview capability (the roster hides its lane)', () => {
    expect(PREVIEW_CAPABILITIES).toContain('insurance_check')
    expect(isPreviewCapability('insurance_check')).toBe(true)
    expect(isPreviewCapability('appointment_reminder')).toBe(false)
  })
})
