import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import { DEFAULT_SERVICES, type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
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

const RE_ASSURANCES: Array<{
  title: string
  body: string
  icon: React.ReactNode
}> = [
  {
    title: 'Same-week visits',
    body: 'Most new patients are scheduled within 3–5 days.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: 'No judgment, ever',
    body: 'However long it’s been, you’re welcome. We meet you where you are.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    title: 'We’ll explain everything',
    body: 'No surprises. Treatment, options, and cost — in plain language.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    title: 'Easy to reschedule',
    body: 'Life happens. Move or cancel without hassle — we’ll text a reminder.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
]

export default async function BookPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  if (!isPro) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0
  const signIn = `${appBaseUrl()}/signin`
  // On the /book page itself, the Book CTA in the nav links should also
  // route to /book (we're already here, but the nav should remain consistent
  // across the rest of the site).
  const bookHref = `${basePath}/book`
  const bookLabel = 'Book a Visit'

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
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

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="pt-14 sm:pt-20 pb-10 sm:pb-14">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8 text-center">
            <ScrollReveal>
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
                style={{ color: brand }}
              >
                Book a visit
              </p>
              <h1
                className="text-[40px] sm:text-[56px] lg:text-[68px] font-semibold leading-[1.04] tracking-[-0.02em] mb-6"
                style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Let&rsquo;s get you on the schedule.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p
                className="text-lg sm:text-xl leading-[1.55] mx-auto max-w-[600px]"
                style={{ color: INK_MUTED }}
              >
                Pick a time that works. Most patients are seen the same week — and
                it&rsquo;s a calm, welcoming visit from the moment you arrive.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── 2-col main: reassurance left, form right ─────────────────── */}
        <section className="pb-20 sm:pb-28">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
              {/* Reassurance column */}
              <ScrollReveal as="div" className="lg:col-span-5 order-2 lg:order-1">
                <div className="lg:sticky lg:top-32">
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                    style={{ color: brand }}
                  >
                    What to expect
                  </p>
                  <h2
                    className="text-2xl sm:text-3xl font-semibold leading-[1.15] tracking-[-0.015em] mb-7"
                    style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  >
                    A calm, welcoming visit.
                  </h2>
                  <ul className="space-y-5">
                    {RE_ASSURANCES.map((r, i) => (
                      <ScrollReveal
                        as="li"
                        key={i}
                        delay={i * 90}
                        className="flex gap-4"
                        style={{ listStyle: 'none' }}
                      >
                        <span
                          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${brand}1A`, color: brand }}
                        >
                          {r.icon}
                        </span>
                        <div>
                          <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>
                            {r.title}
                          </h3>
                          <p className="text-sm leading-[1.55]" style={{ color: INK_MUTED }}>
                            {r.body}
                          </p>
                        </div>
                      </ScrollReveal>
                    ))}
                  </ul>

                  {data.profile.phone && (
                    <div
                      className="mt-8 rounded-2xl p-5 text-sm"
                      style={{
                        backgroundColor: SURFACE,
                        border: `1px solid ${BORDER}`,
                        color: INK_MUTED,
                      }}
                    >
                      Prefer to talk to a person? Call us at{' '}
                      <a
                        href={`tel:${data.profile.phone}`}
                        className="font-semibold hover:underline"
                        style={{ color: INK }}
                      >
                        {data.profile.phone}
                      </a>
                      .
                    </div>
                  )}
                </div>
              </ScrollReveal>

              {/* Form column */}
              <ScrollReveal
                delay={120}
                className="lg:col-span-7 order-1 lg:order-2"
              >
                <div
                  className="rounded-3xl p-6 sm:p-9 shadow-sm"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <BookForm
                    orgId={data.orgId}
                    brand={brand}
                    clinicName={name}
                    services={(data.profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES}
                  />
                </div>
                <p className="text-center mt-5 text-xs" style={{ color: INK_MUTED }}>
                  By booking, you agree to a reminder email. We&rsquo;ll never share
                  your details.
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>

        <ClosingCTA
          heading="It’s a pleasure to care for you."
          subhead="See you soon — and don’t hesitate to reach out if you have any questions before your visit."
          primary={{ label: 'See our services', href: `${basePath}/services` }}
          secondary={
            data.profile.phone
              ? { label: data.profile.phone, href: `tel:${data.profile.phone}` }
              : undefined
          }
          brand={brand}
        />
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
