import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { getZernioConnection } from '@/lib/services/zernio'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import { zernioConfigured } from '@/lib/zernio'
import { getPlanById } from '@/lib/stripe-config'
import { socialAddonAvailable, socialConnectionLimit } from '@/lib/types/social-entitlements'
import {
  SOCIAL_CHANNEL_SHORTLIST,
  ZERNIO_PLATFORM_LABELS,
  ZERNIO_PLATFORM_ICONS,
  isConnectablePlatform,
  type SocialChannelView,
  type ZernioPlatform,
} from '@/lib/types/zernio'
import type { PlanTier } from '@/lib/modules/types'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import ModuleHint from '@/components/onboarding/module-hint'
import ChannelsBoard from './channels-board'

export const metadata = {
  title: 'Channels - DreamCRM',
  description: 'Connect your Google Business Profile and social channels — Instagram, Facebook, TikTok, YouTube, LinkedIn.',
}

export const dynamic = 'force-dynamic'

/**
 * Channels — the canonical place a clinic connects its Google + social presence
 * (Zernio social module, Phase 3 PR 2). Clinic + owner/admin on ANY plan:
 * Google Business is free for everyone, and the social rows self-gate via the
 * plan's social-connection cap (Basic = 0 → upgrade CTA). No minPlan on the
 * sidebar entry. The /integrations GBP card becomes a status + link here so
 * there's a single connection-management surface (no competing connect buttons).
 */
export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const sp = await searchParams
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null

  const [connection, cap, profileRow] = await Promise.all([
    getZernioConnection(ctx.organizationId),
    canConnectSocialPlatform(ctx.organizationId),
    db
      .select({ socialAddon: schema.clinicProfile.socialAddon })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  const planTier = ctx.planTier as PlanTier
  const addonActive = profileRow?.socialAddon === 1

  // Build the social channel rows: shortlist × connected status.
  const socialChannels: SocialChannelView[] = SOCIAL_CHANNEL_SHORTLIST.map((platform) => ({
    platform,
    label: ZERNIO_PLATFORM_LABELS[platform],
    icon: ZERNIO_PLATFORM_ICONS[platform],
    account: connection.accounts.find((a) => a.platform === platform) ?? null,
  }))

  const gbpAccount = connection.googleBusinessAccounts[0] ?? null

  // Resolve the success / at-limit / error params (validated against the shortlist).
  const connectedParam = one(sp.connected)
  const atLimitParam = one(sp.atLimit)
  const justConnected: ZernioPlatform | null =
    connectedParam && isConnectablePlatform(connectedParam) ? connectedParam : null
  const atLimit: ZernioPlatform | null =
    atLimitParam && isConnectablePlatform(atLimitParam) ? atLimitParam : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <ModuleHint id="channels" />

      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Channels"
        subtitle="Connect your Google Business Profile and the social accounts you post to — Instagram, Facebook, TikTok, YouTube, and LinkedIn. Composing and scheduling to them arrives next."
        actions={
          <ActionButton variant="secondary" size="sm" href="/settings/billing">
            Plan &amp; add-on
          </ActionButton>
        }
      />

      <ChannelsBoard
        configured={zernioConfigured()}
        gbp={{
          connected: connection.status === 'connected' && connection.googleBusinessAccounts.length > 0,
          error: connection.status === 'error',
          account: gbpAccount,
        }}
        socialChannels={socialChannels}
        cap={{ allowed: cap.allowed, limit: cap.limit, current: cap.current, reason: cap.reason }}
        entitlement={{
          planName: getPlanById(planTier)?.name ?? planTier,
          addonAvailable: socialAddonAvailable(planTier),
          addonActive,
          addonRaisesTo: socialConnectionLimit(planTier, true),
        }}
        justConnected={justConnected}
        atLimit={atLimit}
        routeError={one(sp.zernioError)}
      />
    </div>
  )
}
