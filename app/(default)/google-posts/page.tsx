import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { hasGbpConnection, listGbpPosts } from '@/lib/services/gbp-posts'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import ModuleHint from '@/components/onboarding/module-hint'
import PostComposer from './post-composer'
import PostHistory from './post-history'

export const metadata = {
  title: 'Google Posts - DreamCRM',
  description: 'Publish Updates, Offers, and Events to your Google Business Profile.',
}

export const dynamic = 'force-dynamic'

/**
 * Google Posts — Phase 2 of the Zernio × Google Business integration. A composer
 * for GBP Updates / Offers / Events with a CTA button + image, plus a post
 * history. Clinic + owner/admin on ANY plan — Google Business posting is part of
 * the free GBP surface on every tier (Basic included; see
 * lib/types/social-entitlements.ts). Disconnected → a calm connect-prompt to
 * /integrations. Connected + no posts → an EmptyState leading with "Write your
 * first Google post."
 *
 * Honest by design: Google deprecated per-post insights, so the history shows
 * publish STATUS + a permalink — never fabricated per-post metrics. Local
 * performance (impressions/calls/directions) lives on /seo.
 */
export default async function GooglePostsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  // NO plan gate — Google Business posting is free on every tier.

  const [connected, posts] = await Promise.all([
    hasGbpConnection(ctx.organizationId),
    listGbpPosts(ctx.organizationId),
  ])

  // Resolve the clinic's /book URL so the composer can default the Book CTA.
  let bookUrl: string | null = null
  if (ctx.organizationSlug) {
    const site = await getClinicSiteBySlug(ctx.organizationSlug)
    if (site) bookUrl = `${publicSiteUrl(site)}/book`
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <ModuleHint id="google_posts" />

      <PageHeader
        eyebrow="Growth · Google"
        title="Google Posts"
        subtitle="Publish Updates, Offers, and Events to your Google Business Profile — they appear right on your listing in Search and Maps."
        actions={
          <ActionButton variant="secondary" size="sm" href="/seo">
            Local performance
          </ActionButton>
        }
      />

      {!connected ? (
        <EmptyState
          icon="📍"
          title="Connect Google Business to post"
          body="Link your Google Business Profile and you can publish Updates, Offers, and Events to your listing from here — no Google verification paperwork on your end."
          action={
            <ActionButton variant="primary" size="sm" href="/integrations">
              Go to Integrations
            </ActionButton>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PostComposer bookUrl={bookUrl} />
          </div>
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Your posts {posts.length > 0 && <span className="font-mono-num text-gray-400">· {posts.length}</span>}
            </h2>
            {posts.length === 0 ? (
              <EmptyState
                icon="✍️"
                title="Write your first Google post"
                body="Share a same-week opening, a new-patient offer, or an upcoming event. It’ll show up on your Google listing within minutes."
              />
            ) : (
              <PostHistory posts={posts} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
