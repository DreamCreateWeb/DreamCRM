import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { getComposerChannels, listSocialPosts } from '@/lib/services/social-posts'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import { zernioConfigured } from '@/lib/zernio'
import { getPlanById, socialAddonConfigured } from '@/lib/stripe-config'
import { socialAddonAvailable, socialAddonPriceCents } from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import ModuleHint from '@/components/onboarding/module-hint'
import Composer from './composer'
import PostsView from './posts-view'
import ConnectChannels, { type ConnectChannelsProps } from './connect-channels'

export const metadata = {
  title: 'Social Posts - DreamCRM',
  description: 'Compose once, publish or schedule to Google Business and your social channels — with a content calendar.',
}

export const dynamic = 'force-dynamic'

/**
 * Social Posts — the unified multi-platform composer (Zernio Phase 3 PR 3).
 * Compose once → publish/schedule to Google Business + the connected socials
 * (Instagram / Facebook / TikTok / YouTube / LinkedIn), with a content calendar.
 * Clinic + owner/admin on ANY plan — posting to a channel just requires it to be
 * CONNECTED (the social-connection cap is enforced at connect-time on
 * /integrations). Nothing connected → an in-place connect surface right here so
 * a new clinic links its real accounts without hunting through the marketplace.
 *
 * Honest by design: per-post insights are deprecated on Google and not yet
 * pulled for the socials, so the history/calendar show publish STATUS +
 * permalinks — never fabricated per-post metrics. Local GBP performance lives on
 * /seo; per-platform social analytics arrive in PR 4.
 */
export default async function SocialPostsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  // NO plan gate — posting is gated by what's connected (owner/admin + clinic).

  const planTier = ctx.planTier as PlanTier
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  const [channels, posts, cap, profileRow] = await Promise.all([
    getComposerChannels(ctx.organizationId),
    listSocialPosts(ctx.organizationId),
    canConnectSocialPlatform(ctx.organizationId),
    db
      .select({ socialAddon: schema.clinicProfile.socialAddon })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  // Resolve the clinic's /book URL so the composer can default the Book CTA.
  let bookUrl: string | null = null
  if (ctx.organizationSlug) {
    const site = await getClinicSiteBySlug(ctx.organizationSlug)
    if (site) bookUrl = `${publicSiteUrl(site)}/book`
  }

  const connected = channels.length > 0

  // Props for the in-place connect surface (cap + add-on + which platforms are
  // already linked, with their handles).
  const addonCents = socialAddonPriceCents(planTier)
  const connectProps: Omit<ConnectChannelsProps, 'variant'> = {
    connected: channels.map((c) => c.platform),
    handles: Object.fromEntries(channels.map((c) => [c.platform, c.handle])),
    cap: { allowed: cap.allowed, limit: cap.limit, current: cap.current },
    planName: getPlanById(planTier)?.name ?? planTier,
    addonAvailable: socialAddonAvailable(planTier),
    addonActive: profileRow?.socialAddon === 1,
    addonPriceDollars: addonCents != null ? Math.round(addonCents / 100) : null,
    addonConfigured: socialAddonConfigured(),
    zernioConfigured: zernioConfigured(),
    canManage,
    isDemo: ctx.isDemo,
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <ModuleHint id="social_posts" />

      <PageHeader
        eyebrow="Growth · Social"
        title="Social Posts"
        subtitle="Compose once and publish — or schedule — to Google Business and your social channels at the same time. See everything on a content calendar."
        legend={
          <EncodingLegend
            label="What the statuses mean"
            pills={[
              { tone: 'ok', label: 'Published', meaning: 'Live on the channel' },
              { tone: 'info', label: 'Scheduled', meaning: 'Queued to publish at a future time' },
              { tone: 'neutral', label: 'Draft', meaning: 'Saved, not yet sent' },
              { tone: 'urgent', label: 'Failed', meaning: "Didn't post — check the error and retry" },
            ]}
          />
        }
        actions={
          <>
            <ActionButton variant="secondary" size="sm" href="/integrations">
              Channels
            </ActionButton>
            {/* Drill into the proof: per-platform reach + what you've published. */}
            <ActionButton variant="secondary" size="sm" href="/analytics">
              Social reach
            </ActionButton>
            <ActionButton variant="secondary" size="sm" href="/seo">
              Local performance
            </ActionButton>
          </>
        }
      />

      {!connected ? (
        <ConnectChannels variant="hero" {...connectProps} />
      ) : (
        <div className="space-y-6">
          <ConnectChannels variant="add" {...connectProps} />
          <Composer channels={channels} bookUrl={bookUrl} clinicName={ctx.organizationName} />
          <PostsView posts={posts} channels={channels} clinicName={ctx.organizationName} />
        </div>
      )}
    </div>
  )
}
