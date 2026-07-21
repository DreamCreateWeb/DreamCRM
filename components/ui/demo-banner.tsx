import { exitDemoMode } from '@/app/(default)/ecommerce/customers/admin-actions'
import type { TenantContext } from '@/lib/auth/context'

/**
 * Sticky banner that's rendered above the main content whenever the
 * platform admin is impersonating a clinic / patient via the demo
 * cookie. The exit-demo button is a real form posting to the action
 * — no client JS needed, works even with JS disabled.
 */
export default function DemoBanner({ ctx }: { ctx: TenantContext }) {
  if (!ctx.viaViewAs) return null
  const label =
    ctx.tenantType === 'patient'
      ? `Viewing as patient · ${ctx.organizationName}`
      : `Viewing as ${ctx.role} of ${ctx.organizationName}`

  return (
    <div className="bg-amber-500 dark:bg-amber-600 text-white border-b border-amber-600 dark:border-amber-700">
      <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2.93 17a1 1 0 01-.86-1.5l7.07-12a1 1 0 011.72 0l7.07 12A1 1 0 0117.07 17H2.93zM10 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm0 9a1 1 0 100-2 1 1 0 000 2z"
            />
          </svg>
          <span className="font-medium truncate">{label}</span>
          <span className="hidden sm:inline opacity-80">
            {ctx.isDemo ? '— platform admin demo mode' : '— real clinic · changes are live'}
          </span>
        </div>
        <form action={exitDemoMode}>
          <button
            type="submit"
            className="text-xs font-semibold px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 transition shrink-0"
          >
            Exit demo
          </button>
        </form>
      </div>
    </div>
  )
}
