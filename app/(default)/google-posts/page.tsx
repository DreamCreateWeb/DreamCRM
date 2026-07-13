import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Legacy Google Posts route. Phase 3 PR 3 folded the GBP-only composer into the
 * unified multi-platform Social Posts surface (now `/growth/social`) (compose once →
 * Google Business + the connected socials, with a content calendar). This page
 * permanently redirects there so old links / bookmarks never dead-end and there
 * is exactly ONE composer.
 */
export default function GooglePostsRedirect() {
  redirect('/growth/social')
}
