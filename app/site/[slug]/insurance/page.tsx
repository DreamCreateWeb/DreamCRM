import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff, ClinicFaqItem } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'
import { buildClinicNavLinks, navServicesFromClinicServices, resolveCopyList, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/insurance`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).insurance, {
    title: `Insurance — ${name}`,
    description: `Dental insurance accepted at ${name}. Verify your plan and learn how we handle in-network vs out-of-network benefits.`,
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

// Universal fallbacks rendered when a clinic hasn't authored insurance-
// category FAQ items. Warm, anti-shame voice (DESIGN.md) — generic-dental
// enough to ring true at every practice but never invents prices or claims.
const DEFAULT_INSURANCE_FAQ: ClinicFaqItem[] = [
  {
    id: 'ins-default-1',
    category: 'Insurance',
    question: "How do I know if you're in-network with my plan?",
    answer:
      'Send us your carrier and plan name through the form on this page or call us. We will verify your benefits before your visit so there are no surprises at check-in.',
  },
  {
    id: 'ins-default-2',
    category: 'Insurance',
    question: 'What if you are out-of-network with my plan?',
    answer:
      'Many PPO plans still cover a portion of out-of-network care. We will file the claim for you and let you know your estimated patient responsibility before treatment begins.',
  },
  {
    id: 'ins-default-3',
    category: 'Insurance',
    question: 'Do you accept Medicaid or Medicare?',
    answer:
      'Coverage varies by state and plan. Call or message us with your specific plan name and we will let you know what we can do.',
  },
  {
    id: 'ins-default-4',
    category: 'Insurance',
    question: 'What if I do not have dental insurance?',
    answer:
      'No insurance, no problem. We offer transparent self-pay pricing, and many patients save with our in-house membership plan that covers preventive care and includes a discount on other treatment.',
  },
]

// Four universal in-network steps + four out-of-network steps. Honest about
// reimbursement vs direct billing so patients walk in knowing what to expect.
const IN_NETWORK_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'We verify your benefits',
    body:
      'Send us your carrier + plan name when you book. We confirm coverage, deductible status, and remaining benefit dollars before your visit.',
  },
  {
    title: 'You get a clear estimate',
    body:
      'Before any treatment begins we walk you through what your plan covers and what your portion will be. No silent surprises.',
  },
  {
    title: 'We file the claim',
    body:
      'We submit the claim directly to your insurance after your visit. You only pay your patient responsibility at the appointment.',
  },
  {
    title: 'You see the receipt',
    body:
      'Your portal carries every claim status, EOB, and receipt. If anything looks off, tell us — we will fix it with the carrier on your behalf.',
  },
]

const OUT_OF_NETWORK_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'We verify your out-of-network benefits',
    body:
      'Most PPO plans still pay a portion at out-of-network offices. We pull your plan details to see what your reimbursement looks like.',
  },
  {
    title: 'We file the claim for you',
    body:
      'You do not have to fight with paperwork. We submit the claim and supporting documentation directly to your carrier.',
  },
  {
    title: 'You pay our fee at the visit',
    body:
      'Treatment is paid in full at the time of the visit. Your insurance then reimburses you directly — usually inside three weeks.',
  },
  {
    title: 'We answer the follow-up calls',
    body:
      'If your carrier wants more information about the visit, send it our way. We take it from there.',
  },
]

const HELP_BULLETS: Array<{ title: string; body: string }> = [
  {
    title: 'Verification before your visit',
    body:
      'We confirm your benefits, deductible, and remaining annual maximum before you walk in the door.',
  },
  {
    title: 'Claims filing on your behalf',
    body:
      'Whether we are in-network or out-of-network with your plan, we submit the claim so you do not have to.',
  },
  {
    title: 'Plain-language explanations',
    body:
      'EOBs are confusing. Ask us anything about what your plan does or does not cover — we will walk you through it.',
  },
  {
    title: 'Navigating in-network vs out-of-network',
    body:
      'If we are out-of-network, we will tell you what reimbursement to expect and whether it makes sense to switch providers within your plan.',
  },
]

export default async function InsurancePage({ params }: Props) {
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
  const name = profile.displayName ?? data.orgName
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows/glyphs on the
  // warm ground (raw brand stays on backgrounds/tints only).
  const headingInk = readableInk(brand)
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

  const services = (profile.services as ClinicService[] | null) ?? []

  // Card lists resolved through copy-overrides so each card's text is editable.
  const helpBullets = resolveCopyList(copyOverrides, 'insurance.help', HELP_BULLETS)
  const inNetworkSteps = resolveCopyList(copyOverrides, 'insurance.inNet', IN_NETWORK_STEPS)
  const outOfNetworkSteps = resolveCopyList(copyOverrides, 'insurance.outNet', OUT_OF_NETWORK_STEPS)

  const navLinks = buildClinicNavLinks({
    // Template-declared marketing pages (e.g. Pediatric's /coloring), gated
    // inside the builder against the same flags as everything else.
    extraPages: siteTemplate.extraMarketingPages,
    extraGates: {
      hasColoringPages: hasColoringPages(data.profile),
    },
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(services),
  })

  // Insurance carriers — same source as the homepage Insurance section.
  // null/empty → fall back to "call to verify" copy.
  const insuranceCarriers: string[] = Array.isArray(profile.acceptedInsuranceCarriers)
    ? (profile.acceptedInsuranceCarriers as unknown[]).filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      )
    : []

  // Insurance-category FAQ — read from clinic_profile.faq, filter to category.
  // If none, use the universal DEFAULT_INSURANCE_FAQ defined above.
  const allFaq = (profile.faq as ClinicFaqItem[] | null) ?? []
  const insuranceFaqFromClinic = allFaq.filter(
    (item) => (item.category ?? '').toLowerCase() === 'insurance',
  )
  const insuranceFaq =
    insuranceFaqFromClinic.length > 0 ? insuranceFaqFromClinic : DEFAULT_INSURANCE_FAQ

  // FAQPage JSON-LD from the rendered Q&A accordion (real items only — the
  // universal fallbacks are real answers too, so they're eligible).
  const faqLd = faqPageJsonLd(
    insuranceFaq.map((f) => ({ question: f.question, answer: f.answer })),
  )

  const Body = siteTemplate.pages.subpages.insurance
  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {faqLd && (
        <JsonLdScript data={faqLd} />
      )}
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        <Body copyOverrides={copyOverrides} headingInk={headingInk} name={name} bookHref={bookHref} brand={brand} bookLabel={bookLabel} helpBullets={helpBullets} insuranceCarriers={insuranceCarriers} data={data} services={services} profile={profile} inNetworkSteps={inNetworkSteps} outOfNetworkSteps={outOfNetworkSteps} hasDentalPlans={hasDentalPlans} basePath={basePath} insuranceFaq={insuranceFaq} />
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
