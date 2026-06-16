import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { appBaseUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from './site-header'
import SiteFooter from './site-footer'
import SiteMobileActions from './site-mobile-actions'

const BG = 'var(--c-bg, #FAF7F2)'
const INK = 'var(--c-ink, #1C1A17)'

/**
 * Shared chrome for blog index + blog post + membership pages. Wraps
 * children in the same `<SiteHeader>` + `<SiteFooter>` + `<SiteMobileActions>`
 * trio every other public subpage uses, so these pages don't feel detached.
 *
 * Loads its own nav-gate data (services / posts / plans / jobs / staff) so
 * the callers stay thin — they just pass `data` + `basePath` + content.
 *
 * Async server component — fine in Next.js App Router; the children prop is
 * still rendered eagerly by the caller.
 */
export default async function BlogChrome({
  data,
  basePath,
  children,
}: {
  data: ClinicSiteData
  basePath: string
  children: React.ReactNode
}) {
  const { profile } = data
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((profile.staff as ClinicStaff[] | null) ?? []).length > 0

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (profile.services as ClinicService[] | null) ?? [],
    ),
  })

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>{children}</main>

      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <SiteMobileActions
        data={data}
        basePath={basePath}
        bookHref={bookHref}
        bookLabel={bookLabel}
      />
    </div>
  )
}
