import { permanentRedirect } from 'next/navigation'
import { resolveSiteBasePath } from '@/lib/services/clinic-site'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * `/membership` is deduped into `/dental-plans` — the canonical public page for
 * the membership flow (Tend's "Dental Plans" nav voice). Both used to render
 * the same `MembershipJoin` component; keeping two live URLs split SEO signal
 * and risked drift. This route now 308s (permanent) to `/dental-plans` so old
 * links + the canonical page converge on one URL. The `MembershipJoin` client
 * component + `startMembershipCheckout` action still live here and are imported
 * by `/dental-plans`.
 *
 * `permanentRedirect` issues an HTTP 308 (method-preserving permanent), which
 * is what we want for a moved page (vs `redirect`'s 307).
 */
export default async function ClinicMembershipPage({ params }: Props) {
  const { slug } = await params
  const basePath = await resolveSiteBasePath(slug)
  permanentRedirect(`${basePath}/dental-plans`)
}
