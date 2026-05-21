'use server'

import { redirect } from 'next/navigation'
import {
  getPublicReviewContext,
  recordReviewClick,
  recordReviewCompleted,
  reviewPlatformUrl,
  type ReviewSite,
} from '@/lib/services/reviews'

/**
 * Public-side action: patient picked a platform on the landing page.
 * Records the choice + redirects to the external review URL. No auth —
 * the signed-token query param IS the auth.
 */
export async function pickPlatformAction(token: string, site: ReviewSite): Promise<void> {
  const ctx = await getPublicReviewContext(token)
  if (!ctx) {
    // Token invalid / deleted — bounce to a generic page.
    redirect('/')
  }
  const url = reviewPlatformUrl(site, ctx.config)
  if (!url) {
    // Platform not configured — shouldn't happen since the UI only
    // surfaces configured platforms. Defensive bounce.
    redirect(`/r/${token}`)
  }
  await recordReviewCompleted(token, site)
  redirect(url)
}

/** Fired by the landing page's RSC fetch — patient opened the link. */
export async function markClickedAction(token: string): Promise<void> {
  await recordReviewClick(token)
}
