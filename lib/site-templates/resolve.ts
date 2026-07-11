import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { getClinicThemeBySlug } from '@/lib/services/clinic-site'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { getSiteTemplate } from './registry'
import { isSiteTemplateId } from './catalog'
import type { SiteTemplateDef } from './types'

/**
 * Owner-only template preview: `dc-template-preview=<slug>:<id>`, set by the
 * `/site/[slug]/template-preview` route handler (which gates on canEditClinic
 * before setting it). A cookie, not a searchParam, because the palette/font
 * injection lives in the layout (layouts can't read searchParams) and the
 * preview must survive internal navigation across the whole site.
 */
export const TEMPLATE_PREVIEW_COOKIE = 'dc-template-preview'

export interface ActiveSiteTemplate {
  def: SiteTemplateDef
  /** What clinic_profile.template actually stores (resolved def id). */
  storedId: SiteTemplateDef['id']
  /** True when an owner/admin is previewing a different template. */
  isPreview: boolean
}

/**
 * Resolve the template a request should render with: the stored choice, or —
 * for a verified editor of THIS clinic — the preview-cookie override.
 * `canEditClinic` re-runs server-side on EVERY request, so a stale or forged
 * cookie is inert for anonymous visitors; preview can never leak. React
 * cache()'d per request (layout + page + nested calls dedupe).
 */
export const resolveActiveSiteTemplate = cache(
  async (slug: string): Promise<ActiveSiteTemplate> => {
    const { orgId, template } = await getClinicThemeBySlug(slug)
    const stored = getSiteTemplate(template)
    const base: ActiveSiteTemplate = { def: stored, storedId: stored.id, isPreview: false }
    if (!orgId) return base

    const raw = (await cookies()).get(TEMPLATE_PREVIEW_COOKIE)?.value
    if (!raw) return base
    const sep = raw.lastIndexOf(':')
    if (sep < 1) return base
    const cookieSlug = raw.slice(0, sep)
    const previewId = raw.slice(sep + 1)
    if (cookieSlug !== slug || !isSiteTemplateId(previewId) || previewId === stored.id) return base
    if (!(await canEditClinic(orgId))) return base

    return { def: getSiteTemplate(previewId), storedId: stored.id, isPreview: true }
  },
)
