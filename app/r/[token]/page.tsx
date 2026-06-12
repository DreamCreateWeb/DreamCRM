import { notFound } from 'next/navigation'
import { getPublicReviewContext, recordReviewClick } from '@/lib/services/reviews'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import ReviewForm from './review-form'

export const metadata = {
  title: 'Leave a review',
  description: 'Share how your visit went.',
  // Token-authenticated patient page (renders the patient's name) — never
  // index, never follow. robots.txt also disallows /r/.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Public review landing page — `https://dreamcreatestudio.com/r/<token>`.
 *
 * Patient lands here from the email/SMS link and writes their review IN
 * DreamCRM. Text + optional rating are captured directly (review_request
 * .reviewText). After submitting, the page surfaces optional "also share
 * on Google / Healthgrades" CTAs — the SEO play stays, but the primary
 * outcome is that DreamCRM now owns the text. Staff reads it on
 * /reviews/received and never has to retype it.
 *
 * No auth — the signed opaque token IS the auth. The "already completed"
 * branch shows the patient's submitted review back to them + the
 * optional-platform CTAs (in case they want to also share externally).
 *
 * The page now wears the CLINIC's brand — warm #FAF7F2 ground + brand accent +
 * clinic logo + Fraunces display via MinimalSiteChrome — so the patient feels
 * they're inside their clinic's brand, not generic gray review software.
 *
 * FTC-clean: same prompt to every recipient. No NPS gating, no rating
 * branch. The optional 1-5 stars stay internal to DreamCRM display.
 */
export default async function ReviewLandingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await getPublicReviewContext(token)
  if (!ctx) notFound()

  // Fire-and-forget click recording. Idempotent — re-visits don't downgrade.
  await recordReviewClick(token)

  const brand = ctx.clinic.brandColor || '#9CAF9F'
  const name = ctx.clinic.displayName || ctx.clinicName
  // Link logo + footer back to the clinic's public site when resolvable.
  const homeHref = ctx.clinic.slug
    ? publicSiteUrl({
        slug: ctx.clinic.slug,
        profile: { websiteDomain: ctx.clinic.websiteDomain } as never,
      })
    : null

  return (
    <>
      {/* This page is OUTSIDE the /site/[slug] layout, so it loads its own
          Fraunces + sets the display-font var the warm chrome + form rely on. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FRAUNCES_HREF} />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; --site-header-h: 64px; }`}</style>
      <MinimalSiteChrome
        clinicName={name}
        logoUrl={ctx.clinic.logoUrl}
        brand={brand}
        homeHref={homeHref}
      >
        <div className="px-4 py-12 sm:py-16">
          <div className="max-w-lg mx-auto">
            <ReviewForm
              token={token}
              clinicName={name}
              brand={brand}
              patientFirstName={ctx.patientFirstName}
              alreadyCompleted={ctx.request.status === 'completed'}
              existingReviewText={ctx.existingReviewText}
              existingRating={ctx.existingRating}
              sites={ctx.sites}
            />
          </div>
        </div>
      </MinimalSiteChrome>
    </>
  )
}
