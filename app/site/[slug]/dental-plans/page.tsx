import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { getOpenJobs } from '@/lib/services/careers'
import { getShopConfig } from '@/lib/services/shop'
import { listActivePlans } from '@/lib/services/membership'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { dentalPlansJsonLd } from '@/lib/clinic-site-jsonld'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { buildClinicNavLinks, navServicesFromClinicServices, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
import { SITE_BG as BG, SITE_INK as INK, SITE_HEADING } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'

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
 * /payments/memberships + /membership/actions.
 */


interface Props {
  params: Promise<{ slug: string }>
  /** The clinic's invite link: `?plan=<id>&email=<address>` pre-selects a plan
   *  and pre-fills the join form. Never submits anything by itself. */
  searchParams?: Promise<{ plan?: string | string[]; email?: string | string[] }>
}

const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ''
// A loose shape check only — the join action still validates; a junk value
// just leaves the field empty (the dead-link law: never an error page).
const PREFILL_EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

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

export default async function DentalPlansPage({ params, searchParams }: Props) {
  const { slug } = await params
  const query = (await searchParams) ?? {}
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // Same gates as /membership — hide cleanly when membership isn't enabled.
  const config = await getShopConfig(data.orgId)
  if (!config.membershipEnabled) notFound()
  const plans = await listActivePlans(data.orgId)
  if (plans.length === 0) notFound()

  // Invite-link prefill. A plan that is not in the ACTIVE list (unknown,
  // draft, archived) selects nothing and the page renders normally.
  const planParam = firstParam(query.plan).trim()
  const invitedPlan = planParam ? plans.find((p) => p.id === planParam) ?? null : null
  const emailParam = firstParam(query.email).trim().slice(0, 254)
  const invitedEmail = PREFILL_EMAIL_RE.test(emailParam) ? emailParam : ''

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
  const headingInk = SITE_HEADING
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

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
    // Template-declared marketing pages (e.g. Pediatric's /coloring), gated
    // inside the builder against the same flags as everything else.
    extraPages: siteTemplate.extraMarketingPages,
    extraGates: {
      hasColoringPages: hasColoringPages(data.profile),
    },
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

  const Body = siteTemplate.pages.subpages.plans
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <JsonLdScript data={plansLd} />
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        <Body copyOverrides={copyOverrides} headingInk={headingInk} name={name} slug={slug} brand={brand} plans={plans} invitedPlan={invitedPlan} invitedEmail={invitedEmail} bookLabel={bookLabel} bookHref={bookHref} profile={profile} />
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
