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
import type {
  ClinicService,
  ClinicStaff,
} from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  staffInitials,
  staffSlug as resolveStaffSlug,
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

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
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const defaultBookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  // Per-staff override beats the page-level default — some clinics route
  // each provider to a specific booking widget URL.
  const bookHref = staff.bookHref?.trim() || defaultBookHref
  const bookLabel = `Book with ${firstName(staff.name)}`
  const pageBookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const staffArr = (profile.staff as ClinicStaff[] | null) ?? []
  const hasTeam = staffArr.length > 0

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
    ),
  })

  const specialties = (staff.specialties ?? []).filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )

  // Person JSON-LD — schema.org/Person worksFor → Dentist (the clinic).
  // Strong people-search signal: lets Google connect "Dr. Jordan Reyes Austin"
  // searches directly to the clinic's staff page.
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: staff.name,
    ...(staff.title ? { jobTitle: staff.title } : {}),
    ...(staff.photoUrl ? { image: staff.photoUrl } : {}),
    ...(staff.bio ? { description: staff.bio } : {}),
    worksFor: {
      '@type': 'Dentist',
      name: clinicName,
      url: publicSiteUrl(data),
    },
  }

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
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={defaultBookHref}
        bookLabel={pageBookLabel}
        signInUrl={signIn}
      />

      <main>
        {/* ── Hero — 2-col on desktop ────────────────────────────────────── */}
        <section className="pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Portrait */}
              <div className="lg:col-span-5 flex justify-center lg:justify-start">
                <div
                  className="relative w-[260px] h-[320px] sm:w-[320px] sm:h-[380px]"
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
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-6xl font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${brand}33 0%, ${brand}1A 100%)`,
                        color: brand,
                      }}
                      aria-label={staff.name}
                    >
                      {staffInitials(staff.name)}
                    </div>
                  )}
                </div>
              </div>
              {/* Copy */}
              <div className="lg:col-span-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-3" style={{ color: INK_MUTED }}>
                  About · Our team
                </p>
                <a
                  href={`${basePath}/team`}
                  className="inline-flex items-center gap-1 text-sm font-semibold mb-4 transition hover:underline"
                  style={{ color: brand }}
                >
                  <span aria-hidden="true">←</span> Back to team
                </a>
                <h1
                  className="text-[36px] sm:text-[48px] lg:text-[56px] font-semibold leading-[1.05] tracking-[-0.015em] mb-3"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
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
                    className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                    style={{ backgroundColor: brand }}
                  >
                    {bookLabel}
                  </a>
                  {profile.phone && (
                    <a
                      href={`tel:${profile.phone}`}
                      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-white transition hover:shadow-sm"
                      style={{ color: INK, borderColor: BORDER }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: brand }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {profile.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Specialties pill list ──────────────────────────────────────── */}
        {specialties.length > 0 && (
          <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
            <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
              <div className="max-w-[640px] mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: brand }}>
                  Focus areas
                </p>
                <h2
                  className="text-2xl sm:text-3xl font-semibold leading-[1.1]"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  What {firstName(staff.name)} specializes in.
                </h2>
              </div>
              <ul className="flex flex-wrap gap-2.5">
                {specialties.map((s, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: INK,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Fun fact ───────────────────────────────────────────────────── */}
        {staff.funFact && (
          <section className="py-16 sm:py-20">
            <div className="max-w-[820px] mx-auto px-5 sm:px-8">
              <div
                className="rounded-2xl p-8 sm:p-10 text-center"
                style={{
                  backgroundColor: SURFACE,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: brand }}>
                  Outside the office
                </p>
                <p
                  className="text-xl sm:text-2xl font-medium leading-[1.4]"
                  style={{ color: INK }}
                >
                  {staff.funFact}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Closing CTA band ───────────────────────────────────────────── */}
        <section
          className="py-20 sm:py-28"
          style={{ backgroundColor: brand }}
        >
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-6 text-white"
              style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Ready to come see us?
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: '#FFFFFF', color: INK }}
              >
                {bookLabel}
              </a>
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium text-white border border-white/40 transition hover:bg-white/10"
                >
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </section>
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
