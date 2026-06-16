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
import { ROLE_LABELS, EMPLOYMENT_LABELS, formatComp } from '@/lib/types/careers'
import { type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  copyOverride,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'

const BG = 'var(--c-bg, #FAF7F2)'
const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const SURFACE = 'var(--c-surface, #FFFFFF)'
const BORDER = 'var(--c-border, #E8E2D9)'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).careers, {
    title: `Careers — ${name}`,
    description: `Join the team at ${name}. See our open dental positions and apply today.`,
  })
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

const CULTURE_CALLOUTS: Array<{
  title: string
  body: string
  icon: React.ReactNode
}> = [
  {
    title: 'A team that actually likes each other',
    body:
      'Real lunch breaks, real birthday cakes, real respect. Office days feel like the good days.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: 'Patients we’re proud to care for',
    body:
      'We pace appointments so you can actually listen. No production quotas, no sales scripts.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    title: 'Growth that fits your life',
    body:
      'CE budgets, mentorship, predictable schedules, real PTO. Build a long career, not a burnout story.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
]

export default async function ClinicCareersPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const name = data.profile.displayName ?? data.orgName
  const copyOverrides = (data.profile.copyOverrides as Record<string, string> | null) ?? null
  const [jobs, publishedPosts, membershipPlans] = await Promise.all([
    getOpenJobs(data.orgId),
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  // Careers nav-dropdown gate is "has open jobs" — by construction this page
  // only renders meaningfully when jobs.length > 0, so reuse that. Team gate
  // mirrors the other call sites: clinic has ≥1 staff entry.
  const hasCareers = jobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0
  const cityState = [data.primaryLocation?.city, data.primaryLocation?.state].filter(Boolean).join(', ')

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? [],
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
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="pt-14 sm:pt-20 pb-12 sm:pb-16">
          <div className="max-w-[900px] mx-auto px-5 sm:px-8 text-center">
            <ScrollReveal>
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
                style={{ color: headingInk }}
                data-edit-field="copy:careers.heroEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'careers.heroEyebrow', `Careers · ${name}`)}
              </p>
              <h1
                className="text-[32px] sm:text-[48px] lg:text-[68px] font-semibold leading-[1.04] tracking-[-0.02em] mb-6"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:careers.heroTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'careers.heroTitle', 'Build the dental practice we’d all want to visit.')}
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p
                className="text-lg sm:text-xl leading-[1.55] mx-auto max-w-[640px]"
                style={{ color: INK_MUTED }}
              >
                We&rsquo;re a small team that takes patients seriously and takes
                each other seriously, too. Here&rsquo;s what we&rsquo;re looking
                for right now.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── Why work here ─────────────────────────────────────────────── */}
        <section className="pb-16 sm:pb-24">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {CULTURE_CALLOUTS.map((c, i) => (
                <ScrollReveal
                  key={i}
                  delay={i * 100}
                  className="rounded-2xl p-7 transition-transform duration-300 hover:-translate-y-1"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <span
                    className="inline-flex w-12 h-12 rounded-full items-center justify-center mb-5"
                    style={{ backgroundColor: `${brand}1A`, color: brand }}
                  >
                    {c.icon}
                  </span>
                  <h3
                    className="text-lg font-semibold leading-snug mb-2"
                    style={{ color: INK }}
                  >
                    {c.title}
                  </h3>
                  <p className="text-[15px] leading-[1.6]" style={{ color: INK_MUTED }}>
                    {c.body}
                  </p>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Open positions ────────────────────────────────────────────── */}
        <section
          className="pb-14 sm:pb-24"
          data-edit-field="careers"
          data-edit-kind="modal"
          data-edit-label="job postings"
        >
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="mb-10 text-center">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                Open positions
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                We&rsquo;re hiring for these roles.
              </h2>
            </ScrollReveal>

            {jobs.length === 0 ? (
              <ScrollReveal
                className="rounded-2xl border border-dashed py-20 text-center"
                style={{ borderColor: BORDER, color: INK_MUTED }}
              >
                <p className="text-base">
                  No open positions at the moment — check back soon, or reach out
                  to introduce yourself.
                </p>
              </ScrollReveal>
            ) : (
              <ul className="space-y-4">
                {jobs.map((j, i) => {
                  const comp = formatComp(j)
                  return (
                    <ScrollReveal
                      as="li"
                      key={j.id}
                      delay={i * 70}
                      style={{ listStyle: 'none' }}
                    >
                      <a
                        href={`${basePath}/careers/${j.slug}`}
                        className="group relative block rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md overflow-hidden"
                        style={{
                          backgroundColor: SURFACE,
                          border: `1px solid ${BORDER}`,
                        }}
                      >
                        {/* Left accent bar — grows on hover */}
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5"
                          style={{ backgroundColor: brand }}
                        />
                        <div className="flex items-start justify-between gap-6 pl-3">
                          <div className="min-w-0">
                            <h3
                              className="text-xl sm:text-2xl font-semibold leading-[1.15] tracking-[-0.01em] mb-2 transition-colors"
                              style={{ color: INK }}
                            >
                              {j.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]" style={{ color: INK_MUTED }}>
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold"
                                style={{ backgroundColor: `${brand}1A`, color: headingInk }}
                              >
                                {ROLE_LABELS[j.role]}
                              </span>
                              <span>· {EMPLOYMENT_LABELS[j.employmentType]}</span>
                              {comp && <span>· {comp}</span>}
                              {cityState && <span>· {cityState}</span>}
                            </div>
                          </div>
                          <span
                            className="shrink-0 hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-300 group-hover:gap-3"
                            style={{ backgroundColor: brand, color: '#fff' }}
                          >
                            View &amp; apply
                            <span aria-hidden="true">→</span>
                          </span>
                          <span
                            className="shrink-0 sm:hidden text-2xl leading-none transition-transform duration-300 group-hover:translate-x-1"
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
            )}
          </div>
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'careers.cta.heading', 'Don’t see your role?')}
          subhead={copyOverride(copyOverrides, 'careers.cta.subhead', 'We’re always interested in hearing from kind, thoughtful dental professionals. Send us a note.')}
          editKeyPrefix="careers.cta"
          primary={{
            label: 'Introduce yourself',
            href: `${basePath || '/'}#contact`,
          }}
          secondary={
            data.profile.phone
              ? { label: data.profile.phone, href: `tel:${data.profile.phone}` }
              : undefined
          }
          brand={brand}
          variant="teal"
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
