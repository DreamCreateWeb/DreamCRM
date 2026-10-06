import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { getIntegrationsDashboard } from '@/lib/services/pms'
import { getPmsConnectRequest } from '@/lib/services/pms-connect'
import { describePmsConnectStatus, pmsVendorLabel } from '@/lib/pms-connect'
import { getSmsRegistration, smsDriver } from '@/lib/services/sms-registration'
import { REGISTRATION_STATE_LABEL } from '@/lib/sms-registration'
import { formatPhone } from '@/lib/phone'
import { getZernioConnection } from '@/lib/services/zernio'
import { getShopConfig } from '@/lib/services/shop'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import { zernioConfigured } from '@/lib/zernio'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import { socialAddonAvailable, socialAddonPriceCents, socialConnectionLimit } from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'
import { PROVIDER_LABELS } from '@/lib/types/pms'
import { isConnectablePlatform, type ZernioPlatform } from '@/lib/types/zernio'
import { resolveCatalog, type LiveIntegrationState, type IntegrationConnectionFact } from '@/lib/integrations/resolve'
import { resolveBundles } from '@/lib/integrations/bundles'
import IntegrationsLibrary from './integrations-library'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Integrations - DreamCRM',
  description:
    'Connect the tools that power your practice — your PMS, Google Business, social channels, email, and payments. A catalog built to grow.',
}

export const dynamic = 'force-dynamic'

/**
 * Integrations — a premium app marketplace built on a CATALOG/REGISTRY
 * architecture (lib/integrations/catalog.ts) so it scales to hundreds — and
 * eventually thousands — of integrations. The page's only job is to (1) load the
 * org's live connection state for the integrations we actually wire, (2) build a
 * `LiveIntegrationState`, (3) resolve the pure catalog against it, and (4) hand
 * the resolved list to the marketplace UI. Adding an integration is a DATA entry
 * in the catalog, not a change here (unless it needs a new live-state source).
 *
 * The former /channels surface (social + GBP connect) folds in here, so this is
 * the single place a clinic plugs things in. Deep PMS management lives on its
 * own detail route (`/integrations/pms`); GBP has a light detail route
 * too (`/integrations/google-business`).
 *
 * Gating: the PMS bridge is Premium-tier; GBP + social are usable on every plan
 * (Basic included; social bounded by the per-plan cap; owner/admin to mutate) —
 * so we never redirect a below-Premium clinic away. Gmail + Stripe are surfaced
 * with their REAL connection status and link out to their existing flows (we
 * don't rebuild those here).
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const planTier = ctx.planTier as PlanTier

  const sp = await searchParams
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null

  // Load the live state for the integrations we actually wire. GBP + social +
  // Gmail + Stripe load for everyone; the PMS dashboard only for Premium (the
  // full PMS dashboard lives on the detail route).
  const [dashboard, zernio, cap, profileRow, shopConfig, gmailRows, pmsRequest, smsReg] = await Promise.all([
    getIntegrationsDashboard(ctx.organizationId),
    getZernioConnection(ctx.organizationId),
    canConnectSocialPlatform(ctx.organizationId),
    db
      .select({
        socialAddon: schema.clinicProfile.socialAddon,
        stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
        billingMode: schema.clinicProfile.billingMode,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getShopConfig(ctx.organizationId),
    db
      .select({ emailAddress: schema.emailAccount.emailAddress, syncStatus: schema.emailAccount.syncStatus })
      .from(schema.emailAccount)
      .where(and(eq(schema.emailAccount.organizationId, ctx.organizationId), eq(schema.emailAccount.disabled, false)))
      .limit(5),
    // The clinic's PMS connect request (S4) — the honest "we're connecting
    // it" state between asking and the bridge being bound. Best-effort.
    getPmsConnectRequest(ctx.organizationId).catch(() => null),
    // SMS registration state (Phase 5 limb 3) — dark ('none') until
    // SMS_DRIVER is set; best-effort so a hiccup never breaks the grid.
    getSmsRegistration(ctx.organizationId).catch(() => null),
  ])

  const connection = dashboard?.connection ?? null

  // ── Assemble the per-integration live connection facts ────────────────────
  const connections: Record<string, IntegrationConnectionFact | undefined> = {}

  // PMS: ONE card (the bridge) since 2026-08-19 — whatever provider the
  // connection row carries (nexhealth, a legacy open_dental bind, the demo)
  // lights it, and the title names the actual system so the card stays honest.
  if (connection?.status === 'connected') {
    const cardId = 'nexhealth'
    connections[cardId] = {
      connected: true,
      errored: connection.lastSyncStatus === 'error',
      isDemo: connection.provider === 'demo',
      title:
        PROVIDER_LABELS[connection.provider as keyof typeof PROVIDER_LABELS] ?? connection.provider ?? 'Your PMS',
    }
  } else if (pmsRequest && (pmsRequest.status === 'requested' || pmsRequest.status === 'scheduled')) {
    // Asked, not yet bound — in progress on OUR side (S4, law 3).
    connections.nexhealth = {
      connected: false,
      pending: describePmsConnectStatus(pmsRequest.status, pmsVendorLabel(pmsRequest.vendor, pmsRequest.vendorName)).pill,
      title: pmsVendorLabel(pmsRequest.vendor, pmsRequest.vendorName),
    }
  }

  // Google Business (Zernio).
  const gbpAccount = zernio.googleBusinessAccounts[0] ?? null
  if (zernio.status === 'connected' && gbpAccount) {
    connections.googlebusiness = {
      connected: true,
      isDemo: zernio.isDemo,
      title: gbpAccount.displayName || gbpAccount.username || 'Your Google Business listing',
      handle: gbpAccount.username && gbpAccount.displayName ? gbpAccount.username : null,
    }
  } else if (zernio.status === 'error') {
    connections.googlebusiness = { connected: false, errored: true }
  }

  // Social channels (Zernio) — one fact per connected shortlist platform.
  for (const account of zernio.accounts) {
    if (account.platform === 'googlebusiness') continue
    connections[account.platform] = {
      connected: true,
      isDemo: zernio.isDemo,
      title: account.displayName || account.username || account.platform,
      handle: account.username || account.displayName || null,
    }
  }

  // Gmail (first-party OAuth) — connected when a non-disabled mailbox exists.
  const gmail = gmailRows[0]
  if (gmail) {
    connections.gmail = {
      connected: true,
      errored: gmail.syncStatus === 'error',
      title: gmailRows.length > 1 ? `${gmailRows.length} mailboxes connected` : gmail.emailAddress,
      handle: gmailRows.length > 1 ? gmail.emailAddress : null,
    }
  }

  // SMS (Phase 5 limb 3). Connected = the carriers said yes and the number
  // is live. Errored = a state whose next move is visible on the detail
  // page (their fix, or our honest "we're on it") — the badge is the door,
  // the page is the sentence.
  if (smsReg && smsReg.state !== 'none') {
    const errored = ['brand_action_needed', 'rejected', 'suspended'].includes(smsReg.state)
    connections.sms = {
      connected: smsReg.state === 'approved',
      errored,
      // Started and waiting on the carriers (S4, law 3): the card says so in
      // the registration's own words rather than "Not connected".
      pending: smsReg.state !== 'approved' && !errored ? REGISTRATION_STATE_LABEL[smsReg.state] : null,
      title: smsReg.phoneNumber ? formatPhone(smsReg.phoneNumber) : 'Registration in progress',
    }
  }

  // Stripe Connect (first-party OAuth) — connected when the account is active.
  if (shopConfig.stripeAccountStatus === 'active') {
    connections.stripe_connect = {
      connected: true,
      errored: !shopConfig.chargesEnabled || !shopConfig.payoutsEnabled,
      title: 'Your Stripe account',
      handle: shopConfig.chargesEnabled ? 'Charges enabled' : 'Finish setup in Stripe',
    }
  } else if (shopConfig.stripeAccountStatus === 'restricted') {
    connections.stripe_connect = { connected: false, errored: true }
  }

  const liveState: LiveIntegrationState = {
    zernioConfigured: zernioConfigured(),
    smsConfigured: smsDriver() !== 'none',
    connections,
    socialCap: { allowed: cap.allowed, limit: cap.limit, current: cap.current },
  }

  const resolved = resolveCatalog(liveState)
  // Group the resolved catalog into the feature bundles the UI renders from.
  const bundles = resolveBundles(resolved)

  // ── Social entitlement props (cap + add-on) ───────────────────────────────
  const addonActive = profileRow?.socialAddon === 1
  const addonCents = socialAddonPriceCents(planTier)

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
        subtitle="Connect the tools that power your practice — your practice-management system, Google Business, the social channels you post to, email, and payments. DreamCRM wraps what you already run; it doesn't replace it."
      />

      <IntegrationsLibrary
        bundles={bundles}
        zernioConfigured={zernioConfigured()}
        planName={getPlanById(planTier)?.name ?? planTier}
        cap={{ allowed: cap.allowed, limit: cap.limit, current: cap.current, reason: cap.reason }}
        entitlement={{
          addonAvailable: socialAddonAvailable(planTier),
          addonActive,
          addonRaisesTo: socialConnectionLimit(planTier, true),
          addonPriceDollars: addonCents != null ? Math.round(addonCents / 100) : null,
          addonConfigured: socialAddonConfigured(),
          // "Managed" = the platform bills this clinic outside self-serve
          // Stripe. A SELF-SERVE clinic on the no-card trial also has no
          // subscription yet — that's needsSubscription, not managed, and it
          // routes to billing instead of "contact us".
          managedBilling:
            profileRow?.billingMode === 'managed' || profileRow?.billingMode === 'comped',
          needsSubscription:
            !profileRow?.stripeSubscriptionId &&
            profileRow?.billingMode !== 'managed' &&
            profileRow?.billingMode !== 'comped',
        }}
        oauthConnectHrefs={{ gmail: '/inbox', stripe_connect: '/shop' }}
        justConnected={justConnected}
        atLimit={atLimit}
        routeError={one(sp.zernioError)}
        isDemo={ctx.isDemo}
        canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      />
    </div>
  )
}
