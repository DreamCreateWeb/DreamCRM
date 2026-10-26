import { redirect } from 'next/navigation'
import { resolveSiteBasePath } from '@/lib/services/clinic-site'

/**
 * There is no standalone contact page — the header's "Contact" anchors to
 * the footer contact block, Basic-tier homes carry the on-page form, and
 * Pro/Premium route asks to /book + the chat widget. But patients TYPE
 * /contact into the bar out of habit; a 404 on a practice's own site reads
 * as broken. Land them on the home contact anchor instead.
 *
 * The target is HOST-AWARE on purpose. On `slug.dreamcreatestudio.com` or a
 * clinic's custom domain the middleware prefixes every path with
 * `/site/<slug>`, so a hardcoded `/site/<slug>` target re-entered the rewrite
 * (`/site/<slug>/site/<slug>`) and landed on "Clinic not found" — on exactly
 * the hosts where a practice's patients actually browse.
 */
export default async function ContactRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const basePath = await resolveSiteBasePath(slug)
  redirect(`${basePath || '/'}#site-footer-contact`)
}
