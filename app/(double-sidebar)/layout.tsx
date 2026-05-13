import { redirect } from 'next/navigation'
import TenantSidebar from '@/components/ui/tenant-sidebar'
import Header from '@/components/ui/header'
import { getTenantContext } from '@/lib/auth/context'
import { getVisibleModules } from '@/lib/modules'

export default async function DoubleSidebarLayout({
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
      <TenantSidebar modules={modules} orgName={ctx.organizationName} badge={badge} variant="v2" />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header variant="v2" />
        <main className="grow [&>*:first-child]:scroll-mt-16">
          {children}
        </main>
      </div>
    </div>
  )
}
