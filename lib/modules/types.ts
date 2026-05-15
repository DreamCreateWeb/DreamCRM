/**
 * Module registry types — defines what a dashboard module is and how it gets
 * wired into the sidebar nav for a given tenant type.
 */

export type TenantType = 'platform' | 'clinic' | 'patient'

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
}

export interface ModuleRegistry {
  tenantType: TenantType
  modules: ModuleDef[]
}
