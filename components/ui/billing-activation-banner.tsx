import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'

/**
 * Sticky reminder for platform-provisioned ('managed') clinics whose
 * reserved plan hasn't been activated yet. Renders nothing for everyone
 * else. Mounted in DashboardShell next to the demo banner.
 */
export default function BillingActivationBanner({ ctx }: { ctx: TenantContext }) {
  if (!ctx.billingActivationPending || ctx.tenantType !== 'clinic') return null
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return null

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
      <span>
        Your plan is reserved for {ctx.organizationName} — finish billing setup to unlock it.
      </span>
      <Link
        href="/billing/activate"
        className="rounded-full bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-100 hover:bg-amber-900"
      >
        Finish setup →
      </Link>
    </div>
  )
}
