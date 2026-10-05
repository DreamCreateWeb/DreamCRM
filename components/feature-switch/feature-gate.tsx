import { getTenantContext } from '@/lib/auth/context'
import { FEATURE_BY_KEY, type FeatureKey } from '@/lib/feature-switches'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { getModuleLabel, getRegistry } from '@/lib/modules'
import FeatureIntro from './feature-intro'
import FeatureFooter from './feature-footer'

/**
 * THE DOOR (docs/ACTIVATION.md law 1, S3). A module's layout wraps its
 * pages in this: for a clinic whose switch is off it renders the intro
 * card instead of the page (what it does, what to know, one button), and
 * for one whose switch is on it renders the page plus a quiet "Turn off"
 * line on the module's root path only. Every other tenant passes straight
 * through — the platform tenant shares some of these routes (the campaign
 * editor under /growth) and has no switches.
 *
 * Members see the intro without the button and a line naming who can turn
 * it on; owners and admins get the button.
 */
export default async function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return <>{children}</>
  const def = FEATURE_BY_KEY[feature]
  const state = await getFeatureSwitchState(ctx.organizationId)
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'
  if (state[feature]) {
    return (
      <>
        {children}
        <FeatureFooter feature={feature} canManage={canManage} />
      </>
    )
  }
  const section = getRegistry('clinic').modules.find((m) => m.id === def.moduleId)?.section ?? 'Daily'
  const label = getModuleLabel('clinic', def.moduleId) ?? def.label
  return <FeatureIntro feature={feature} label={label} eyebrow={`${section} · ${ctx.organizationName}`} canManage={canManage} />
}
