import ModernTemplate from '@/components/clinic-site/templates/modern/home'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import { buildClinicPalette } from '@/lib/clinic-site-theme'
import type { SiteTemplateDef } from '../types'
import type { HomePageProps } from '../page-props'

/**
 * The original Fraunces stylesheet URL, verbatim from the site layout — the
 * template system must not change what any existing clinic loads.
 */
const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap'

/**
 * Thin adapter: the typed template contract → the existing ModernTemplate
 * props. The 89KB renderer keeps its historical prop shape untouched (and its
 * own tests); new templates implement HomePageProps directly.
 */
function ModernHome(props: HomePageProps) {
  return (
    <ModernTemplate
      data={props.data}
      basePath={props.basePath}
      signInUrl={props.signInUrl}
      hasBlog={props.gates.hasBlog}
      recentPosts={props.recentPosts}
      reviewCount={props.reviewCount}
      hasDentalPlans={props.gates.hasDentalPlans}
      hasCareers={props.gates.hasCareers}
      hasTeam={props.gates.hasTeam}
      featuredGoogleReviews={props.featuredGoogleReviews}
      googleRating={props.googleRating}
    />
  )
}

/**
 * Modern Family/Wellness — the founding template (Tend-inspired), wrapped
 * onto the template contract with zero visual change: same renderer, same
 * palette recipe, same font link.
 */
export const modernTemplate: SiteTemplateDef = {
  id: 'modern',
  label: 'Modern Family',
  description:
    'Warm, welcoming, family-first — cream ground, brand-derived palette, lifestyle photography. The default every clinic starts on.',
  chrome: { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions },
  pages: { Home: ModernHome },
  extraMarketingPages: [],
  buildPalette: buildClinicPalette,
  fonts: [{ id: 'dc-fraunces', href: FRAUNCES_HREF }],
  fontCss: "--font-display: 'Fraunces', Georgia, serif;",
  bookLabel: 'Book a Visit',
  copyKeys: [],
  copyDefaults: {},
}
