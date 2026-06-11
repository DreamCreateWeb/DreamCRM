/**
 * Module registry types — defines what a dashboard module is and how it gets
 * wired into the sidebar nav for a given tenant type.
 */

// 'partner' = an external referral partner (lib/services/referrals.ts). They
// have no org membership; getTenantContext derives this from a
// referral_partner.user_id linkage when no platform/clinic membership wins.
export type TenantType = 'platform' | 'clinic' | 'patient' | 'partner'

export type PlanTier = 'basic' | 'pro' | 'premium'

export type Role = 'owner' | 'admin' | 'member' | 'patient'

export interface ModuleDef {
  /** Stable identifier — used for permissions, plan gating, telemetry. */
  id: string

  /** URL path this module lives at (relative to its route group). */
  path: string

  /** Display label in the sidebar — varies per tenant type. */
  label: string

  /** Optional grouping label for sidebar sections (e.g., "Pages", "Settings"). */
  section?: string

  /** Icon identifier — resolved by the sidebar component. */
  icon?: string

  /** Minimum plan tier to access this module (clinic tenants only). */
  minPlan?: PlanTier

  /** Roles that can see this module. If omitted, all members can see it. */
  roles?: Role[]

  /** Whether this module is currently implemented or coming soon. */
  status?: 'live' | 'soon'

  /**
   * Pin this module into the sidebar's label-less "cockpit" zone (the
   * every-second-glance surfaces that sit above the grouped nav). Pinned
   * entries ALSO remain listed inside their `section` group — the cockpit is
   * a fast-access duplicate, not a relocation. See DESIGN-SYSTEM.md Part 4.
   */
  pinned?: boolean

  /**
   * Keyboard shortcut hint shown beside a pinned cockpit entry (e.g. '⌘1').
   * Display-only here; the actual key handling lives in the shell's keyboard
   * map, which navigates to the pinned entries in registry order (⌘1/⌘2/⌘3).
   */
  shortcut?: string
}

export interface ModuleRegistry {
  tenantType: TenantType
  modules: ModuleDef[]
}
