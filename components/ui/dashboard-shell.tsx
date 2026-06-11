import { redirect } from 'next/navigation'
import Header from './header'
import TenantSidebar from './tenant-sidebar'
import DemoBanner from './demo-banner'
import BillingActivationBanner from './billing-activation-banner'
import BillingDunningBanner from './billing-dunning-banner'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { getVisibleModules } from '@/lib/modules'

/**
 * Shared dashboard chrome used by every authenticated route group
 * — (default), (double-sidebar), (alternative). Resolves the tenant
 * context once, renders the tenant-aware sidebar with the right module
 * registry, and wraps children with the standard header + scroll area.
 *
 * Each route group's layout.tsx just delegates here so they all show
 * the same sidebar.
 */
export default async function DashboardShell({
  children,
  sidebarVariant = 'default',
  headerVariant = 'default',
}: {
  children: React.ReactNode
  sidebarVariant?: 'default' | 'v2'
  headerVariant?: 'default' | 'v2' | 'v3'
}) {
  const session = await getServerSession()
  if (!session?.user) redirect('/signin')

  const ctx = await getTenantContext()
  if (!ctx) redirect('/onboarding-01')

  const modules = getVisibleModules(ctx.tenantType, ctx.planTier, ctx.role)
  const badge =
    ctx.tenantType === 'platform'
      ? 'Platform Admin'
      : ctx.tenantType === 'patient'
        ? 'Patient Portal'
        : `${ctx.planTier[0].toUpperCase()}${ctx.planTier.slice(1)} Plan`

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <TenantSidebar
        modules={modules}
        orgName={ctx.organizationName}
        badge={badge}
        variant={sidebarVariant}
      />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header variant={headerVariant} />
        <DemoBanner ctx={ctx} />
        <BillingActivationBanner ctx={ctx} />
        <BillingDunningBanner ctx={ctx} />
        <main className="grow [&>*:first-child]:scroll-mt-16">{children}</main>
      </div>
    </div>
  )
}
