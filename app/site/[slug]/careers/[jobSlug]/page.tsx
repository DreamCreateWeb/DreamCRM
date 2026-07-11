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
import { getOpenJobBySlug, getOpenJobs } from '@/lib/services/careers'
import { ROLE_LABELS, EMPLOYMENT_LABELS, formatComp, jobPostingJsonLd } from '@/lib/types/careers'
import { breadcrumbJsonLd } from '@/lib/clinic-site-jsonld'
import { type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  hasColoringPages,
} from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import ApplyForm from '../apply-form'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'


interface Props {
  params: Promise<{ slug: string; jobSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug, jobSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const job = await getOpenJobBySlug(data.orgId, jobSlug)
  if (!job) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers/${job.slug}`
  const title = `${job.title} — ${name}`
  // description is .notNull().default('') — a published role can carry a blank
  // description, so fall back to a warm generic line rather than emit an empty
  // meta description.
  const description = job.description.trim()
    ? job.description.slice(0, 180)
    : `Join the team at ${name} — apply for our ${job.title} opening.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

function Section({
  title,
  body,
  delay = 0,
  brand,
}: {
  title: string
  body: string | null
  delay?: number
  brand: string
}) {
  if (!body) return null
  const headingInk = readableInk(brand)
  return (
    <ScrollReveal delay={delay} className="mt-10">
      <h2
        className="text-2xl font-semibold mb-3 tracking-[-0.01em]"
        style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
      >
        {title}
      </h2>
      <p className="text-[16px] leading-[1.7] whitespace-pre-wrap" style={{ color: INK_MUTED }}>
        {body}
      </p>
    </ScrollReveal>
  )
}

export default async function ClinicJobDetailPage({ params }: Props) {
  const { slug, jobSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const job = await getOpenJobBySlug(data.orgId, jobSlug)
  if (!job) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const name = data.profile.displayName ?? data.orgName
  const comp = formatComp(job)
  const loc = data.primaryLocation
  const cityState = [loc?.city, loc?.state].filter(Boolean).join(', ')
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug)

  const navLinks = buildClinicNavLinks({
    // Template-declared marketing pages (e.g. Pediatric's /coloring), gated
    // inside the builder against the same flags as everything else.
    extraPages: siteTemplate.extraMarketingPages,
    extraGates: {
      isPro: data.profile.planTier === 'pro' || data.profile.planTier === 'premium',
      hasColoringPages: hasColoringPages(data.profile),
    },
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? [],
    ),
  })

  // Related openings — other open positions, cap at 3, excluding this one.
  const relatedJobs = openJobs.filter((j) => j.id !== job.id).slice(0, 3)

  const jsonLd = jobPostingJsonLd(job, {
    orgName: name,
    jobUrl: `${publicSiteUrl(data)}/careers/${job.slug}`,
    datePosted: job.postedAt ?? job.createdAt,
    location: loc
      ? {
          streetAddress: loc.addressLine1 ?? undefined,
          addressLocality: loc.city ?? undefined,
          addressRegion: loc.state ?? undefined,
          postalCode: loc.postalCode ?? undefined,
        }
      : null,
  })

  // BreadcrumbList: Home › Careers › {job title}.
  const siteUrl = publicSiteUrl(data)
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: siteUrl },
    { name: 'Careers', url: `${siteUrl}/careers` },
    { name: job.title },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="pt-12 pb-12 sm:pt-16 sm:pb-16">
          <div className="max-w-[860px] mx-auto px-5 sm:px-8">
            <a
              href={`${basePath}/careers`}
              className="inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 hover:gap-2"
              style={{ color: headingInk }}
            >
              <span aria-hidden="true">←</span> All openings
            </a>
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mt-6 mb-3"
              style={{ color: INK_MUTED }}
            >
              Open position · {ROLE_LABELS[job.role]}
            </p>
            <h1
              className="text-[36px] sm:text-[52px] lg:text-[60px] font-semibold leading-[1.04] tracking-[-0.015em] mb-6"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 mb-8">
              <span
                className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[13px] font-semibold"
                style={{ backgroundColor: `${brand}1A`, color: headingInk }}
              >
                {EMPLOYMENT_LABELS[job.employmentType]}
              </span>
              {comp && (
                <span
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[13px] font-semibold"
                  style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
                >
                  {comp}
                </span>
              )}
              {cityState && (
                <span
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium"
                  style={{ backgroundColor: SURFACE, color: INK_MUTED, border: `1px solid ${BORDER}` }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {cityState}
                </span>
              )}
            </div>
            <a
              href="#apply"
              className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
              style={{ backgroundColor: brand }}
            >
              Apply now <span aria-hidden="true" className="ml-2">↓</span>
            </a>
          </div>
        </section>

        {/* ── Body sections ────────────────────────────────────────────── */}
        <section
          className="pb-16 sm:pb-20"
          data-edit-field="careers"
          data-edit-kind="modal"
          data-edit-label="job postings"
        >
          <div className="max-w-[860px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <p
                className="text-[17px] leading-[1.7] whitespace-pre-wrap"
                style={{ color: INK }}
              >
                {job.description}
              </p>
            </ScrollReveal>
            <Section title="Responsibilities" body={job.responsibilities} brand={brand} delay={60} />
            <Section title="Requirements" body={job.requirements} brand={brand} delay={60} />
            <Section title="Benefits &amp; perks" body={job.benefits} brand={brand} delay={60} />
          </div>
        </section>

        {/* ── Apply ────────────────────────────────────────────────────── */}
        <section id="apply" className="scroll-mt-24 py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[760px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="mb-8">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
                style={{ color: headingInk }}
              >
                Apply
              </p>
              <h2
                className="text-3xl sm:text-4xl font-semibold leading-[1.1] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Tell us about yourself.
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <div
                className="rounded-2xl sm:rounded-3xl p-5 sm:p-9 shadow-sm"
                style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
              >
                {job.applyMethod === 'external' && job.externalApplyUrl ? (
                  <div className="text-center py-4">
                    <p className="text-base mb-6" style={{ color: INK_MUTED }}>
                      We process applications for this role on a partner site.
                    </p>
                    <a
                      href={job.externalApplyUrl}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                      style={{ backgroundColor: brand }}
                    >
                      Apply on partner site <span aria-hidden="true" className="ml-2">→</span>
                    </a>
                  </div>
                ) : (
                  <ApplyForm orgId={data.orgId} jobPostingId={job.id} brand={brand} />
                )}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ── Related openings ─────────────────────────────────────────── */}
        {relatedJobs.length > 0 && (
          <section className="py-16 sm:py-24">
            <div className="max-w-[1000px] mx-auto px-5 sm:px-8">
              <ScrollReveal className="mb-10 text-center">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
                  style={{ color: headingInk }}
                >
                  More open positions
                </p>
                <h2
                  className="text-3xl sm:text-4xl font-semibold leading-[1.1] tracking-[-0.015em]"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  Other roles at {name}.
                </h2>
              </ScrollReveal>
              <ul className="space-y-4">
                {relatedJobs.map((rj, i) => {
                  const rjComp = formatComp(rj)
                  return (
                    <ScrollReveal as="li" key={rj.id} delay={i * 70} style={{ listStyle: 'none' }}>
                      <a
                        href={`${basePath}/careers/${rj.slug}`}
                        className="group relative block rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md overflow-hidden"
                        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5"
                          style={{ backgroundColor: brand }}
                        />
                        <div className="flex items-start justify-between gap-4 pl-3">
                          <div className="min-w-0">
                            <h3
                              className="text-lg sm:text-xl font-semibold leading-[1.2] mb-1"
                              style={{ color: INK }}
                            >
                              {rj.title}
                            </h3>
                            <div className="text-[13px]" style={{ color: INK_MUTED }}>
                              {ROLE_LABELS[rj.role]} · {EMPLOYMENT_LABELS[rj.employmentType]}
                              {rjComp ? ` · ${rjComp}` : ''}
                            </div>
                          </div>
                          <span
                            className="shrink-0 text-2xl leading-none transition-transform duration-300 group-hover:translate-x-1"
                            style={{ color: headingInk }}
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </div>
                      </a>
                    </ScrollReveal>
                  )
                })}
              </ul>
            </div>
          </section>
        )}

        <ClosingCTA
          heading="Not quite the right fit?"
          subhead="Send us a note — we’re always interested in hearing from kind, thoughtful dental professionals."
          primary={{ label: 'See all openings', href: `${basePath}/careers` }}
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
