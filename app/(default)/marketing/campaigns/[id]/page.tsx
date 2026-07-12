import { permanentRedirect } from 'next/navigation'

/** Campaign editor moved into the Growth workspace — patient-timeline and
 *  notification links carry campaign ids, so the 308 forwards the id. */
export default async function CampaignRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  permanentRedirect(`/growth/campaigns/${encodeURIComponent(id)}`)
}
