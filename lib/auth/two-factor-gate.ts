import 'server-only'
import { redirect } from 'next/navigation'
import {
  PLATFORM_ADMIN_REQUIRES_TWO_FACTOR,
  TWO_FACTOR_ENROL_PATH,
  twoFactorRequirement,
  type TwoFactorWho,
} from './two-factor-policy'

/**
 * The server-side half of "required": a person who must enrol and has not is
 * sent to the enrol page from EVERY authenticated read of their identity
 * (`getTenantContext`, `requireUser`) — a server redirect, never a client-only
 * guard. The enrol page itself reads only `getServerSession`, so it is the one
 * authenticated page that is reachable while un-enrolled.
 */
export function enforceTwoFactor(who: TwoFactorWho): void {
  if (twoFactorRequirement(who) !== null) redirect(TWO_FACTOR_ENROL_PATH)
}

/** The identity-only check, for callers that have no org context yet (requireUser). */
export function enforcePlatformAdminTwoFactor(user: {
  platformAdmin?: boolean | null
  twoFactorEnabled?: boolean | null
}): void {
  if (!PLATFORM_ADMIN_REQUIRES_TWO_FACTOR) return
  if (user.platformAdmin && !user.twoFactorEnabled) redirect(TWO_FACTOR_ENROL_PATH)
}
