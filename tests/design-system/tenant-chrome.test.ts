import { describe, it, expect } from 'vitest'
import { roleLabelFor, sidebarBadgeFor } from '@/lib/tenant-chrome'
import { trialDaysLeft } from '@/lib/trial'

/**
 * lib/tenant-chrome.ts — the sidebar pill and the profile menu's role line.
 * No plan tier (one plan is sold, so "Premium plan" cannot be false and says
 * nothing); the role is READ from the membership; a trial clinic reads the
 * same countdown the TrialBanner shows (shared `trialDaysLeft` arithmetic).
 */
const base = { tenantType: 'clinic' as const, role: 'owner' as const }

describe('roleLabelFor', () => {
  it('names the membership role in words', () => {
    expect(roleLabelFor({ ...base, role: 'owner' })).toBe('Owner')
    expect(roleLabelFor({ ...base, role: 'admin' })).toBe('Admin')
    expect(roleLabelFor({ ...base, role: 'member' })).toBe('Team member')
  })
  it('platform / patient / partner tenants name themselves', () => {
    expect(roleLabelFor({ tenantType: 'platform', role: 'owner' })).toBe('Platform admin')
    expect(roleLabelFor({ tenantType: 'patient', role: 'patient' })).toBe('Patient')
    expect(roleLabelFor({ tenantType: 'partner', role: 'member' })).toBe('Referral partner')
  })
  it('never says a bare "Member"', () => {
    for (const role of ['owner', 'admin', 'member', 'patient'] as const) {
      expect(roleLabelFor({ ...base, role })).not.toBe('Member')
    }
  })
})

describe('sidebarBadgeFor', () => {
  const now = new Date('2026-10-26T12:00:00Z')

  it('a clinic on its no-card trial reads the countdown — the TrialBanner’s own arithmetic', () => {
    const trialEndsAt = new Date('2026-10-30T12:00:00Z')
    expect(trialDaysLeft(trialEndsAt, now)).toBe(4)
    expect(sidebarBadgeFor({ ...base, onTrial: true, trialEndsAt }, now)).toBe('Trial · 4 days left')
    expect(sidebarBadgeFor({ ...base, onTrial: true, trialEndsAt: new Date('2026-10-27T11:00:00Z') }, now)).toBe('Trial · 1 day left')
    expect(sidebarBadgeFor({ ...base, onTrial: true, trialEndsAt: new Date('2026-10-26T11:00:00Z') }, now)).toBe('Trial · ends today')
    expect(sidebarBadgeFor({ ...base, onTrial: true, trialEndsAt: null }, now)).toBe('Free trial')
  })

  it('otherwise reads the viewer’s role', () => {
    expect(sidebarBadgeFor({ ...base, role: 'owner' }, now)).toBe('Owner')
    expect(sidebarBadgeFor({ ...base, role: 'member', onTrial: false }, now)).toBe('Team member')
  })

  it('keeps the platform and portal labels', () => {
    expect(sidebarBadgeFor({ tenantType: 'platform', role: 'owner' }, now)).toBe('Platform admin')
    expect(sidebarBadgeFor({ tenantType: 'patient', role: 'patient' }, now)).toBe('Patient portal')
  })

  it('never contains a plan tier', () => {
    for (const input of [
      { ...base },
      { ...base, onTrial: true, trialEndsAt: new Date('2026-10-30T12:00:00Z') },
      { tenantType: 'platform' as const, role: 'owner' as const },
    ]) {
      expect(sidebarBadgeFor(input, now)).not.toMatch(/basic|pro\b|premium|plan/i)
    }
  })
})
