import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { BlogPost } from '@/lib/db/schema/clinic'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'
import type { SiteNavLink } from '@/lib/clinic-site-helpers'
import type { SiteGates } from './types'

/**
 * The typed props contract between page SHELLS (`app/site/[slug]/**` — own
 * every DB read, SEO surface, and gate) and template RENDERERS (pure
 * presentation). Types only — `import type` from the server-only clinic-site
 * module is erased at compile time, so templates and client components can
 * import from here freely.
 *
 * One interface per marketing route, mirroring exactly what its shell
 * computes. A template renderer cannot compile while ignoring required data —
 * TypeScript IS the wiring guarantee.
 */

/** Prop shape for the Header/Footer chrome slots. */
export interface SiteChromeProps {
  data: ClinicSiteData
  basePath: string
  navLinks: SiteNavLink[]
  bookHref: string
  bookLabel: string
  signInUrl: string
}

/** The floating mobile actions need no nav; sign-in is optional (legacy). */
export interface SiteChromeMobileProps {
  data: ClinicSiteData
  basePath: string
  bookHref: string
  bookLabel: string
  signInUrl?: string
}

/** Props every page renderer receives. */
export interface SitePageCommonProps {
  data: ClinicSiteData
  /** '' on subdomain/custom-domain hosts, '/site/<slug>' path-based. Prefix
   *  for every internal link. */
  basePath: string
  /** Absolute sign-in URL (relative would 404 under subdomain rewrites). */
  signInUrl: string
  gates: SiteGates
  /** Booking CTA target: `${basePath}/book` (pro+) or `${basePath}#contact`. */
  bookHref: string
  /** The template's booking CTA voice ('Book a Visit' / 'Book a Consultation'). */
  bookLabel: string
}

/** Homepage renderer contract. */
export interface HomePageProps extends SitePageCommonProps {
  /** Up to 3 recent published posts — drives a "from the blog" band; empty
   *  hides it (same gate as `gates.hasBlog`). */
  recentPosts: BlogPost[]
  /** All-time completed review-request count for `dynamic: 'review_count'`
   *  trust stats. */
  reviewCount: number
  /** 4★+ synced Google reviews, pre-shaped for the testimonial surfaces. */
  featuredGoogleReviews: ClinicTestimonial[]
  /** Live synced Google rating; null/zero-count → no badge. */
  googleRating: { average: number | null; count: number } | null
}
