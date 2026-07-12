import { platformModules } from './platform'
import { clinicModules } from './clinic'
import { patientModules } from './patient'
import { partnerModules } from './partner'
import type { ModuleRegistry, ModuleDef, TenantType, PlanTier, Role } from './types'
import type { BundleId } from '@/lib/integrations/bundles'

const REGISTRIES: Record<TenantType, ModuleRegistry> = {
  platform: platformModules,
  clinic: clinicModules,
  patient: patientModules,
  partner: partnerModules,
}

export function getRegistry(tenantType: TenantType): ModuleRegistry {
  return REGISTRIES[tenantType]
}

/**
 * Plan tiers in ascending order. THE single source of truth for plan
 * comparison — both sidebar visibility (getVisibleModules) and server-side
 * `planAllows`/`requirePlan` (lib/auth/context) read this so gating can't drift.
 */
export const PLAN_ORDER: readonly PlanTier[] = ['basic', 'pro', 'premium'] as const

/**
 * True when `planTier` meets or exceeds `minPlan`. The single comparison used
 * for plan gating both in the sidebar and in server-side page/action guards.
 */
export function planAllows(planTier: PlanTier, minPlan: PlanTier): boolean {
  return PLAN_ORDER.indexOf(planTier) >= PLAN_ORDER.indexOf(minPlan)
}

/**
 * Resolve a friendly module label from a tenant + a module id OR path (with or
 * without leading slash). Used by the Plans page to title its "upgrade to
 * unlock X" panel from the `?upgrade=<module>` param that `requirePlan` sets.
 * Returns null when nothing matches (so callers can fall back to generic copy).
 */
export function getModuleLabel(tenantType: TenantType, idOrPath: string): string | null {
  const needle = idOrPath.trim()
  const withSlash = needle.startsWith('/') ? needle : `/${needle}`
  const hit = getRegistry(tenantType).modules.find(
    (m) => m.id === needle || m.path === needle || m.path === withSlash,
  )
  if (hit) return hit.label
  if (tenantType === 'clinic') return FOLDED_AREAS[needle] ?? FOLDED_AREAS[withSlash] ?? null
  return null
}

/**
 * Sub-areas folded into the Website + Growth workspaces — the sidebar
 * registry carries only the hub entries, but `requirePlan` still tags
 * redirects with these ids (`?upgrade=blog`) and the Plans upgrade panel
 * still needs their names.
 */
const FOLDED_AREAS: Record<string, string> = {
  // Website workspace
  blog: 'Blog Posts',
  '/posts': 'Blog Posts',
  '/website/blog': 'Blog Posts',
  seo: 'SEO',
  '/seo': 'SEO',
  '/website/seo': 'SEO',
  careers: 'Careers',
  '/careers': 'Careers',
  '/website/careers': 'Careers',
  // Growth workspace
  recall: 'Recall & Outreach',
  '/marketing': 'Recall & Outreach',
  '/growth/outreach': 'Recall & Outreach',
  reviews: 'Reviews',
  '/reviews': 'Reviews',
  '/growth/reviews': 'Reviews',
  social_posts: 'Social Posts',
  '/social-posts': 'Social Posts',
  '/growth/social': 'Social Posts',
  analytics: 'Analytics',
  '/analytics': 'Analytics',
  '/growth/analytics': 'Analytics',
}

/**
 * Filter modules based on the user's plan tier and role.
 * - Plan gating only applies to clinic tenants.
 * - Patient role only sees modules with patient in roles array.
 */
export function getVisibleModules(
  tenantType: TenantType,
  planTier: PlanTier = 'basic',
  role: Role = 'member'
) {
  return getRegistry(tenantType).modules.filter((m) => {
    if (m.minPlan && !planAllows(planTier, m.minPlan)) return false
    if (m.roles && !m.roles.includes(role)) return false
    return true
  })
}

/**
 * Apply the integration-bundle FEATURE GATE on top of plan/role visibility.
 * A module tagged with `requiresBundle` shows only if at least one of those
 * bundles is ACTIVE for the clinic (auto-derived from live connection state —
 * see lib/integrations/bundles + lib/services/integration-bundles). Modules
 * without `requiresBundle` always pass. Kept SEPARATE + composable from
 * `getVisibleModules` so plan/role gating (and its callers/tests) are untouched;
 * the sidebar (DashboardShell) + the ⌘K page index (global-search) apply this
 * extra step with the clinic's active-bundle set.
 *
 * Non-clinic tenants have no `requiresBundle` modules, so passing an empty set
 * is a safe no-op for them.
 */
export function applyBundleGate(
  modules: ModuleDef[],
  activeBundles: ReadonlySet<BundleId>,
): ModuleDef[] {
  return modules.filter((m) => {
    if (!m.requiresBundle || m.requiresBundle.length === 0) return true
    return m.requiresBundle.some((b) => activeBundles.has(b))
  })
}

export * from './types'
