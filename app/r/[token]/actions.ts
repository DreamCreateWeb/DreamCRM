'use server'

import { redirect } from 'next/navigation'
import {
  getPublicReviewContext,
  recordReviewCompleted,
  reviewPlatformUrl,
  submitPrivateFeedback,
  type ReviewSite,
} from '@/lib/services/reviews'
import { looksLikeBot } from '@/lib/form-trust'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'

/**
 * PRIMARY action — the patient tapped "Review us on {platform}" (Google is the
 * hero). Records the completion + which platform they chose, then redirects
 * them to the external write-review URL. FTC-clean: the same options are shown
 * to every patient (no rating gating).
 */
export async function pickPlatformAction(token: string, site: ReviewSite): Promise<void> {
  const ctx = await getPublicReviewContext(token)
  if (!ctx) redirect('/')
  const url = reviewPlatformUrl(site, ctx.config)
  if (!url) redirect(`/r/${token}`)
  await recordReviewCompleted(token, site)
  redirect(url)
}

/**
 * OPTIONAL private-feedback path — the patient chose "rather tell us privately?"
 * Writes `review_request.privateFeedback` (NEVER public — it can't become a
 * testimonial) and pings the front desk. Returns ok/error JSON so the form can
 * show inline validation; on success the page flips to a thank-you state.
 */
export async function submitPrivateFeedbackAction(
  token: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Silent spam drop (the signed token is the primary gate; this is
  // defense-in-depth). A filled honeypot / instant submit returns success
  // without persisting.
  if (looksLikeBot(formData)) return { ok: true }
  if (!(await rateLimitPublicAction('review')))
    return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' }
  const text = (formData.get('feedbackText')?.toString() ?? '').trim()
  const ratingRaw = formData.get('rating')?.toString()
  const rating = ratingRaw ? Number(ratingRaw) : null
  const result = await submitPrivateFeedback({ token, text, rating })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}
