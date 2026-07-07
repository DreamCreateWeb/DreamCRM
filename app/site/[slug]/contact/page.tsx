import { redirect } from 'next/navigation'

/**
 * There is no standalone contact page — the header's "Contact" anchors to
 * the footer contact block, Basic-tier homes carry the on-page form, and
 * Pro/Premium route asks to /book + the chat widget. But patients TYPE
 * /contact into the bar out of habit; a 404 on a practice's own site reads
 * as broken. Land them on the home contact anchor instead.
 */
export default async function ContactRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/site/${slug}#site-footer-contact`)
}
