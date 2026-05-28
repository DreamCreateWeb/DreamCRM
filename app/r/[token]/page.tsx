import { notFound } from 'next/navigation'
import { getPublicReviewContext, recordReviewClick } from '@/lib/services/reviews'
import ReviewForm from './review-form'

export const metadata = {
  title: 'Leave a review',
  description: 'Share how your visit went.',
}

export const dynamic = 'force-dynamic'

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

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <ReviewForm
          token={token}
          clinicName={ctx.clinicName}
          patientFirstName={ctx.patientFirstName}
          alreadyCompleted={ctx.request.status === 'completed'}
          existingReviewText={ctx.existingReviewText}
          existingRating={ctx.existingRating}
          sites={ctx.sites}
        />
      </div>
    </div>
  )
}
