import { getTenantContext } from '@/lib/auth/context'
import { getStaffOnboarding } from '@/lib/services/staff-onboarding'
import { MODULE_HINTS } from '@/lib/types/onboarding'
import ModuleHintBanner from './module-hint-banner'

/**
 * First-visit orientation banner for a module page. Server component:
 * self-gating (clinic tenant only, hidden once this staff member dismisses
 * it), so pages can render `<ModuleHint id="patients" />` unconditionally.
 */
export default async function ModuleHint({ id }: { id: keyof typeof MODULE_HINTS | string }) {
  const hint = MODULE_HINTS[id]
  if (!hint) return null

  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return null

  const state = await getStaffOnboarding(ctx.organizationId, ctx.userId)
  if (state.dismissedHints.includes(id)) return null

  return <ModuleHintBanner id={id} title={hint.title} body={hint.body} />
}
