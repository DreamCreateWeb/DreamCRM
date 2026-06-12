import { requirePartner } from '@/lib/auth/context'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import PartnerSignOut from './partner/sign-out'

// Reads the session every request; never prerender.
export const dynamic = 'force-dynamic'

/**
 * Referral-partner portal chrome — a deliberately minimal, single-column shell
 * (NO dashboard sidebar). Partners are EXTERNAL users; they see the Dream
 * Create brand (liquid-D + wordmark) on the cool-navy canvas, a centered
 * content column, and a sign-out chip. Fonts are scoped via `.v2-app` so this
 * uses Geist (same as the dashboard) — the only authenticated surface besides
 * the dashboard.
 *
 * The /partner/accept page lives OUTSIDE this layout's gate (it's in its own
 * segment that doesn't requireTenant — a brand-new partner has no session yet).
 *
 * Authorizes via {@link requirePartner} (a direct referral_partner.user_id
 * lookup), NOT `tenantType === 'partner'` — so a partner who is ALSO a platform
 * admin or clinic staffer can still reach their portal (their membership
 * tenancy would otherwise win in getTenantContext).
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { partner } = await requirePartner()

  return (
    <div className="v2-app min-h-screen bg-[color:var(--color-canvas)] text-gray-900 dark:text-gray-100">
      <header className="aura-chrome border-b border-gray-200/70 dark:border-gray-700/60">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <DreamCreateLogo size={26} />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
              {partner.name}
            </span>
            <PartnerSignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 sm:px-6 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
        Partner program · Dream Create
      </footer>
    </div>
  )
}
