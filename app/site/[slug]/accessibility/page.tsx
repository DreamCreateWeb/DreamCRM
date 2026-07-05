import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  clinicPortalSignInUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'

const BG = 'var(--c-bg, #FAF7F2)'
const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/accessibility`
  return {
    title: `Accessibility — ${name}`,
    description: `${name}'s commitment to an accessible website for every patient.`,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
  }
}

export default async function AccessibilityPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const signIn = clinicPortalSignInUrl(slug)
  const contactBits = [profile.email, profile.phone].filter(Boolean).join(' or ')

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog: publishedPosts.length > 0,
    hasDentalPlans: membershipPlans.length > 0,
    hasTeam: ((profile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasCareers: openJobs.length > 0,
    services: navServicesFromClinicServices((profile.services as ClinicService[] | null) ?? []),
  })

  // Every claim below is true of this template by construction — the color
  // system is programmatically contrast-checked, motion is gated behind
  // prefers-reduced-motion, and the chrome ships skip links + focus traps +
  // labeled controls. Don't add claims the code doesn't keep.
  const commitments: Array<{ title: string; body: string }> = [
    {
      title: 'Readable color, always',
      body:
        'Every text-and-background pairing on this site is programmatically checked against the WCAG AA contrast standard — including all the colors derived from our brand.',
    },
    {
      title: 'Keyboard friendly',
      body:
        'The site can be navigated with a keyboard: a skip-to-content link, visible focus outlines, and menus and dialogs that keep focus where you are.',
    },
    {
      title: 'Screen-reader labels',
      body:
        'Interactive elements carry text labels for assistive technology, decorative flourishes are hidden from screen readers, and star ratings are announced in words.',
    },
    {
      title: 'Respects reduced motion',
      body:
        'If your device is set to reduce motion, this site honors it — animations and moving content are turned off automatically.',
    },
  ]

  return (
    <div
      className="min-h-screen antialiased"
      style={{ backgroundColor: BG, color: INK, fontFamily: 'var(--font-sans, Inter, sans-serif)' }}
    >
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel="Book a Visit"
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1} className="py-14 sm:py-20">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: INK_MUTED }}
          >
            {name}
          </p>
          <h1
            className="text-[32px] sm:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-3"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Care should be accessible. So should this website.
          </h1>
          <p className="text-base sm:text-lg leading-[1.65] mb-12" style={{ color: INK_MUTED }}>
            We aim for this site to meet WCAG 2.1 AA, and we keep working at it as the site grows.
          </p>

          <ul className="space-y-6 mb-14">
            {commitments.map((c) => (
              <li key={c.title}>
                <h2
                  className="text-lg sm:text-xl font-semibold mb-1.5"
                  style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {c.title}
                </h2>
                <p className="text-[15px] sm:text-base leading-[1.7]" style={{ color: INK }}>
                  {c.body}
                </p>
              </li>
            ))}
          </ul>

          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{ backgroundColor: 'var(--c-surface, #FFFFFF)', border: '1px solid var(--c-border, #E8E2D9)' }}
          >
            <h2
              className="text-lg sm:text-xl font-semibold mb-2"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Hit a barrier? Tell us.
            </h2>
            <p className="text-[15px] sm:text-base leading-[1.7]" style={{ color: INK }}>
              If any part of this site is hard for you to use, we want to know — we&rsquo;ll fix
              what we can and make sure you get the information you need another way in the
              meantime{contactBits ? `. Reach us at ${contactBits}` : ''}.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel="Book a Visit"
        signInUrl={signIn}
      />
    </div>
  )
}
