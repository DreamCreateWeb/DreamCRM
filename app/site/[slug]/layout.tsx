import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { getClinicThemeBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { appBaseUrl, shouldShowComingSoon } from '@/lib/clinic-site-helpers'
import ComingSoon from '@/components/clinic-site/coming-soon'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { paletteCss } from '@/lib/clinic-site-theme'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import TemplateFontLinks from '@/components/clinic-site/template-fonts'
import TemplatePreviewBanner from '@/components/clinic-site/template-preview-banner'
import DraftPreviewBanner from '@/components/clinic-site/draft-preview-banner'
import EditBridgeGate from '@/components/clinic-site/edit-bridge-gate'
import SiteViewBeacon from '@/components/clinic-site/site-view-beacon'
import SiteChatWidget from '@/components/clinic-site/site-chat-widget'
import AnnouncementBar from '@/components/clinic-site/announcement-bar'
import { activeAnnouncement } from '@/lib/types/clinic-content'
import { clinicDayKey } from '@/lib/format-datetime'

/**
 * Site-wide layout for clinic public pages (/site/[slug]/...). The active
 * TEMPLATE (clinic_profile.template, or an owner's preview cookie) decides the
 * display font links + the palette recipe here, once, for every page — see
 * lib/site-templates/. Fonts load via runtime <link> (never next/font, which
 * fetches at build time and broke the CodeBuild pipeline once — PR #166);
 * the non-blocking media=print trick lives in TemplateFontLinks.
 *
 * It also mounts:
 *  - the Website Studio EditBridge (gated to owner/admin + the `?edit=1` flag)
 *    so the canvas stays editable as the clinic navigates their own pages;
 *  - the site-wide SiteViewBeacon — a fire-and-forget pageview counter so the
 *    clinic can finally see how many people visit their site (the only proxy
 *    before was GSC clicks: search-only, ~2-day lag);
 *  - the template-preview banner when an owner is trying a different design.
 *
 * Inter for body text is loaded globally by the root layout, so we don't
 * need to touch it here.
 */
export default async function ClinicSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { orgId, brand, hasEditorDraft } = await getClinicThemeBySlug(slug)
  const { def, isPreview, isFrame } = await resolveActiveSiteTemplate(slug)
  const canEdit = orgId ? await canEditClinic(orgId) : false
  const palette = def.buildPalette(brand)
  // The "Message us" bubble (site-wide, so it lives here, not per-page).
  // Default ON; Settings → Practice is the off switch. Never in a gallery
  // frame — a scaled preview card gets no interactive chrome.
  let chatWidget: { enabled: boolean; clinicName: string } | null = null
  // The announcement strip is live-immediate + self-expiring; never in a
  // scaled gallery frame (a preview card gets no chrome). Resolved with the
  // clinic-local day so a timed bar ("closed through Fri") doesn't drop a day
  // early on the server's UTC clock.
  let announcement: ReturnType<typeof activeAnnouncement> = null
  // THE GO-LIVE GATE: while the lever is un-pulled (site_live_at null), a
  // visitor sees the branded coming-soon page instead of ANY real page —
  // this layout is the one choke point every public page (including /book)
  // renders through. Editors and gallery frames keep the real site
  // (shouldShowComingSoon owns the rule).
  let comingSoon: { clinicName: string; phone: string | null; logoUrl: string | null } | null =
    null
  if (orgId && !isFrame) {
    const [prof] = await db
      .select({
        enabled: clinicProfile.chatWidgetEnabled,
        displayName: clinicProfile.displayName,
        announcement: clinicProfile.announcement,
        timezone: clinicProfile.timezone,
        siteLiveAt: clinicProfile.siteLiveAt,
        phone: clinicProfile.phone,
        logoUrl: clinicProfile.logoUrl,
      })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, orgId))
      .limit(1)
    if (prof && shouldShowComingSoon({ siteLiveAt: prof.siteLiveAt, canEdit, isFrame })) {
      comingSoon = {
        clinicName: prof.displayName ?? 'Our practice',
        phone: prof.phone ?? null,
        logoUrl: prof.logoUrl ?? null,
      }
    }
    if (prof && prof.enabled !== false) {
      chatWidget = { enabled: true, clinicName: prof.displayName ?? 'our office' }
    }
    if (prof?.announcement) {
      const tz = prof.timezone || 'America/New_York'
      announcement = activeAnnouncement(prof.announcement, clinicDayKey(new Date(), tz))
    }
  }
  if (comingSoon) {
    // Pre-live visitor: the palette still paints (it's the clinic's brand)
    // but NO site chrome — no nav, no chat, no beacon, no announcement.
    return (
      <>
        <TemplateFontLinks fonts={def.fonts} />
        <style>{paletteCss(palette)}</style>
        <ComingSoon {...comingSoon} />
      </>
    )
  }
  return (
    <>
      <TemplateFontLinks fonts={def.fonts} />
      {/* Derived theme — the clinic picks ONE brand color and the whole site
          palette (ground, surface, borders, the deep rhythm-break band, the
          bright strip, every readable ink) is derived from it here, once, as
          CSS custom properties on :root — through the ACTIVE TEMPLATE's
          recipe, so a luxury template can fix its own neutrals while a family
          template derives everything from the brand. Every page + subpage +
          shared chrome reads `var(--c-*)` (identical names across templates)
          so the whole site restyles with the template. Pure + contrast-checked
          (lib/clinic-site-theme.ts + each template's recipe). Components keep
          literal fallbacks in their var() refs, so a surface rendered outside
          this layout still paints. */}
      <style>{paletteCss(palette)}</style>
      <style>{`
        :root {
          ${def.fontCss}
          /* Single source of truth for the sticky site-header height, so
             sticky offsets + scroll-margin (e.g. the FAQ category tabs and
             in-page anchor targets) stay in lockstep with the header — change
             it once here, not per-page. */
          --site-header-h: 64px;
        }
        /* Smooth-scroll only for explicit anchor navigation (e.g. nav
           skip links to #verify, #hours). Honors prefers-reduced-motion
           automatically via UA stylesheet. Scoped to the public clinic
           layout — won't leak into the authenticated dashboard. */
        html { scroll-behavior: smooth; }
        /* Studio-only affordances ("+ Add a photo", "+ Add your services")
           are hidden for every public visitor. This rule MUST live here in
           the always-served layout — the Website Studio's EditBridge, which
           flips them visible via .dc-edit-mode, only mounts for an editing
           owner/admin, so relying on its copy of this rule leaked the
           prompts to real patients on day-0 sites. */
        .dc-edit-only { display: none; }
        /* One focus language for every form field on the site: a visible
           2px brand-strong outline (AA-guaranteed color) with breathing
           room, replacing the browser-default / Tailwind-blue rings. */
        .dc-field:focus-visible {
          outline: 2px solid var(--c-brand-strong, #36514c);
          outline-offset: 2px;
        }
      `}</style>
      {/* Site-wide announcement strip — above the header on every page +
          template, non-sticky so it scrolls away. */}
      <AnnouncementBar announcement={announcement} />
      {children}
      {/* Never count gallery-frame renders as site traffic. */}
      {orgId && !isFrame && <SiteViewBeacon orgId={orgId} slug={slug} />}
      {chatWidget && (
        // Brand through the template's recipe when set (so e.g. a luxury
        // template's accent harmonizes); the historical sage default when the
        // clinic has no brand color yet.
        <SiteChatWidget
          slug={slug}
          brand={brand ? palette.brand : '#9CAF9F'}
          clinicName={chatWidget.clinicName}
        />
      )}
      {isPreview && (
        <TemplatePreviewBanner
          slug={slug}
          basePath={await resolveSiteBasePath(slug)}
          label={def.label}
        />
      )}
      {/* Draft overlay pill — only a verified editor with staged edits ever
          gets the overlay, so only they ever see this. Hidden in the Studio
          canvas (its publish bar owns the state there) and in gallery frames. */}
      {hasEditorDraft && !isPreview && !isFrame && <DraftPreviewBanner appUrl={appBaseUrl()} />}
      {!isFrame && <EditBridgeGate canEdit={canEdit} />}
    </>
  )
}
