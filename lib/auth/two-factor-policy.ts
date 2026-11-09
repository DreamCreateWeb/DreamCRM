/**
 * Two-step sign-in policy (ML-58) — PURE and client-safe: the ONE place that
 * decides who must have a second factor. The server gate
 * (`lib/auth/two-factor-gate.ts`) feeds it; the tests pin it.
 *
 * Who is in scope: STAFF — owner / admin / member of a clinic or the platform
 * org. Patients (magic link, role 'patient') and referral partners never
 * pass through the password sign-in step the factor hangs off, and the policy
 * never asks them for one.
 */

/** The platform admin's account is the whole platform's blast radius: always required. */
export const PLATFORM_ADMIN_REQUIRES_TWO_FACTOR = true

/** Where an un-enrolled person who must enrol is sent. A top-level (auth) page. */
export const TWO_FACTOR_ENROL_PATH = '/two-step'

export type TwoFactorWho = {
  platformAdmin: boolean
  twoFactorEnabled: boolean
  /** The member role in the active org; null for a partner / no membership. */
  role: string | null
  /** 'platform' | 'clinic' | 'patient' | 'partner' — null when not yet resolved. */
  tenantType: string | null
  /** clinic_profile.require_two_factor === 1 for the active clinic. */
  clinicRequires: boolean
}

export type TwoFactorRequirement = 'platform' | 'clinic' | null

/** Why this person MUST enrol, or null when nothing requires it of them. */
export function twoFactorRequirement(who: TwoFactorWho): TwoFactorRequirement {
  if (who.twoFactorEnabled) return null
  if (PLATFORM_ADMIN_REQUIRES_TWO_FACTOR && who.platformAdmin) return 'platform'
  const isStaff = who.role !== null && who.role !== 'patient'
  if (who.tenantType === 'clinic' && isStaff && who.clinicRequires) return 'clinic'
  return null
}

export function mustEnrolTwoFactor(who: TwoFactorWho): boolean {
  return twoFactorRequirement(who) !== null
}
