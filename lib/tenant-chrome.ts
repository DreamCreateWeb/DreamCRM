import type { Role, TenantType } from '@/lib/modules/types'
import { trialDaysLeft } from '@/lib/trial'

/**
 * THE CHROME'S TWO WORDS ABOUT WHO YOU ARE — the pill under the practice
 * name in the sidebar and the line under your name in the profile menu.
 * Pure and client-safe (DashboardShell computes them from the tenant
 * context; tests pin them).
 *
 * Honesty rules (CLAUDE.md "a status that cannot be false is a dishonest
 * status"):
 *  - No plan tier. One plan is sold and nothing gates on tier, so "Premium
 *    plan" could never be anything else — a label with no information, and
 *    a trial clinic read it beside a banner saying the trial ends in N days.
 *  - The role is READ from the membership (`ctx.role`), never from a field
 *    the auth user does not carry — the old menu printed "Member" for the
 *    clinic owner, the platform owner and a patient alike.
 */

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Team member',
  patient: 'Patient',
}

export interface ChromeInput {
  tenantType: TenantType
  role: Role
  platformAdmin?: boolean
  onTrial?: boolean
  trialEndsAt?: Date | null
}

/** The profile menu's line under the name. */
export function roleLabelFor(ctx: ChromeInput): string {
  if (ctx.tenantType === 'platform') return 'Platform admin'
  if (ctx.tenantType === 'patient') return 'Patient'
  if (ctx.tenantType === 'partner') return 'Referral partner'
  return ROLE_LABELS[ctx.role] ?? 'Team member'
}

/**
 * The sidebar pill under the org name — state that VARIES. A clinic on its
 * no-card trial reads the countdown (the same arithmetic as the TrialBanner,
 * `trialDaysLeft`, so the two never disagree); otherwise the viewer's role.
 */
export function sidebarBadgeFor(ctx: ChromeInput, now: Date = new Date()): string {
  if (ctx.tenantType === 'platform') return 'Platform admin'
  if (ctx.tenantType === 'patient') return 'Patient portal'
  if (ctx.tenantType === 'partner') return 'Referral partner'
  if (ctx.onTrial) {
    const days = trialDaysLeft(ctx.trialEndsAt ?? null, now)
    if (days != null) {
      if (days <= 0) return 'Trial · ends today'
      return `Trial · ${days} ${days === 1 ? 'day' : 'days'} left`
    }
    return 'Free trial'
  }
  return roleLabelFor(ctx)
}
