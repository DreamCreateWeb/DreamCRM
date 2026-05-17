import { redirect } from 'next/navigation'
import Header from '@/components/ui/header'
import TenantSidebar from '@/components/ui/tenant-sidebar'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { getVisibleModules } from '@/lib/modules'

// Layout reads the active session + org; never prerender any page under it.
export const dynamic = 'force-dynamic'

export default async function DefaultLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/signin')

  const ctx = await getTenantContext()

  // No org yet (just signed up, or membership not seeded) — send to onboarding
  if (!ctx) {
    redirect('/onboarding-01')
  }

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
      />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header />
        <main className="grow [&>*:first-child]:scroll-mt-16">{children}</main>
      </div>
    </div>
  )
}
