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
        {ctx.isDemo && (
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-900">
            <span>
              Demo mode — simulating <strong>{ctx.tenantType === 'patient' ? 'Patient' : 'Clinic'}</strong>: {ctx.organizationName}
              {ctx.patientId && ` › Patient`}
            </span>
            <form action="/developer/clear" method="POST">
              <button type="submit" className="rounded bg-amber-900/20 px-2.5 py-0.5 text-xs font-semibold hover:bg-amber-900/30">
                Exit Demo
              </button>
            </form>
          </div>
        )}
        <main className="grow [&>*:first-child]:scroll-mt-16">
          {children}
        </main>
      </div>
    </div>
  )
}
