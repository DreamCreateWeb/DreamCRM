import { NextResponse } from 'next/server'
import { getClinicOrgIdBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { isSiteTemplateId } from '@/lib/site-templates/catalog'
import { TEMPLATE_PREVIEW_COOKIE } from '@/lib/site-templates/resolve'

export const dynamic = 'force-dynamic'

/**
 * Owner-only template preview switch:
 *   GET /template-preview?template=<id>&return=<site-relative-path>
 *   GET /template-preview?template=off … clears the preview
 *
 * Sets the `dc-template-preview=<slug>:<id>` cookie the layout's
 * `resolveActiveSiteTemplate` honors (and re-verifies with canEditClinic on
 * every subsequent request — this route gates the SET, the resolver gates
 * every READ, so a forged/stale cookie can never leak a preview to a
 * visitor). A cookie rather than a searchParam so the preview survives
 * internal navigation and is visible to the layout, which owns the
 * palette/font injection.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const url = new URL(req.url)
  const templateId = url.searchParams.get('template') ?? ''
  const rawReturn = url.searchParams.get('return') ?? '/'
  // Relative site paths only — no protocol-relative (`//host`) or absolute
  // URLs, so this can never be an open redirect.
  const returnPath = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/'

  const orgId = await getClinicOrgIdBySlug(slug)
  if (!orgId) return new NextResponse('Not found', { status: 404 })
  if (!(await canEditClinic(orgId))) return new NextResponse('Forbidden', { status: 403 })

  const basePath = await resolveSiteBasePath(slug)
  const dest = new URL(`${basePath}${returnPath}` || '/', url.origin)
  const res = NextResponse.redirect(dest, 303)

  if (templateId === 'off') {
    res.cookies.delete(TEMPLATE_PREVIEW_COOKIE)
    return res
  }
  if (!isSiteTemplateId(templateId)) return new NextResponse('Unknown template', { status: 400 })

  res.cookies.set(TEMPLATE_PREVIEW_COOKIE, `${slug}:${templateId}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Previews are a working-session affordance, not a state — cap orphaned
    // cookies so an abandoned preview quietly expires.
    maxAge: 60 * 60 * 2,
  })
  return res
}
