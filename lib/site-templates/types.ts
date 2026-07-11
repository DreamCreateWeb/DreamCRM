import type { ComponentType } from 'react'
import type { ClinicPalette } from '@/lib/clinic-site-theme'
import type { HomePageProps, SiteChromeProps, SiteChromeMobileProps } from './page-props'

/**
 * The site-template system: every clinic public site renders from ONE
 * universal content canon (clinic_profile + cross-module content) through the
 * template selected on `clinic_profile.template`. Templates are pure
 * presentation — page shells in `app/site/[slug]/**` own every DB read, SEO
 * surface, and gating decision, then dispatch typed props to the active
 * template's renderers. Because content never belongs to a template, switching
 * is instant and reversible.
 *
 * Adding a template = a def here + components under
 * `components/clinic-site/templates/<id>/` + a manifest entry. The conformance
 * harness (tests/site-templates/) auto-enrolls every registered template.
 */
export type SiteTemplateId = 'modern' | 'cosmetic'

/** Content-driven visibility gates, computed once per request by the page
 *  shells and threaded to nav/sitemap/renderers so no template can link to a
 *  page that would 404 or render empty. */
export interface SiteGates {
  hasBlog: boolean
  hasTeam: boolean
  hasCareers: boolean
  hasDentalPlans: boolean
  /** planTier is pro/premium — gates /book and the booking CTA target. */
  isPro: boolean
  /** Live slot-picker booking vs request-only form. */
  selfBooking: boolean
}

/** A stylesheet the template needs, loaded via runtime <link> (NEVER
 *  next/font — the build env can't reach Google Fonts; see PR #166). */
export interface TemplateFontLink {
  /** DOM id for the non-render-blocking media=print promotion script. */
  id: string
  href: string
}

/** An extra marketing page a template declares beyond the shared IA (e.g.
 *  /smile-gallery). Functional pages (/book /intake /shop …) are fixed on
 *  every template and can never be declared away. */
export interface TemplateMarketingPage {
  /** Site-relative path, e.g. '/smile-gallery'. */
  path: string
  /** Label for nav, the Studio page navigator, and the sitemap. */
  label: string
  /** Which nav dropdown the page joins. */
  navGroup?: 'about' | 'patients' | 'top'
  /** Visibility gate; omitted = always visible. */
  gate?: (g: SiteGates) => boolean
}

/** A `copy:*` override region a template instruments beyond the base set —
 *  same shape as the AI bar's COPY_KEYS entries so the Studio + AI editor can
 *  target it (tests/studio/field-wiring.test.ts enforces coverage). */
export interface TemplateCopyKey {
  key: string
  label: string
  fallback: string
  page: string
}

export interface SiteTemplateDef {
  id: SiteTemplateId
  label: string
  /** One-liner shown on the Studio design picker card. */
  description: string
  /** The chrome every page wears — shared page shells render these through
   *  the site-chrome dispatchers, so a template's header/footer follows the
   *  visitor across ALL pages (including shared base pages it never
   *  overrode). */
  chrome: {
    Header: ComponentType<SiteChromeProps>
    Footer: ComponentType<SiteChromeProps>
    MobileActions: ComponentType<SiteChromeMobileProps>
  }
  pages: {
    Home: ComponentType<HomePageProps>
    // Optional per-page renderer overrides land as templates need them — an
    // absent slot falls back to the shared base renderer restyled by this
    // template's palette/fonts/chrome.
  }
  /** Extra template-declared marketing pages ([] for most templates). */
  extraMarketingPages: TemplateMarketingPage[]
  /** The template's palette recipe. MUST return all ClinicPalette roles — the
   *  emitted CSS var names are identical across templates so shared widgets
   *  and base pages restyle automatically. The clinic's one brandColor is the
   *  only input; how much it drives (whole scheme vs accent-only) is the
   *  recipe's choice. */
  buildPalette: (brandHex: string | null | undefined) => ClinicPalette
  fonts: TemplateFontLink[]
  /** CSS custom-property declarations for the layout's :root block, e.g.
   *  `--font-display: 'Fraunces', Georgia, serif;`. */
  fontCss: string
  /** Booking CTA voice — 'Book a Visit' (family) vs 'Book a Consultation'
   *  (luxury). Threaded to chrome + renderers via page props. */
  bookLabel: string
  /** Template-specific copy regions beyond the base COPY_KEYS set. */
  copyKeys: TemplateCopyKey[]
  /** Template-voice defaults for BASE copy keys (key → default text). Clinic
   *  copyOverrides always win, so a clinic's hand edits survive template
   *  switches wherever keys match. */
  copyDefaults: Record<string, string>
}
