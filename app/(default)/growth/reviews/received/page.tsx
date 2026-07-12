import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getReviewConfig, listPrivateFeedback } from '@/lib/services/reviews'
import {
  listGoogleReviews,
  getGoogleReviewStats,
  hasGoogleBusinessConnection,
} from '@/lib/services/google-reviews'
import {
  listFacebookReviews,
  getFacebookReviewStats,
  hasFacebookConnection,
} from '@/lib/services/facebook-reviews'
import GoogleReviewsSection, { GoogleConnectPrompt } from './google-reviews-section'
import FacebookReviewsSection from './facebook-reviews-section'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { EncodingLegend } from '@/components/ui/encoding-legend'

export const metadata = {
  title: 'Reviews received — DreamCRM',
  description: 'Read the Google reviews your patients leave, choose which appear on your website, and see private feedback sent straight to your team.',
}

export const dynamic = 'force-dynamic'

export default async function ReviewsReceivedPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/growth/reviews')
  if (ctx.role === 'patient') redirect('/')

  const [
    config,
    privateFeedback,
    googleReviews,
    googleStats,
    googleConnected,
    facebookReviews,
    facebookStats,
    facebookConnected,
  ] = await Promise.all([
    getReviewConfig(ctx.organizationId),
    listPrivateFeedback(ctx.organizationId),
    listGoogleReviews(ctx.organizationId),
    getGoogleReviewStats(ctx.organizationId),
    hasGoogleBusinessConnection(ctx.organizationId),
    listFacebookReviews(ctx.organizationId),
    getFacebookReviewStats(ctx.organizationId),
    hasFacebookConnection(ctx.organizationId),
  ])

  const googleRows = googleReviews.map((g) => ({
    externalReviewId: g.externalReviewId,
    reviewerName: g.reviewerName,
    reviewerPhotoUrl: g.reviewerPhotoUrl,
    starRating: g.starRating,
    comment: g.comment,
    reviewCreatedAtIso: g.reviewCreatedAt ? g.reviewCreatedAt.toISOString() : null,
    replyComment: g.replyComment,
    replyUpdatedAtIso: g.replyUpdatedAt ? g.replyUpdatedAt.toISOString() : null,
    hiddenFromSite: g.hiddenFromSite,
  }))

  const facebookRows = facebookReviews.map((f) => ({
    externalReviewId: f.externalReviewId,
    reviewerName: f.reviewerName,
    reviewerPhotoUrl: f.reviewerPhotoUrl,
    recommendationType: f.recommendationType,
    comment: f.comment,
    reviewCreatedAtIso: f.reviewCreatedAt ? f.reviewCreatedAt.toISOString() : null,
  }))

  // How many Google reviews currently auto-feature on the public site.
  const featuredCount = googleReviews.filter(
    (g) => !g.hiddenFromSite && g.starRating != null && g.starRating >= config.featureMinStars && !!g.comment?.trim(),
  ).length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Reviews received"
        subtitle="Your Google reviews sync in automatically, and your 4★+ ones feature on your website on their own. Private feedback from patients lands at the bottom — just for your team."
        legend={
          <EncodingLegend
            label="What the tags mean"
            pills={[
              { tone: 'ok', label: 'Featured on website ✓', meaning: 'Auto-showing on your public site' },
              { tone: 'neutral', label: 'Hidden from website', meaning: 'You hid this one from your site' },
              { tone: 'ok', label: 'Recommends', meaning: 'A positive Facebook recommendation' },
              { tone: 'urgent', label: "Doesn't recommend", meaning: 'A negative Facebook recommendation' },
              { tone: 'info', label: 'Google / Facebook', meaning: 'Synced from your connected profile' },
            ]}
          />
        }
        actions={
          <div className="flex items-center gap-4">
            {googleReviews.length > 0 && (
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums font-mono-num leading-none">
                  {featuredCount}
                </p>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-0.5">
                  Featured on site
                </p>
              </div>
            )}
            <ActionButton variant="secondary" href="/growth/reviews">
              ← Reviews
            </ActionButton>
          </div>
        }
      />

      {/* ── Google reviews (real, synced via Zernio) — the primary surface ── */}
      {googleConnected ? (
        <GoogleReviewsSection
          rows={googleRows}
          count={googleStats.count}
          averageRating={googleStats.averageRating}
          featureMinStars={config.featureMinStars}
        />
      ) : (
        <GoogleConnectPrompt />
      )}

      {/* ── Facebook recommendations (real, synced via Zernio) ─────────── */}
      {facebookConnected && (
        <FacebookReviewsSection
          rows={facebookRows}
          recommended={facebookStats.recommended}
          notRecommended={facebookStats.notRecommended}
        />
      )}

      {/* ── Private feedback (patient chose "tell us privately") ────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Private feedback
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Notes patients sent straight to your team — never shown publicly.
        </p>
        {privateFeedback.length === 0 ? (
          <EmptyState
            icon="🔒"
            title="No private feedback yet"
            body="When a patient chooses “rather tell us privately?” on their review link, their note lands here — just for your team, never on your website."
          />
        ) : (
          <ul className="space-y-3">
            {privateFeedback.map((f) => (
              <li key={f.id} className="v2-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{f.patientName}</p>
                  {f.rating != null && (
                    <span className="text-amber-500 text-sm tabular-nums" aria-label={`${f.rating} out of 5 stars`}>
                      {'★'.repeat(f.rating)}
                      <span className="opacity-25">{'★'.repeat(5 - f.rating)}</span>
                    </span>
                  )}
                </div>
                {f.completedAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {new Date(f.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
                <blockquote className="text-[15px] leading-[1.55] text-gray-800 dark:text-gray-100 whitespace-pre-wrap pl-3 border-l-2 border-[color:var(--color-hairline-strong)]">
                  {f.privateFeedback}
                </blockquote>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
