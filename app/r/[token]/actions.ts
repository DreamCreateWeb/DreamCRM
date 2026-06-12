'use server'

import { redirect } from 'next/navigation'
import {
  getPublicReviewContext,
  recordReviewClick,
  recordReviewCompleted,
  reviewPlatformUrl,
  submitReviewText,
  type ReviewSite,
} from '@/lib/services/reviews'
import { looksLikeBot } from '@/lib/form-trust'

/**
 * PRIMARY completion path — patient wrote their review on /r/<token> and
 * hit Submit. Captures the text + optional rating directly into our DB.
 * Returns ok/error JSON so the form can show inline validation; on
 * success the page UI flips to the thank-you state.
 */
export async function submitReviewAction(
  token: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Silent spam drop (the signed token is the primary gate; this is
  // defense-in-depth). A filled honeypot / instant submit returns success
  // without persisting.
  if (looksLikeBot(formData)) return { ok: true }
  const text = (formData.get('reviewText')?.toString() ?? '').trim()
  const ratingRaw = formData.get('rating')?.toString()
  const rating = ratingRaw ? Number(ratingRaw) : null
  const result = await submitReviewText({ token, text, rating })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

/**
 * SECONDARY action: after submitting in DreamCRM, the patient can tap
 * "Also share on {platform}" — opens the external review URL for them.
 * Same recordReviewCompleted as the legacy direct-tap path so the
 * dashboard's `selectedSite` field still gets populated.
 */
export async function pickPlatformAction(token: string, site: ReviewSite): Promise<void> {
  const ctx = await getPublicReviewContext(token)
  if (!ctx) redirect('/')
  const url = reviewPlatformUrl(site, ctx.config)
  if (!url) redirect(`/r/${token}`)
  await recordReviewCompleted(token, site)
  redirect(url)
}

/** Fired by the landing page's RSC fetch — patient opened the link. */
export async function markClickedAction(token: string): Promise<void> {
  await recordReviewClick(token)
}
