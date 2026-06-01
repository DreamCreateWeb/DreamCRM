import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import { DEFAULT_SERVICES, type ClinicService } from '@/lib/types/clinic-content'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import BookForm from './book-form'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/book`
  const title = `Book a Visit — ${name}`
  const description = `Book your appointment online with ${name}. Same-week availability.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  if (!isPro) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const basePath = await resolveSiteBasePath(slug)
  const publishedPosts = await listPublishedPosts(data.orgId, { limit: 1 })
  const hasBlog = publishedPosts.length > 0
  const signIn = `${appBaseUrl()}/signin`
  // On the /book page itself, the Book CTA in the nav links should also
  // route to /book (we're already here, but the nav should remain consistent
  // across the rest of the site).
  const bookHref = `${basePath}/book`
  const bookLabel = 'Book a Visit'

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
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

      <main className="py-16 sm:py-20">
        <div className="max-w-[640px] mx-auto px-5 sm:px-8">
          <div className="mb-10">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              Book a visit
            </p>
            <h1
              className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em] mb-4"
              style={{ color: INK }}
            >
              Let&rsquo;s get you on the schedule.
            </h1>
            <p className="text-lg leading-[1.55]" style={{ color: INK_MUTED }}>
              Pick a time that works. Most patients are seen the same week.
            </p>
          </div>

          <div
            className="rounded-2xl p-7 sm:p-9"
            style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <BookForm
              orgId={data.orgId}
              brand={brand}
              clinicName={name}
              services={(data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES}
            />
          </div>

          <p className="text-center mt-8 text-sm" style={{ color: INK_MUTED }}>
            Rather call?{' '}
            {data.profile.phone ? (
              <a
                href={`tel:${data.profile.phone}`}
                className="font-medium hover:underline"
                style={{ color: INK }}
              >
                {data.profile.phone}
              </a>
            ) : (
              'Contact us directly.'
            )}
          </p>
        </div>
      </main>

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
