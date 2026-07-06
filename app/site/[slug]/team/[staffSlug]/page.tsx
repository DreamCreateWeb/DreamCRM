import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
  clinicPortalSignInUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type {
  ClinicService,
  ClinicStaff,
} from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { personJsonLd as buildPersonJsonLd, breadcrumbJsonLd } from '@/lib/clinic-site-jsonld'
import {
  staffInitials,
  staffSlug as resolveStaffSlug,
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'


interface Props {
  params: Promise<{ slug: string; staffSlug: string }>
}

/** First word of "Dr. Jane Lee" → "Jane" (strip honorifics so the CTA reads
 *  natural — "Book with Jane" not "Book with Dr."). */
function firstName(fullName: string): string {
  const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms'])
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.toLowerCase()))
  return words[0] ?? fullName
}

async function resolveStaffMember(
  slug: string,
  staffSlug: string,
): Promise<
  | { data: NonNullable<Awaited<ReturnType<typeof getClinicSiteBySlug>>>; staff: ClinicStaff }
  | null
> {
  const data = await getClinicSiteBySlug(slug)
  if (!data) return null
  const staffArr = (data.profile.staff as ClinicStaff[] | null) ?? []
  const target = staffArr.find((s) => resolveStaffSlug(s) === staffSlug.toLowerCase())
  if (!target) return null
  return { data, staff: target }
}

export async function generateMetadata({ params }: Props) {
  const { slug, staffSlug } = await params
  const resolved = await resolveStaffMember(slug, staffSlug)
  if (!resolved) return {}
  const { data, staff } = resolved
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/team/${resolveStaffSlug(staff)}`
  const titleLine = staff.title ? `${staff.name} — ${staff.title} at ${name}` : `${staff.name} at ${name}`
  const description = staff.bio
    ? staff.bio.slice(0, 160)
    : `Meet ${staff.name}${staff.title ? `, ${staff.title}` : ''}, at ${name}.`
  return {
    title: titleLine,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: titleLine,
      description,
      url,
      siteName: name,
      type: 'profile',
      ...(staff.photoUrl
        ? { images: [{ url: staff.photoUrl, alt: staff.name }] }
        : data.profile.heroImageUrl
          ? { images: [{ url: data.profile.heroImageUrl, alt: name }] }
          : {}),
    },
    twitter: {
      card: staff.photoUrl || data.profile.heroImageUrl ? 'summary_large_image' : 'summary',
      title: titleLine,
      description,
      ...(staff.photoUrl ? { images: [staff.photoUrl] } : {}),
    },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function StaffDetailPage({ params }: Props) {
  const { slug, staffSlug } = await params
  const resolved = await resolveStaffMember(slug, staffSlug)
  if (!resolved) notFound()
  const { data, staff } = resolved

  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0

  const { profile } = data
  const clinicName = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const defaultBookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  // Per-staff override beats the page-level default — some clinics route
  // each provider to a specific booking widget URL.
  const bookHref = staff.bookHref?.trim() || defaultBookHref
  const bookLabel = `Book with ${firstName(staff.name)}`
  const pageBookLabel = 'Book a Visit'
  const signIn = clinicPortalSignInUrl(slug)

  const staffArr = (profile.staff as ClinicStaff[] | null) ?? []
  const hasTeam = staffArr.length > 0
  // Other staff for the "more people" grid below — exclude the current one,
  // cap at 3, preserve display order.
  const otherStaff = staffArr
    .filter((s) => resolveStaffSlug(s) !== resolveStaffSlug(staff))
    .slice(0, 3)

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

  const specialties = (staff.specialties ?? []).filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )

  // Person JSON-LD — schema.org/Person worksFor → Dentist (the clinic).
  // Strong people-search signal: lets Google connect "Dr. Jordan Reyes Austin"
  // searches directly to the clinic's staff page. `mainEntityOfPage` + `url`
  // mark this Person as the page's primary entity.
  const siteUrl = publicSiteUrl(data)
  const pageUrl = `${siteUrl}/team/${resolveStaffSlug(staff)}`
  const personJsonLd = buildPersonJsonLd(
    {
      name: staff.name,
      url: pageUrl,
      jobTitle: staff.title ?? null,
      description: staff.bio ?? null,
      image: staff.photoUrl ?? null,
    },
    { name: clinicName, url: siteUrl },
    pageUrl,
  )

  // BreadcrumbList: Home › Team › {name}.
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: siteUrl },
    { name: 'Our Team', url: `${siteUrl}/team` },
    { name: staff.name },
  ])

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={defaultBookHref}
        bookLabel={pageBookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        {/* ── Hero — 2-col on desktop ────────────────────────────────────── */}
        <section
          className="pt-12 pb-16 sm:pt-16 sm:pb-20"
          data-edit-field="staff"
          data-edit-kind="modal"
          data-edit-label="team"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Portrait */}
              <ScrollReveal className="lg:col-span-5 flex justify-center lg:justify-start">
                <div
                  className="relative w-[260px] h-[320px] sm:w-[320px] sm:h-[380px] transition-transform duration-700 hover:scale-[1.02]"
                  style={{
                    borderRadius: '50%',
                    overflow: 'hidden',
                    backgroundColor: BORDER,
                  }}
                >
                  {staff.photoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={staff.photoUrl}
                      alt={staff.name}
                      width={640}
                      height={800}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="w-full h-full object-cover"
                      style={staff.photoPosition ? { objectPosition: staff.photoPosition } : undefined}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-6xl font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                        color: headingInk,
                      }}
                      aria-label={staff.name}
                    >
                      {staffInitials(staff.name)}
                    </div>
                  )}
                </div>
              </ScrollReveal>
              {/* Copy */}
              <ScrollReveal delay={120} className="lg:col-span-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-3" style={{ color: INK_MUTED }}>
                  About · Our team
                </p>
                <a
                  href={`${basePath}/team`}
                  className="inline-flex items-center gap-1 text-sm font-semibold mb-4 transition hover:gap-2"
                  style={{ color: headingInk }}
                >
                  <span aria-hidden="true">←</span> Back to team
                </a>
                <h1
                  className="text-[30px] sm:text-[42px] lg:text-[56px] font-semibold leading-[1.05] tracking-[-0.015em] mb-3"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {staff.name}
                </h1>
                {(staff.title || staff.credentials) && (
                  <p className="text-base sm:text-lg font-medium mb-5" style={{ color: INK_MUTED }}>
                    {[staff.title, staff.credentials].filter(Boolean).join(' · ')}
                  </p>
                )}
                {staff.bio && (
                  <p className="text-base sm:text-lg leading-[1.65] whitespace-pre-wrap mb-7" style={{ color: INK }}>
                    {staff.bio}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={bookHref}
                    className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                    style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
                  >
                    {bookLabel}
                  </a>
                  {profile.phone && (
                    <a
                      href={`tel:${profile.phone}`}
                      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
                      style={{ color: INK, borderColor: BORDER }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: brand }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {profile.phone}
                    </a>
                  )}
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ── Specialties pill list ──────────────────────────────────────── */}
        {specialties.length > 0 && (
          <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
            <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
              <ScrollReveal className="max-w-[640px] mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: headingInk }}>
                  Focus areas
                </p>
                <h2
                  className="text-2xl sm:text-3xl font-semibold leading-[1.1]"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  What {firstName(staff.name)} specializes in.
                </h2>
              </ScrollReveal>
              <ul className="flex flex-wrap gap-2.5">
                {specialties.map((s, i) => (
                  <ScrollReveal
                    as="li"
                    key={i}
                    delay={i * 60}
                    className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold transition hover:shadow-sm"
                    style={{
                      backgroundColor: 'var(--c-surface, #FFFFFF)',
                      color: INK,
                      border: `1px solid ${BORDER}`,
                      listStyle: 'none',
                    }}
                  >
                    {s}
                  </ScrollReveal>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Fun fact ───────────────────────────────────────────────────── */}
        {staff.funFact && (
          <section className="py-16 sm:py-20">
            <div className="max-w-[820px] mx-auto px-5 sm:px-8">
              <ScrollReveal
                className="rounded-2xl p-6 sm:p-10 text-center transition hover:shadow-sm"
                style={{
                  backgroundColor: SURFACE,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: headingInk }}>
                  Outside the office
                </p>
                <p
                  className="text-xl sm:text-2xl font-medium leading-[1.4]"
                  style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  &ldquo;{staff.funFact}&rdquo;
                </p>
              </ScrollReveal>
            </div>
          </section>
        )}

        {/* ── Meet the rest of the team ──────────────────────────────────── */}
        {otherStaff.length > 0 && (
          <section className="py-16 sm:py-24" style={{ backgroundColor: SURFACE }}>
            <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
              <ScrollReveal className="text-center max-w-[640px] mx-auto mb-12 sm:mb-14">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: headingInk }}>
                  Meet the team
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[40px] font-semibold leading-[1.1] tracking-[-0.015em]"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  More people who&rsquo;ll take care of you.
                </h2>
              </ScrollReveal>
              <div className="grid gap-6 sm:gap-8 sm:grid-cols-3">
                {otherStaff.map((s, i) => {
                  const sSlug = resolveStaffSlug(s)
                  return (
                    <ScrollReveal as="div" key={sSlug} delay={i * 90}>
                      <a
                        href={`${basePath}/team/${sSlug}`}
                        className="group flex flex-col items-center text-center"
                      >
                        <div
                          className="w-44 h-52 sm:w-48 sm:h-56 mb-5 overflow-hidden transition-transform duration-500 group-hover:scale-[1.04]"
                          style={{
                            borderRadius: '50%',
                            backgroundColor: BORDER,
                          }}
                        >
                          {s.photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={s.photoUrl}
                              alt={s.name}
                              width={192}
                              height={224}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                              style={s.photoPosition ? { objectPosition: s.photoPosition } : undefined}
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-4xl font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                                color: headingInk,
                              }}
                              aria-label={s.name}
                            >
                              {staffInitials(s.name)}
                            </div>
                          )}
                        </div>
                        <h3
                          className="text-lg font-semibold leading-tight mb-1 transition group-hover:opacity-80"
                          style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                        >
                          {s.name}
                        </h3>
                        {s.title && (
                          <p className="text-sm mb-3" style={{ color: INK_MUTED }}>
                            {s.title}
                          </p>
                        )}
                        <span
                          className="inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 group-hover:gap-2"
                          style={{ color: headingInk }}
                        >
                          More <span aria-hidden="true">→</span>
                        </span>
                      </a>
                    </ScrollReveal>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        <ClosingCTA
          heading="Ready to come see us?"
          subhead={`Book with ${firstName(staff.name)} or another member of our team — same week if you need it.`}
          primary={{ label: bookLabel, href: bookHref }}
          secondary={
            profile.phone
              ? { label: profile.phone, href: `tel:${profile.phone}` }
              : undefined
          }
          brand={brand}
        />
      </main>

      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={defaultBookHref}
        bookLabel={pageBookLabel}
        signInUrl={signIn}
      />

      <SiteMobileActions
        data={data}
        basePath={basePath}
        bookHref={defaultBookHref}
        bookLabel={pageBookLabel}
      />
    </div>
  )
}
