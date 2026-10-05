import 'server-only'
import { applyBundleGate, getVisibleModules, type ModuleDef } from '@/lib/modules'
import { SWITCHED_MODULE_IDS, splitModulesBySwitch } from '@/lib/feature-switches'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import type { BundleId } from '@/lib/integrations/bundles'
import type { TenantContext } from '@/lib/auth/context'

/**
 * THE ONE PLACE the sidebar's module list is resolved (S3). Role gating,
 * then the feature switches (a switched-off module moves to `addable`),
 * then the integration-bundle gate for the modules no switch governs.
 * The dashboard shell and the ⌘K page index both read this, so the
 * palette can never offer a page the sidebar is hiding — or hide one the
 * sidebar shows.
 */
export interface TenantNav {
  /** What the sidebar lists, in registry order. */
  modules: ModuleDef[]
  /** Switched-off clinic modules — the sidebar's "Add" group. */
  addable: ModuleDef[]
}

export async function getTenantNav(ctx: Pick<TenantContext, 'tenantType' | 'role' | 'platformAdmin' | 'organizationId'>): Promise<TenantNav> {
  const visible = getVisibleModules(ctx.tenantType, ctx.role, { platformAdmin: ctx.platformAdmin })
  if (ctx.tenantType !== 'clinic') return { modules: visible, addable: [] }
  const [activeBundles, switches] = await Promise.all([
    getActiveBundlesForSidebar(ctx.organizationId) as Promise<ReadonlySet<BundleId>>,
    getFeatureSwitchState(ctx.organizationId),
  ])
  const { on, add } = splitModulesBySwitch(visible, switches)
  return { modules: applyBundleGate(on, activeBundles, { exempt: SWITCHED_MODULE_IDS }), addable: add }
}
