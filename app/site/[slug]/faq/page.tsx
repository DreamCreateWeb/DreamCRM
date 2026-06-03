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
import type { ClinicFaqItem, ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import {
  DEFAULT_FAQ_ITEMS,
  DEFAULT_SERVICES,
  FAQ_CATEGORIES,
} from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/faq`
  const title = `FAQ — ${name}`
  const description = `Common questions answered for patients of ${name}.`
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

function categorySlug(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default async function FaqPage({ params }: Props) {
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
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0

  const { profile } = data
  const brand = profile.brandColor ?? '#9CAF9F'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
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
      (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES,
    ),
  })

  const customFaq = profile.faq as ClinicFaqItem[] | null
  const faq: ClinicFaqItem[] = customFaq && customFaq.length > 0 ? customFaq : DEFAULT_FAQ_ITEMS

  // Group by category, preserving order of FAQ_CATEGORIES, then any custom
  // categories that aren't in the default list (clinic-defined extras).
  const grouped = new Map<string, ClinicFaqItem[]>()
  for (const item of faq) {
    const key = item.category || 'Other'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(item)
  }
  const orderedCategories: string[] = [
    ...FAQ_CATEGORIES.filter((c) => grouped.has(c)),
    ...Array.from(grouped.keys()).filter(
      (c) => !FAQ_CATEGORIES.includes(c as (typeof FAQ_CATEGORIES)[number]),
    ),
  ]

  // FAQPage JSON-LD — strong AI-Overview / voice-search signal for YMYL
  // health content (mirrors the BlogPosting FAQ payload pattern). Pulls
  // from the same `faq` list that the page renders, so the schema and the
  // visible content stay in sync.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
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
          >
            Frequently asked
          </p>
          <h1
            className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
            style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Frequently asked questions.
          </h1>
          <p
            className="text-base sm:text-lg leading-[1.6]"
            style={{ color: INK }}
          >
            Everything we get asked, answered. If you don&apos;t see your
            question, just ask — we&apos;re happy to help.
          </p>
        </div>
      </section>

      {/* ── Category tabs ──────────────────────────────────────────────── */}
      <nav
        aria-label="FAQ categories"
        className="sticky top-[68px] z-30 backdrop-blur-md"
        style={{ backgroundColor: `${BG}EE` }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-3">
          <ul
            className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory sm:flex-wrap sm:justify-center sm:overflow-visible"
            style={{ scrollbarWidth: 'none' }}
          >
            {orderedCategories.map((c) => (
              <li key={c} className="snap-start shrink-0">
                <a
                  href={`#category-${categorySlug(c)}`}
                  className="inline-flex items-center px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    color: INK,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {c}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ── Accordion list, grouped ───────────────────────────────────── */}
      <section
        className="py-12 sm:py-16"
        data-edit-field="faq"
        data-edit-kind="modal"
        data-edit-label="FAQ"
      >
        <div className="max-w-[820px] mx-auto px-5 sm:px-8 space-y-14">
          {orderedCategories.map((c) => (
            <div key={c} id={`category-${categorySlug(c)}`} className="scroll-mt-32">
              <ScrollReveal>
                <h2
                  className="text-2xl sm:text-3xl font-semibold leading-[1.1] mb-6"
                  style={{ color: brand, fontFamily: 'var(--font-display, Georgia, serif)' }}
                >
                  {c}
                </h2>
              </ScrollReveal>
              <div className="space-y-3">
                {(grouped.get(c) ?? []).map((item, i) => (
                  <ScrollReveal as="div" key={item.id} delay={i * 40}>
                    <details
                      className="group rounded-2xl border overflow-hidden transition hover:shadow-sm"
                      style={{ backgroundColor: SURFACE, borderColor: BORDER }}
                    >
                      <summary
                        className="cursor-pointer list-none px-6 py-5 text-base sm:text-lg font-semibold leading-snug flex items-start justify-between gap-4"
                        style={{ color: INK }}
                      >
                        <span>{item.question}</span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light group-open:hidden"
                          style={{ color: brand }}
                        >
                          +
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 mt-0.5 text-2xl leading-none font-light hidden group-open:inline"
                          style={{ color: brand }}
                        >
                          −
                        </span>
                      </summary>
                      <div
                        className="px-6 pb-6 -mt-1 text-[15px] sm:text-base leading-[1.65]"
                        style={{ color: INK_MUTED }}
                      >
                        {item.answer}
                      </div>
                    </details>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ClosingCTA
        heading="Still have questions?"
        subhead="We’re happy to talk it through — call us or book a visit and we’ll meet you where you are."
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
