import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import { db, schema } from '@/lib/db'
import { getIntegrationsDashboard } from '@/lib/services/pms'
import { getZernioConnection } from '@/lib/services/zernio'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import { zernioConfigured } from '@/lib/zernio'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import {
  socialAddonAvailable,
  socialAddonPriceCents,
  socialConnectionLimit,
} from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'
import { PROVIDER_LABELS } from '@/lib/types/pms'
import {
  SOCIAL_CHANNEL_SHORTLIST,
  ZERNIO_PLATFORM_LABELS,
  ZERNIO_PLATFORM_ICONS,
  isConnectablePlatform,
  type SocialChannelView,
  type ZernioPlatform,
} from '@/lib/types/zernio'
import IntegrationsLibrary from './integrations-library'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Integrations - DreamCRM',
  description:
    'Connect the tools that power your practice — your PMS (Open Dental), Google Business, and your social channels.',
}

export const dynamic = 'force-dynamic'

/**
 * Integrations — a premium app marketplace / integrations directory. A
 * brand-rich grid of integration cards (real logos, search + category filter,
 * an overview "control center" header), like Vercel Integrations / Notion
 * connections. The former /channels surface (social + GBP connect) folds in
 * here, so this is the single place a clinic plugs things in.
 *
 * The deep PMS management moved OFF this page onto its own detail route
 * (`/integrations/open-dental`) — the marketplace card links there. Google
 * Business connected listing has a light detail route too
 * (`/integrations/google-business`); social stays inline on its card.
 *
 * Gating: PMS (Open Dental) is Premium-tier; GBP + social are usable on every
 * plan (Basic included; social bounded by the per-plan cap; owner/admin to
 * mutate) — so we never redirect a below-Premium clinic away. The PMS card just
 * shows a Premium pill + upgrade affordance.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const pmsEligible = planAllows(ctx.planTier, 'premium')

  const sp = await searchParams
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null

  // GBP + social load for everyone; the PMS card state only for Premium (we
  // only need the connection summary now — the full dashboard lives on the
  // detail route /integrations/open-dental).
  const [dashboard, zernio, cap, profileRow] = await Promise.all([
    pmsEligible ? getIntegrationsDashboard(ctx.organizationId) : Promise.resolve(null),
    getZernioConnection(ctx.organizationId),
    canConnectSocialPlatform(ctx.organizationId),
    db
      .select({
        socialAddon: schema.clinicProfile.socialAddon,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  const connection = dashboard?.connection ?? null
  const connected = connection?.status === 'connected'
  const isDemo = connection?.provider === 'demo'

  // ── Social entitlement props ──────────────────────────────────────────────
  const planTier = ctx.planTier as PlanTier
  const addonActive = profileRow?.socialAddon === 1
  const addonCents = socialAddonPriceCents(planTier)
  const socialChannels: SocialChannelView[] = SOCIAL_CHANNEL_SHORTLIST.map((platform) => ({
    platform,
    label: ZERNIO_PLATFORM_LABELS[platform],
    icon: ZERNIO_PLATFORM_ICONS[platform],
    account: zernio.accounts.find((a) => a.platform === platform) ?? null,
  }))
  const gbpAccount = zernio.googleBusinessAccounts[0] ?? null

  // Success / at-limit / error params (validated against the shortlist).
  const connectedParam = one(sp.connected)
  const atLimitParam = one(sp.atLimit)
  const justConnected: ZernioPlatform | null =
    connectedParam && isConnectablePlatform(connectedParam) ? connectedParam : null
  const atLimit: ZernioPlatform | null =
    atLimitParam && isConnectablePlatform(atLimitParam) ? atLimitParam : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="integrations" />

      <PageHeader
        eyebrow={`Business · ${ctx.organizationName}`}
        title="Integrations"
        subtitle="Connect the tools that power your practice — your practice-management system, Google Business, and the social channels you post to. DreamCRM wraps what you already run; it doesn't replace it."
      />

      <IntegrationsLibrary
        zernioConfigured={zernioConfigured()}
        pmsEligible={pmsEligible}
        pms={{
          connected,
          errored: connection?.lastSyncStatus === 'error',
          providerLabel: connection
            ? PROVIDER_LABELS[connection.provider as keyof typeof PROVIDER_LABELS] ?? connection.provider
            : 'Open Dental',
          isDemo: !!isDemo,
        }}
        gbp={{
          connected: zernio.status === 'connected' && zernio.googleBusinessAccounts.length > 0,
          error: zernio.status === 'error',
          account: gbpAccount,
        }}
        socialChannels={socialChannels}
        cap={{ allowed: cap.allowed, limit: cap.limit, current: cap.current, reason: cap.reason }}
        entitlement={{
          planName: getPlanById(planTier)?.name ?? planTier,
          addonAvailable: socialAddonAvailable(planTier),
          addonActive,
          addonRaisesTo: socialConnectionLimit(planTier, true),
          addonPriceDollars: addonCents != null ? Math.round(addonCents / 100) : null,
          addonConfigured: socialAddonConfigured(),
          managedBilling: !profileRow?.stripeSubscriptionId,
        }}
        justConnected={justConnected}
        atLimit={atLimit}
        routeError={one(sp.zernioError)}
      />
    </div>
  )
}
