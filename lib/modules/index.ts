import type { ModuleDef, ModuleRegistry, PlanTier, Role, TenantType } from './types'

/**
 * The CRM modules currently wired in this codebase. Add `minPlan` to gate a
 * module behind a paid tier; add `roles` to gate by membership role.
 *
 * Multi-tenant orgs aren't implemented here yet (see archive/setup-mosaic-prior-work
 * for the full clinic/patient/platform split). When orgs land, register one
 * ModuleRegistry per TenantType and key the lookup off the active org.
 */
const platformModules: ModuleRegistry = {
  tenantType: 'platform',
  modules: [
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', section: 'Pages' },
    { id: 'analytics', path: '/dashboard/analytics', label: 'Analytics', section: 'Pages' },
    { id: 'fintech', path: '/dashboard/fintech', label: 'Fintech', section: 'Pages', minPlan: 'pro' },
    { id: 'customers', path: '/ecommerce/customers', label: 'Customers', section: 'Pages' },
    { id: 'orders', path: '/ecommerce/orders', label: 'Orders', section: 'Pages' },
    { id: 'invoices', path: '/ecommerce/invoices', label: 'Invoices', section: 'Pages' },
    { id: 'tasks-list', path: '/tasks/list', label: 'Tasks (list)', section: 'Pages' },
    { id: 'tasks-kanban', path: '/tasks/kanban', label: 'Tasks (kanban)', section: 'Pages' },
    { id: 'calendar', path: '/calendar', label: 'Calendar', section: 'Pages' },
    { id: 'campaigns', path: '/campaigns', label: 'Campaigns', section: 'Pages' },
    { id: 'jobs', path: '/jobs', label: 'Jobs', section: 'Pages' },
    { id: 'forum', path: '/community/forum', label: 'Forum', section: 'Community' },
    { id: 'feed', path: '/community/feed', label: 'Feed', section: 'Community' },
    { id: 'meetups', path: '/community/meetups', label: 'Meetups', section: 'Community' },
    { id: 'inbox', path: '/inbox', label: 'Inbox', section: 'Inbox' },
    { id: 'messages', path: '/messages', label: 'Messages', section: 'Inbox' },
    { id: 'settings-account', path: '/settings/account', label: 'Account', section: 'Settings' },
    { id: 'settings-billing', path: '/settings/billing', label: 'Billing', section: 'Settings' },
    { id: 'settings-plans', path: '/settings/plans', label: 'Plans', section: 'Settings' },
    { id: 'settings-notifications', path: '/settings/notifications', label: 'Notifications', section: 'Settings' },
    { id: 'settings-apps', path: '/settings/apps', label: 'Connected Apps', section: 'Settings' },
    { id: 'settings-feedback', path: '/settings/feedback', label: 'Feedback', section: 'Settings' },
  ],
}

// Stub registries for clinic/patient — empty until those tenant types are added back.
const clinicModules: ModuleRegistry = { tenantType: 'clinic', modules: [] }
const patientModules: ModuleRegistry = { tenantType: 'patient', modules: [] }

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
 */
export function getVisibleModules(
  tenantType: TenantType,
  planTier: PlanTier = 'basic',
  role: Role = 'member'
): ModuleDef[] {
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
