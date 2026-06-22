import { redirect } from 'next/navigation'
import Header from './header'
import TenantSidebar from './tenant-sidebar'
import BillingActivationBanner from './billing-activation-banner'
import BillingDunningBanner from './billing-dunning-banner'
import TrialBanner from './trial-banner'
import TrialReminderModal from './trial-reminder-modal'
import TrialEndedWall from './trial-ended-wall'
import KeyboardShortcuts from './keyboard-shortcuts'
import { TrailProvider } from '@/app/trail-context'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ToastProvider } from '@/components/ui/toast'
import { SkipToContent } from '@/components/ui/skip-to-content'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { trialDaysLeft } from '@/lib/trial'
import { findPendingInviteForEmail } from '@/lib/auth/pending-invite'
import { applyBundleGate, getVisibleModules } from '@/lib/modules'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import type { BundleId } from '@/lib/integrations/bundles'

/**
 * Shared dashboard chrome used by every authenticated route group
 * — (default), (double-sidebar). Resolves the tenant
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
  if (!ctx) {
    // Org-less, but were they INVITED to an existing clinic? If so, send them to
    // accept it — NOT into onboarding, which would create a duplicate clinic
    // (the first-real-clinic bug). Only fall through to onboarding when there's
    // genuinely no pending invite.
    const pending = await findPendingInviteForEmail(session.user.email)
    redirect(pending ? `/accept-invite?token=${pending.id}` : '/onboarding-01')
  }

  // Plan/role visibility, then the integration-bundle feature gate: a clinic's
  // bundle-tagged modules (Social Posts, Shop) surface only once the bundle is
  // active (auto-derived from what's connected). Other tenant types carry no
  // bundle-gated modules, so they skip the (clinic-scoped) lookup entirely.
  const activeBundles =
    ctx.tenantType === 'clinic' ? await getActiveBundlesForSidebar(ctx.organizationId) : new Set<BundleId>()
  const modules = applyBundleGate(getVisibleModules(ctx.tenantType, ctx.planTier, ctx.role), activeBundles)
  const moduleIds = modules.map((m) => m.id)
  // ⌘1/⌘2/⌘3 targets — the resolved hrefs of the pinned cockpit modules.
  const cockpitPaths = modules.filter((m) => m.pinned).map((m) => m.path)
  const badge =
    ctx.tenantType === 'platform'
      ? 'Platform admin'
      : ctx.tenantType === 'patient'
        ? 'Patient portal'
        : `${ctx.planTier[0].toUpperCase()}${ctx.planTier.slice(1)} plan`

  // Owner/admin of a clinic in the last 3 days of its no-card trial → mount the
  // once-a-day escalating reminder popup (a nudge; the hard lock is the wall).
  const trialNudgeDays =
    ctx.onTrial && ctx.tenantType === 'clinic' && (ctx.role === 'owner' || ctx.role === 'admin')
      ? trialDaysLeft(ctx.trialEndsAt ?? null)
      : null

  return (
    // `v2-app` scopes the Geist Sans dashboard UI font to the authenticated
    // shell only (public site / portal / marketing keep their own families).
    <div className="v2-app flex h-[100dvh] overflow-hidden bg-canvas text-ink-600">
      {/* Keyboard a11y: the first focusable element lets keyboard/AT users jump
          past the whole sidebar straight to the page content. Hidden until focused. */}
      <SkipToContent />
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
      {/* scope keys the journey trail to THIS user+org — trail labels can be a
          patient name (PHI), so it must never carry across clinics/users in a tab. */}
      <TrailProvider scope={`${ctx.userId}:${ctx.organizationId}`} modules={modules.map((m) => ({ path: m.path, label: m.label }))}>
        <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {/* Demo mode: amber 3px top hairline on the canvas (replaces the strip). */}
          {ctx.isDemo && (
            <div className="h-[3px] shrink-0 bg-amber-500" aria-hidden="true" data-testid="demo-hairline" />
          )}
          <Header variant={headerVariant} moduleIds={moduleIds} isDemo={ctx.isDemo} />
          {/* Slim billing chip-row (compact skins of the same banners/logic). */}
          <BillingActivationBanner ctx={ctx} />
          <BillingDunningBanner ctx={ctx} />
          <TrialBanner ctx={ctx} />
          {trialNudgeDays != null && trialNudgeDays <= 3 && (
            <TrialReminderModal
              daysLeft={trialNudgeDays}
              href={ctx.hasReservedPlan ? '/billing/activate' : '/settings/billing'}
              storageKey={`dc.trial-nudge:${ctx.userId}`}
            />
          )}
          <main id="main-content" tabIndex={-1} className="grow outline-none [&>*:first-child]:scroll-mt-16">
            {/* ConfirmProvider lets any page swap native window.confirm() for the
                on-brand, accessible in-app dialog via useConfirm(). */}
            <ConfirmProvider>
              <ToastProvider>
                {/* No-card trial expired without billing → lock the dashboard behind
                    the "set up billing" wall (chrome stays so sign-out works). */}
                {ctx.trialExpired && ctx.tenantType === 'clinic' ? (
                  <TrialEndedWall
                    orgName={ctx.organizationName}
                    managed={!!ctx.hasReservedPlan}
                    canManageBilling={ctx.role === 'owner' || ctx.role === 'admin'}
                  />
                ) : (
                  children
                )}
              </ToastProvider>
            </ConfirmProvider>
          </main>
        </div>
      </TrailProvider>
      {/* Global keyboard map ( [ · ⌘1/2/3 · C · G→P/A/L ). */}
      <KeyboardShortcuts cockpitPaths={cockpitPaths} />
    </div>
  )
}
