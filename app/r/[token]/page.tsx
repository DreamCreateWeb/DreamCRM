import { notFound } from 'next/navigation'
import { getPublicReviewContext, recordReviewClick, PLATFORM_LABEL } from '@/lib/services/reviews'
import { pickPlatformAction } from './actions'

export const metadata = {
  title: 'Leave a review',
  description: 'Share how your visit went.',
}

export const dynamic = 'force-dynamic'

/**
 * Public review landing page — `https://dreamcreatestudio.com/r/<token>`.
 *
 * Patient clicks the link in their email → lands here → picks a
 * platform → redirected to Google / Healthgrades / Facebook / Yelp's
 * write-review URL. The pick is recorded as the 'completed' funnel
 * state on the review_request row.
 *
 * No auth — the signed opaque token IS the auth. Token attribution
 * happens via the click action, which records `clickedAt` + bumps the
 * status from 'sent' to 'clicked' (idempotent, never downgrades).
 *
 * FTC-clean: same prompt to every recipient. No NPS gating, no rating
 * branch. The "private feedback" path is opt-in patient choice in v1.1
 * — not a happiness funnel.
 */
export default async function ReviewLandingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await getPublicReviewContext(token)
  if (!ctx) notFound()

  // Fire-and-forget click recording. Idempotent — re-visits don't
  // re-flip status if it's already 'completed'.
  await recordReviewClick(token)

  const alreadyCompleted = ctx.request.status === 'completed'

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-stone-200 p-8 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 mb-2">
          {ctx.clinicName}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight mb-3">
          {alreadyCompleted ? 'Thanks again!' : `Thanks for coming in, ${escapeHtml(ctx.patientFirstName)}.`}
        </h1>
        <p className="text-[15px] text-stone-700 leading-relaxed mb-6">
          {alreadyCompleted ? (
            <>You already picked a platform earlier — thank you so much for taking the time. If you have another minute, you can still leave reviews on the platforms below.</>
          ) : (
            <>Quick favor — would you take a minute to share how your visit went? Pick wherever you have an account. Honest, good or bad. It helps other people find us.</>
          )}
        </p>

        {ctx.sites.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              We&apos;re not set up to receive reviews online yet — but please reply to the email if you want to share feedback directly. Thank you!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {ctx.sites.map((site) => (
              <form key={site} action={pickPlatformAction.bind(null, token, site)}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-900">
                      Leave a {PLATFORM_LABEL[site]} review
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {site === 'google' && 'Most people find us this way — your review helps the most here.'}
                      {site === 'healthgrades' && 'The dental-specific platform — especially helpful for healthcare reputation.'}
                      {site === 'facebook' && 'Useful if you found us via Facebook or have an account.'}
                      {site === 'yelp' && 'Useful if you already write reviews on Yelp.'}
                    </p>
                  </div>
                  <span className="text-stone-400 text-xl shrink-0">→</span>
                </button>
              </form>
            ))}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-stone-100 text-center">
          <p className="text-[11px] text-stone-400">
            You&apos;re receiving this because you visited {ctx.clinicName}. We&apos;ll only ask once.
          </p>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
