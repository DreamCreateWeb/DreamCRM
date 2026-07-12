import { notFound } from 'next/navigation'
import { getClinicOrgIdBySlug } from '@/lib/services/clinic-site'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { isSiteTemplateId } from '@/lib/site-templates/catalog'
import ClinicSitePage from '../../page'

export const dynamic = 'force-dynamic'

// Owner-only preview surface — never index.
export const metadata = { robots: { index: false, follow: false } }

/**
 * A template FRAME — the gallery's live preview card: this clinic's own
 * homepage rendered in the template named by the path, side-effect-free.
 *
 * The forcing happens in the middleware + resolver pair: the middleware
 * stamps `x-dc-template-frame: <template>` for exactly this path, and
 * `resolveActiveSiteTemplate` (which the site layout reads for palette,
 * fonts, and chrome) honors it for a verified editor — per request, so six
 * gallery iframes render six different templates at once. The old preview
 * COOKIE could never do that (shared across iframes; last card wins), and it
 * hijacked the owner's real preview session.
 *
 * The layout suppresses the pageview beacon, chat bubble, banners, and
 * EditBridge for frames (`isFrame`), so a card render never counts traffic
 * or grows interactive chrome. Owner/admin only — a visitor gets a 404.
 */
export default async function TemplateFramePage({
  params,
}: {
  params: Promise<{ slug: string; template: string }>
}) {
  const { slug, template } = await params
  if (!isSiteTemplateId(template)) notFound()
  const orgId = await getClinicOrgIdBySlug(slug)
  if (!orgId || !(await canEditClinic(orgId))) notFound()

  // Server components are plain async functions — render the existing
  // homepage with synthetic params (the demo-brand page's proven pattern).
  return <ClinicSitePage params={Promise.resolve({ slug })} />
}
