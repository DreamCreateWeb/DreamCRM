import type { ModuleRegistry } from './types'

/**
 * Referral partners are EXTERNAL users — they live entirely in the
 * `app/(partner)/partner/*` route group with its own minimal chrome (no
 * dashboard sidebar). This registry exists only so `getRegistry` is total over
 * every TenantType; it has no modules because the partner portal never renders
 * the data-driven TenantSidebar.
 */
export const partnerModules: ModuleRegistry = {
  tenantType: 'partner',
  modules: [],
}
