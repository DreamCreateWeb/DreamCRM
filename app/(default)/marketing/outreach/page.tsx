import { permanentRedirect } from 'next/navigation'

/** The outreach queue moved into the Growth workspace. Forwards the ?tier
 *  filter so tier deep links (campaign CTAs, saved bookmarks) land intact. */
export default async function OutreachRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>
}) {
  const { tier } = await searchParams
  permanentRedirect(tier ? `/growth/outreach/queue?tier=${encodeURIComponent(tier)}` : '/growth/outreach/queue')
}
