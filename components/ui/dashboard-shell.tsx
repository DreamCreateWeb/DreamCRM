import { redirect } from 'next/navigation'
import Header from './header'
import TenantSidebar from './tenant-sidebar'
import BillingActivationBanner from './billing-activation-banner'
import BillingDunningBanner from './billing-dunning-banner'
import KeyboardShortcuts from './keyboard-shortcuts'
import { TrailProvider } from '@/app/trail-context'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { getVisibleModules } from '@/lib/modules'

/**
 * Shared dashboard chrome used by every authenticated route group
 * — (default), (double-sidebar), (alternative). Resolves the tenant
 * context once, renders the v2 tenant-aware sidebar with the right module
 * registry, and wraps children with the v2 header + scroll area.
 *
 * v2 (DESIGN-SYSTEM.md Part 4): the full-width orange demo strip is gone —
 * demo mode now shows an amber 3px top hairline on the canvas + the
 * org-switcher "Demo" pill (sidebar) + the header "Exit demo" chip. The aura
 * wash + grain live on the chrome zones (sidebar + header); the data canvas
 * stays plain so grain never sits behind cards. Each route group's layout.tsx
 * delegates here so they all share one shell.
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
  const moduleIds = modules.map((m) => m.id)
  // ⌘1/⌘2/⌘3 targets — the resolved hrefs of the pinned cockpit modules.
  const cockpitPaths = modules.filter((m) => m.pinned).map((m) => m.path)
  const badge =
    ctx.tenantType === 'platform'
      ? 'Platform admin'
      : ctx.tenantType === 'patient'
        ? 'Patient portal'
        : `${ctx.planTier[0].toUpperCase()}${ctx.planTier.slice(1)} plan`

  return (
    // `v2-app` scopes the Geist Sans dashboard UI font to the authenticated
    // shell only (public site / portal / marketing keep their own families).
    <div className="v2-app flex h-[100dvh] overflow-hidden bg-canvas text-ink-600">
      <TenantSidebar
        modules={modules}
        orgName={ctx.organizationName}
        badge={badge}
        variant={sidebarVariant}
        tenantType={ctx.tenantType}
        isDemo={ctx.isDemo}
      />
      {/* TrailProvider records the per-tab journey-trail so the header's
          back chip can offer effortless, filter-preserving, multi-step return
          navigation. It only feeds the chip; it never auto-navigates. */}
      <TrailProvider modules={modules.map((m) => ({ path: m.path, label: m.label }))}>
        <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {/* Demo mode: amber 3px top hairline on the canvas (replaces the strip). */}
          {ctx.isDemo && (
            <div className="h-[3px] shrink-0 bg-amber-500" aria-hidden="true" data-testid="demo-hairline" />
          )}
          <Header variant={headerVariant} moduleIds={moduleIds} isDemo={ctx.isDemo} />
          {/* Slim billing chip-row (compact skins of the same banners/logic). */}
          <BillingActivationBanner ctx={ctx} />
          <BillingDunningBanner ctx={ctx} />
          <main className="grow [&>*:first-child]:scroll-mt-16">{children}</main>
        </div>
      </TrailProvider>
      {/* Global keyboard map ( [ · ⌘1/2/3 · C · G→P/A/L ). */}
      <KeyboardShortcuts cockpitPaths={cockpitPaths} />
    </div>
  )
}
