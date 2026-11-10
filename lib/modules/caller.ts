import type { ModuleRegistry } from './types'

/**
 * Cold callers are EXTERNAL users (P-02) — they live entirely in the
 * `app/(caller)/calls/*` route group with its own minimal chrome (no
 * dashboard sidebar, no link to any clinic surface). This registry exists
 * only so `getRegistry` is total over every TenantType; it has no modules
 * because the caller portal never renders the data-driven TenantSidebar.
 */
export const callerModules: ModuleRegistry = {
  tenantType: 'caller',
  modules: [],
}
