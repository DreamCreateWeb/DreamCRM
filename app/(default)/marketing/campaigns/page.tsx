import { permanentRedirect } from 'next/navigation'

/** Campaigns moved into the Growth workspace (both tenants). Forwards the
 *  prefill params so audience "Send" CTAs and old bookmarks land intact. */
export default async function CampaignsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ prefill_audience?: string; prefill_template?: string }>
}) {
  const { prefill_audience, prefill_template } = await searchParams
  const qs = new URLSearchParams()
  if (prefill_audience) qs.set('prefill_audience', prefill_audience)
  if (prefill_template) qs.set('prefill_template', prefill_template)
  const suffix = qs.size > 0 ? `?${qs.toString()}` : ''
  permanentRedirect(`/growth/campaigns${suffix}`)
}
