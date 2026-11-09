import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PLATFORM_ADMIN_REQUIRES_TWO_FACTOR,
  TWO_FACTOR_ENROL_PATH,
  twoFactorRequirement,
  mustEnrolTwoFactor,
  type TwoFactorWho,
} from '@/lib/auth/two-factor-policy'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const who = (o: Partial<TwoFactorWho> = {}): TwoFactorWho => ({
  platformAdmin: false,
  twoFactorEnabled: false,
  role: 'member',
  tenantType: 'clinic',
  clinicRequires: false,
  ...o,
})

describe('two-step policy (ML-58)', () => {
  it('the platform admin is required — one constant', () => {
    expect(PLATFORM_ADMIN_REQUIRES_TWO_FACTOR).toBe(true)
    expect(twoFactorRequirement(who({ platformAdmin: true, role: null, tenantType: null }))).toBe('platform')
    expect(twoFactorRequirement(who({ platformAdmin: true, twoFactorEnabled: true }))).toBeNull()
  })
  it('clinic staff are required only when the owner switch is on', () => {
    expect(mustEnrolTwoFactor(who())).toBe(false)
    for (const role of ['owner', 'admin', 'member']) {
      expect(twoFactorRequirement(who({ role, clinicRequires: true }))).toBe('clinic')
    }
    expect(mustEnrolTwoFactor(who({ clinicRequires: true, twoFactorEnabled: true }))).toBe(false)
  })
  it('patients and partners are never asked, whatever the switch says', () => {
    expect(mustEnrolTwoFactor(who({ role: 'patient', tenantType: 'patient', clinicRequires: true }))).toBe(false)
    expect(mustEnrolTwoFactor(who({ role: 'patient', tenantType: 'clinic', clinicRequires: true }))).toBe(false)
    expect(mustEnrolTwoFactor(who({ role: null, tenantType: 'partner', clinicRequires: true }))).toBe(false)
  })
})

describe('two-step gate (server redirect, never client-only)', () => {
  it('sends a required, un-enrolled person to the enrol page', async () => {
    const { enforceTwoFactor, enforcePlatformAdminTwoFactor } = await import('@/lib/auth/two-factor-gate')
    expect(() => enforceTwoFactor(who({ platformAdmin: true }))).toThrow(`REDIRECT:${TWO_FACTOR_ENROL_PATH}`)
    expect(() => enforceTwoFactor(who({ clinicRequires: true }))).toThrow(`REDIRECT:${TWO_FACTOR_ENROL_PATH}`)
    expect(() => enforcePlatformAdminTwoFactor({ platformAdmin: true, twoFactorEnabled: false })).toThrow(/REDIRECT/)
    expect(() => enforceTwoFactor(who())).not.toThrow()
    expect(() => enforcePlatformAdminTwoFactor({ platformAdmin: true, twoFactorEnabled: true })).not.toThrow()
    expect(() => enforcePlatformAdminTwoFactor({ platformAdmin: false, twoFactorEnabled: false })).not.toThrow()
  })
  it('is wired into every authenticated read of identity, and the enrol page avoids both', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('lib/auth/context.ts')).toMatch(/enforceTwoFactor\(/)
    expect(read('lib/session.ts')).toMatch(/enforcePlatformAdminTwoFactor\(/)
    const page = read('app/(auth)/two-step/page.tsx').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(page).not.toMatch(/getTenantContext|requireTenant|requireUser/)
  })
})
