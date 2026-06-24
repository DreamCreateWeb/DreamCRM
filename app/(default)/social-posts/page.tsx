import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getComposerChannels, listSocialPosts } from '@/lib/services/social-posts'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import ModuleHint from '@/components/onboarding/module-hint'
import Composer from './composer'
import PostsView from './posts-view'

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
 * /integrations). No channels connected → a calm connect-prompt to /integrations.
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

  const [channels, posts] = await Promise.all([
    getComposerChannels(ctx.organizationId),
    listSocialPosts(ctx.organizationId),
  ])

  // Resolve the clinic's /book URL so the composer can default the Book CTA.
  let bookUrl: string | null = null
  if (ctx.organizationSlug) {
    const site = await getClinicSiteBySlug(ctx.organizationSlug)
    if (site) bookUrl = `${publicSiteUrl(site)}/book`
  }

  const connected = channels.length > 0

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
            <ActionButton variant="secondary" size="sm" href="/seo">
              Local performance
            </ActionButton>
          </>
        }
      />

      {!connected ? (
        <EmptyState
          icon="📣"
          title="Connect a channel to start posting"
          body="Link your Google Business Profile and social channels, and you can publish Updates, Offers, and Events to all of them from here."
          action={
            <ActionButton variant="primary" size="sm" href="/integrations">
              Connect channels
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-6">
          <Composer channels={channels} bookUrl={bookUrl} />
          <PostsView posts={posts} />
        </div>
      )}
    </div>
  )
}
