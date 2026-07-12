import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
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

/**
 * Side-effect-free per-REQUEST template forcing for the gallery's live
 * preview cards: the middleware stamps this request header when the path is
 * `/site/<slug>/tf/<template>` (and strips any inbound copy — clients can't
 * inject it usefully anyway: it only resolves for a verified editor of the
 * clinic, affecting no one but themselves). A header, not the preview
 * cookie, because cookies are shared across iframes — six gallery cards each
 * setting the cookie would clobber one another (last card wins) and hijack
 * the owner's real preview session.
 */
export const TEMPLATE_FRAME_HEADER = 'x-dc-template-frame'

export interface ActiveSiteTemplate {
  def: SiteTemplateDef
  /** What clinic_profile.template actually stores (resolved def id). */
  storedId: SiteTemplateDef['id']
  /** True when an owner/admin is previewing a different template. */
  isPreview: boolean
  /** True for a gallery frame render (`/site/<slug>/tf/<id>`) — the layout
   *  suppresses the pageview beacon, chat bubble, banners, and EditBridge so
   *  a preview card never counts traffic or grows interactive chrome. */
  isFrame: boolean
}

/**
 * Resolve the template a request should render with: the stored choice, a
 * gallery frame's forced template (request header, per-request, no side
 * effects), or — for a verified editor of THIS clinic — the preview-cookie
 * override. `canEditClinic` re-runs server-side on EVERY request, so a stale
 * or forged cookie/header is inert for anonymous visitors; preview can never
 * leak. React cache()'d per request (layout + page + nested calls dedupe).
 */
export const resolveActiveSiteTemplate = cache(
  async (slug: string): Promise<ActiveSiteTemplate> => {
    const { orgId, template } = await getClinicThemeBySlug(slug)
    const stored = getSiteTemplate(template)
    const base: ActiveSiteTemplate = {
      def: stored,
      storedId: stored.id,
      isPreview: false,
      isFrame: false,
    }
    if (!orgId) return base

    // Gallery frame — highest precedence (each card must render ITS template
    // regardless of any preview cookie the owner has going).
    const frameId = (await headers()).get(TEMPLATE_FRAME_HEADER)
    if (frameId && isSiteTemplateId(frameId) && (await canEditClinic(orgId))) {
      return { def: getSiteTemplate(frameId), storedId: stored.id, isPreview: false, isFrame: true }
    }

    const raw = (await cookies()).get(TEMPLATE_PREVIEW_COOKIE)?.value
    if (!raw) return base
    const sep = raw.lastIndexOf(':')
    if (sep < 1) return base
    const cookieSlug = raw.slice(0, sep)
    const previewId = raw.slice(sep + 1)
    if (cookieSlug !== slug || !isSiteTemplateId(previewId) || previewId === stored.id) return base
    if (!(await canEditClinic(orgId))) return base

    return { def: getSiteTemplate(previewId), storedId: stored.id, isPreview: true, isFrame: false }
  },
)
