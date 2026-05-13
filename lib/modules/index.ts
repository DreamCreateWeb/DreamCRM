import { platformModules } from './platform'
import { clinicModules } from './clinic'
import { patientModules } from './patient'
import type { ModuleRegistry, TenantType, PlanTier, Role } from './types'

const REGISTRIES: Record<TenantType, ModuleRegistry> = {
  platform: platformModules,
  clinic: clinicModules,
  patient: patientModules,
}

export function getRegistry(tenantType: TenantType): ModuleRegistry {
  return REGISTRIES[tenantType]
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
  const planOrder: PlanTier[] = ['basic', 'pro', 'premium']
  const userPlanLevel = planOrder.indexOf(planTier)

  return getRegistry(tenantType).modules.filter((m) => {
    if (m.minPlan) {
      const requiredLevel = planOrder.indexOf(m.minPlan)
      if (userPlanLevel < requiredLevel) return false
    }
    if (m.roles && !m.roles.includes(role)) return false
    return true
  })
}

export * from './types'
