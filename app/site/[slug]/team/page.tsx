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
import { readableInk } from '@/lib/clinic-site-theme'
import { teamItemListJsonLd } from '@/lib/clinic-site-jsonld'
import {
  firstSentence,
  staffInitials,
  staffSlug as resolveStaffSlug,
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
  const url = `${publicSiteUrl(data)}/team`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).team, {
    title: `Our team — ${name}`,
    description: data.profile.about ? firstSentence(data.profile.about) : `Meet the team behind ${name}.`,
  })
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: name,
      type: 'website',
      ...(data.profile.heroImageUrl
        ? { images: [{ url: data.profile.heroImageUrl, alt: name }] }
        : {}),
    },
    twitter: {
      card: data.profile.heroImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(data.profile.heroImageUrl ? { images: [data.profile.heroImageUrl] } : {}),
    },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

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
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []
  const hasTeam = staff.length > 0
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null

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

  // Universal warm intro when the clinic hasn't authored an about paragraph
  // we can pull a first sentence from. Generic enough to fit every practice.
  const heroLead = profile.about
    ? firstSentence(profile.about)
    : `Real people who care about the experience you have at ${name}.`

  // ItemList of Person — the team roster. Only emitted when there's staff.
  const siteUrl = publicSiteUrl(data)
  const teamLd = hasTeam
    ? teamItemListJsonLd(
        staff.map((s) => {
          const sslug = resolveStaffSlug(s)
          return {
            name: s.name,
            jobTitle: s.title ?? null,
            image: s.photoUrl ?? null,
            url: sslug ? `${siteUrl}/team/${sslug}` : null,
          }
        }),
        { name, url: siteUrl },
      )
    : null

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {teamLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(teamLd) }}
        />
      )}
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:team.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'team.heroEyebrow', 'About · Our team')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              data-edit-field="copy:team.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'team.heroTitle', `Meet the team at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6]"
              style={{ color: INK }}
            >
              {heroLead}
            </p>
          </div>
        </section>

        {/* ── Team grid (or empty placeholder) ───────────────────────────── */}
        {hasTeam ? (
          <section
            className="pb-14 sm:pb-24"
            data-edit-field="staff"
            data-edit-kind="modal"
            data-edit-label="team"
          >
            <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
              <div
                className={`grid gap-x-6 gap-y-12 ${
                  staff.length >= 3
                    ? 'sm:grid-cols-2 lg:grid-cols-3'
                    : staff.length === 2
                      ? 'sm:grid-cols-2 max-w-3xl mx-auto'
                      : 'max-w-sm mx-auto'
                }`}
              >
                {staff.map((s, i) => {
                  const personSlug = resolveStaffSlug(s)
                  const detailHref = personSlug
                    ? `${basePath}/team/${personSlug}`
                    : null
                  return (
                    <ScrollReveal as="div" key={s.id} delay={(i % 3) * 100}>
                      <div className="flex flex-col items-center text-center group">
                        {/* Oval portrait — matches the homepage clinical-team band */}
                        <div
                          className="relative w-[200px] h-[240px] sm:w-[220px] sm:h-[260px] mb-5 transition-transform duration-500 group-hover:scale-[1.04]"
                          style={{
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: BORDER,
                          }}
                        >
                          {s.photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={s.photoUrl}
                              alt={s.name}
                              className="w-full h-full object-cover"
                              style={s.photoPosition ? { objectPosition: s.photoPosition } : undefined}
                              width={384}
                              height={448}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-5xl font-bold"
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
                        {s.title && (
                          <p
                            className="text-[13px] font-semibold uppercase tracking-[0.12em] mb-2"
                            style={{ color: INK_MUTED }}
                          >
                            {s.title}
                          </p>
                        )}
                        <h2
                          className="text-2xl sm:text-[28px] font-semibold leading-tight mb-3"
                          style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                        >
                          {s.name}
                        </h2>
                        {detailHref && (
                          <a
                            href={detailHref}
                            className="text-sm font-semibold inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
                            style={{ color: headingInk }}
                          >
                            More <span aria-hidden="true">→</span>
                          </a>
                        )}
                      </div>
                    </ScrollReveal>
                  )
                })}
              </div>
            </div>
          </section>
        ) : (
          /* Empty state — render gracefully rather than 404 so direct nav hits
             don't break. The nav gate hides /team from the dropdown until staff
             exist; this catches the rare direct-link case. */
          <section className="pb-14 sm:pb-24">
            <div className="max-w-[640px] mx-auto px-5 sm:px-8">
              <div
                className="rounded-2xl border border-dashed py-14 text-center"
                style={{ borderColor: BORDER, color: INK_MUTED, backgroundColor: SURFACE }}
              >
                <p className="text-base">
                  Our team page is coming soon. In the meantime, give us a call —
                  we&apos;d love to introduce ourselves.
                </p>
              </div>
            </div>
          </section>
        )}

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'team.cta.heading', 'It’s a pleasure to meet you.')}
          subhead={copyOverride(copyOverrides, 'team.cta.subhead', 'Book with any member of the team — same week is usually possible.')}
          editKeyPrefix="team.cta"
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
