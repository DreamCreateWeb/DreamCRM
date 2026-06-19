import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { getOpenJobs } from '@/lib/services/careers'
import { getShopConfig } from '@/lib/services/shop'
import { listActivePlans } from '@/lib/services/membership'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { dentalPlansJsonLd } from '@/lib/clinic-site-jsonld'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
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
import MembershipJoin from '../membership/membership-join'

/**
 * `/dental-plans` — Tend-style nav copy for what is functionally our
 * membership page. We re-render the same membership-plan content here
 * (rather than `redirect('/membership')`) so the URL stays `/dental-plans`,
 * the canonical metadata lives at /dental-plans, and the Patients nav
 * dropdown lands on a real, indexable page. The membership page
 * (`/membership`) remains the canonical implementation for the Stripe
 * Checkout flow; this route imports its `MembershipJoin` client component
 * directly so there's one source of truth for the join UX.
 *
 * Re-render was picked over redirect because (1) Tend's "Dental Plans"
 * nav language is what patients search for, and a 308 to /membership
 * flickers the URL mid-load; (2) the membership page is a thin shell —
 * lifting the plan-cards + join form into a shared component would have
 * been more refactor than rewriting the chrome here. Membership-module
 * concerns (Stripe checkout, plan CRUD, member dashboards) stay in
 * /shop/memberships + /membership/actions.
 */

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
  const url = `${publicSiteUrl(data)}/dental-plans`
  // Clinic-editable search snippet (Settings → Search appearance), falling back
  // to the derived default. Kept in lockstep with the 'dental-plans' arm of
  // derivedFor() in seo-meta-form.tsx.
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta)['dental-plans'], {
    title: `Dental Plans — ${name}`,
    description: `No insurance? Join the ${name} dental plan — preventive care covered, savings on every treatment, no claims.`,
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

export default async function DentalPlansPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // Same gates as /membership — hide cleanly when membership isn't enabled.
  const config = await getShopConfig(data.orgId)
  if (!config.membershipEnabled) notFound()
  const plans = await listActivePlans(data.orgId)
  if (plans.length === 0) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const [publishedPosts, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    getOpenJobs(data.orgId),
  ])
  const hasBlog = publishedPosts.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows/glyphs.
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  // Offer JSON-LD — each active membership plan as a recurring Offer.
  const plansLd = dentalPlansJsonLd({
    url: `${publicSiteUrl(data)}/dental-plans`,
    clinicName: name,
    plans: plans.map((p) => ({
      name: p.name,
      priceCents: p.priceCents,
      billingInterval: p.billingInterval,
      description: p.description ?? null,
    })),
  })

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    // We just confirmed plans.length > 0 above, so dental-plans IS available.
    hasDentalPlans: true,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(plansLd) }}
      />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:dentalPlans.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'dentalPlans.heroEyebrow', 'Patients · Dental Plans')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:dentalPlans.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'dentalPlans.heroTitle', `Dental plans at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6]"
              style={{ color: INK }}
              data-edit-field="copy:dentalPlans.heroIntro"
              data-edit-kind="text"
              data-edit-label="text"
            >
              {copyOverride(
                copyOverrides,
                'dentalPlans.heroIntro',
                'No insurance? No problem. Our in-house dental plan covers your routine preventive care and gives you a meaningful discount on every other treatment — with no deductibles, no claim forms, and no waiting periods.',
              )}
            </p>
          </div>
        </section>

        {/* ── Plan cards + join form ──────────────────────────────────────── */}
        <section
          className="py-10 sm:py-16"
          style={{ backgroundColor: SURFACE }}
          data-edit-field="dental_plans"
          data-edit-kind="modal"
          data-edit-label="membership plans"
        >
          <div className="max-w-[900px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <MembershipJoin slug={slug} brand={brand} plans={plans} />
            </ScrollReveal>
          </div>
        </section>

        {/* ── Why memberships work — small reassurance band ─────────────── */}
        <section className="py-16 sm:py-20">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:dentalPlans.whyEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'dentalPlans.whyEyebrow', 'Why patients choose this')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:dentalPlans.whyHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'dentalPlans.whyHeading', 'Better than dental insurance, for most people.')}
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-3 gap-5 sm:gap-6">
              {[
                {
                  title: 'No deductibles',
                  body:
                    'Your coverage starts the moment you join. No paying down a deductible before benefits kick in.',
                },
                {
                  title: 'No annual maximums',
                  body:
                    'Insurance caps your benefits each year. Our plan does not — you get the savings on every treatment.',
                },
                {
                  title: 'No claim forms',
                  body:
                    'Pay one annual or monthly fee, then your visits and discounts are applied automatically at check-out.',
                },
              ].map((b, i) => (
                <ScrollReveal
                  as="li"
                  key={b.title}
                  delay={i * 100}
                  className="rounded-2xl p-6 sm:p-7 transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    listStyle: 'none',
                  }}
                >
                  <span
                    className="text-3xl font-bold leading-none tracking-[-0.02em] mb-3 block"
                    style={{
                      color: headingInk,
                      fontFamily: 'var(--font-display, Georgia, serif)',
                    }}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                    data-edit-field={`copy:dentalPlans.why.${i}.title`}
                    data-edit-kind="text"
                    data-edit-label="title"
                  >
                    {copyOverride(copyOverrides, `dentalPlans.why.${i}.title`, b.title)}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6]"
                    style={{ color: INK_MUTED }}
                    data-edit-field={`copy:dentalPlans.why.${i}.body`}
                    data-edit-kind="text"
                    data-edit-label="text"
                  >
                    {copyOverride(copyOverrides, `dentalPlans.why.${i}.body`, b.body)}
                  </p>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'dentalPlans.cta.heading', 'Ready to join?')}
          subhead={copyOverride(copyOverrides, 'dentalPlans.cta.subhead', 'Pick a plan above, or call us with any questions — we’re happy to walk through what coverage looks like for your situation.')}
          editKeyPrefix="dentalPlans.cta"
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
