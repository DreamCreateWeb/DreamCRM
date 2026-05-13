import { redirect } from 'next/navigation'
import TenantSidebar from '@/components/ui/tenant-sidebar'
import Header from '@/components/ui/header'
import { getTenantContext } from '@/lib/auth/context'
import { getVisibleModules } from '@/lib/modules'

/**
 * Shared dashboard layout for all tenant types (platform, clinic, patient).
 *
 * Resolves the current tenant from the session, picks the matching module
 * registry, and passes it to the sidebar. The route group is named (platform)
 * for historical reasons — it actually handles all three tenant experiences.
 *
 * Individual page.tsx files inside can branch on ctx.tenantType when they
 * need to render different components for different tenants at the same URL.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  const modules = getVisibleModules(ctx.tenantType, ctx.planTier, ctx.role)

  const badge =
    ctx.tenantType === 'platform' ? (ctx.platformAdmin ? 'Platform Admin' : 'Platform') :
    ctx.tenantType === 'patient' ? 'Patient Portal' :
    ctx.planTier === 'premium' ? 'Premium' :
    ctx.planTier === 'pro' ? 'Pro' : 'Basic'

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <TenantSidebar modules={modules} orgName={ctx.organizationName} badge={badge} />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header />
        <main className="grow [&>*:first-child]:scroll-mt-16">
          {children}
        </main>
      </div>
    </div>
  )
}
