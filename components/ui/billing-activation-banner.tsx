import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'

/**
 * Slim header-adjacent chip row for platform-provisioned ('managed') clinics
 * whose reserved plan hasn't been activated yet. Renders nothing for everyone
 * else. v2: a single-line amber-tinted strip (not a full-bleed orange band) —
 * same gate + same CTA, slimmer skin (DESIGN-SYSTEM.md Part 4).
 */
export default function BillingActivationBanner({ ctx }: { ctx: TenantContext }) {
  if (!ctx.billingActivationPending || ctx.tenantType !== 'clinic') return null
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/12 px-4 py-1.5 text-sm text-amber-800 dark:text-amber-200 sm:px-6 lg:px-8">
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <span className="truncate font-medium">
          Plan reserved for {ctx.organizationName} — finish billing setup to unlock it.
        </span>
      </span>
      <Link
        href="/billing/activate"
        className="shrink-0 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-white hover:bg-amber-600"
      >
        Finish setup →
      </Link>
    </div>
  )
}
