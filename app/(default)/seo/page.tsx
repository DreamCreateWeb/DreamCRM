import { permanentRedirect } from 'next/navigation'

/** The SEO module moved into the Website workspace (/website/seo). Forwards
 *  the GSC OAuth round-trip params so an in-flight connect still lands with
 *  its success/error banner. */
export default async function SeoRedirect({
  searchParams,
}: {
  searchParams: Promise<{ gscConnected?: string; gscError?: string }>
}) {
  const { gscConnected, gscError } = await searchParams
  const qs = new URLSearchParams()
  if (gscConnected) qs.set('gscConnected', gscConnected)
  if (gscError) qs.set('gscError', gscError)
  permanentRedirect(`/website/seo${qs.size > 0 ? `?${qs}` : ''}`)
}
