import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { getClinicThemeBySlug } from '@/lib/services/clinic-site'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { clinicPaletteCss } from '@/lib/clinic-site-theme'
import EditBridgeGate from '@/components/clinic-site/edit-bridge-gate'
import SiteViewBeacon from '@/components/clinic-site/site-view-beacon'
import SiteChatWidget from '@/components/clinic-site/site-chat-widget'

const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Site-wide layout for clinic public pages (/site/[slug]/...). Loads the
 * Fraunces serif used for display headings (hero H1 + section H2s) via a
 * standard <link> tag rather than `next/font/google`.
 *
 * It also mounts:
 *  - the Website Studio EditBridge (gated to owner/admin + the `?edit=1` flag)
 *    so the canvas stays editable as the clinic navigates their own pages;
 *  - the site-wide SiteViewBeacon — a fire-and-forget pageview counter so the
 *    clinic can finally see how many people visit their site (the only proxy
 *    before was GSC clicks: search-only, ~2-day lag).
 *
 * Why the link approach (not next/font): `next/font/google` fetches font files
 * at BUILD TIME and self-hosts them — brittle in build environments without
 * reliable outbound to fonts.googleapis.com, which broke the App Runner
 * CodeBuild pipeline once (PR #166). The <link> defers the fetch to the
 * browser, which always works.
 *
 * Why NON-render-blocking: a normal stylesheet <link> blocks first paint until
 * the CSS downloads — over a slow connection that delays the whole page on a
 * decorative display font. We load it with `media="print"` (which the browser
 * fetches at low priority WITHOUT blocking render) then flip it to `media="all"`
 * on load via a tiny inline onload handler. The Georgia fallback in the
 * template's inline `--font-display` covers the brief swap window, and a
 * <noscript> keeps it working with JS disabled.
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
  const { orgId, brand } = await getClinicThemeBySlug(slug)
  const canEdit = orgId ? await canEditClinic(orgId) : false
  // The "Message us" bubble (site-wide, so it lives here, not per-page).
  // Default ON; Settings → Practice is the off switch.
  let chatWidget: { enabled: boolean; clinicName: string } | null = null
  if (orgId) {
    const [prof] = await db
      .select({ enabled: clinicProfile.chatWidgetEnabled, displayName: clinicProfile.displayName })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, orgId))
      .limit(1)
    if (prof && prof.enabled !== false) {
      chatWidget = { enabled: true, clinicName: prof.displayName ?? 'our office' }
    }
  }
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Non-render-blocking: fetch the stylesheet as `print` (browsers fetch
          it at low priority WITHOUT blocking first paint), then a tiny inline
          script promotes it to `all` once it loads + on its load event. */}
      <link id="dc-fraunces" rel="stylesheet" href={FRAUNCES_HREF} media="print" />
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var l=document.getElementById('dc-fraunces');if(!l)return;function s(){l.media='all'}if(l.sheet){s()}else{l.addEventListener('load',s);l.addEventListener('error',s)}})();",
        }}
      />
      <noscript>
        {/* No JS → load it the normal (blocking) way so the font still applies. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FRAUNCES_HREF} />
      </noscript>
      {/* Derived theme — the clinic picks ONE brand color and the whole site
          palette (ground, surface, borders, the deep rhythm-break band, the
          bright strip, every readable ink) is derived from it here, once, as
          CSS custom properties on :root. Every page + subpage + shared chrome
          reads `var(--c-*)` so the site harmonizes around the brand instead of
          a fixed teal/beige scheme. Pure + contrast-checked (lib/clinic-site-
          theme.ts). Components keep literal fallbacks in their var() refs, so a
          surface rendered outside this layout still paints. */}
      <style>{clinicPaletteCss(brand)}</style>
      <style>{`
        :root {
          --font-display: 'Fraunces', Georgia, serif;
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
      `}</style>
      {children}
      {orgId && <SiteViewBeacon orgId={orgId} slug={slug} />}
      {chatWidget && <SiteChatWidget slug={slug} brand={brand || '#9CAF9F'} clinicName={chatWidget.clinicName} />}
      <EditBridgeGate canEdit={canEdit} />
    </>
  )
}
