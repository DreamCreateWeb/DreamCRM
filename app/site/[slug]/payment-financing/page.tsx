import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type {
  ClinicService,
  ClinicStaff,
  ClinicFaqItem,
  ClinicFinancingPartner,
} from '@/lib/types/clinic-content'
import {
  DEFAULT_PAYMENT_METHODS,
} from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'
import { buildClinicNavLinks, navServicesFromClinicServices, resolveCopyList, hasColoringPages, isSelfBookingEnabled } from '@/lib/clinic-site-helpers'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import JsonLdScript from '@/components/json-ld'
import { resolveFinancingPartners, widgetFontsFromTemplate } from '@/lib/financing-providers'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/payment-financing`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta)['payment-financing'], {
    title: `Payment & Financing — ${name}`,
    description: `Payment methods, HSA / FSA, and financing options at ${name}. Honest billing — no silent surprises.`,
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

// Universal "How it works" steps for the payment band.
const HOW_IT_WORKS_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'You get an estimate upfront',
    body:
      'Before treatment begins, we walk through exactly what your visit will cost and what your insurance covers. You decide before we start.',
  },
  {
    title: 'You pay at the end of the visit',
    body:
      'Your patient portion is due at check-out. We accept most modern payment methods, including HSA and FSA cards for eligible care.',
  },
  {
    title: 'You see every receipt in your portal',
    body:
      'Every itemized receipt, claim status, and statement lives in your patient portal — so there is always a clear record.',
  },
]

// Universal billing-category FAQ fallbacks rendered when a clinic hasn't
// authored Billing FAQ items. Warm voice, no fake numbers.
const DEFAULT_BILLING_FAQ: ClinicFaqItem[] = [
  {
    id: 'bill-default-1',
    category: 'Billing',
    question: 'When do I pay for my visit?',
    answer:
      'Payment is due at the end of your appointment. If you have insurance, we will let you know your patient portion before treatment begins so there are no surprises.',
  },
  {
    id: 'bill-default-2',
    category: 'Billing',
    question: 'Do you offer payment plans?',
    answer:
      'For larger treatment plans we can talk through payment options that work for you. Just ask the front desk — we will walk through what is possible for your situation.',
  },
  {
    id: 'bill-default-3',
    category: 'Billing',
    question: 'Can I use my HSA or FSA card?',
    answer:
      'Yes, for eligible treatment. Most preventive and restorative dental care qualifies; cosmetic procedures like whitening typically do not. We will tell you upfront either way.',
  },
  {
    id: 'bill-default-4',
    category: 'Billing',
    question: 'Will I get a receipt I can submit to my insurance?',
    answer:
      'Yes. After every visit you receive an itemized receipt with all the procedure codes your carrier needs. You can also access every receipt and claim status in your patient portal.',
  },
]

export default async function PaymentFinancingPage({ params }: Props) {
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
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows/glyphs.
  const headingInk = readableInk(brand)
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null
  const howSteps = resolveCopyList(copyOverrides, 'paymentFinancing.how', HOW_IT_WORKS_STEPS)
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)

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
    services: navServicesFromClinicServices(
      (profile.services as ClinicService[] | null) ?? [],
    ),
  })

  // Payment methods — clinic-set list or universal defaults. Null/empty →
  // fall back to DEFAULT_PAYMENT_METHODS so the section never reads empty.
  const storedPaymentMethods = Array.isArray(profile.paymentMethods)
    ? (profile.paymentMethods as unknown[]).filter(
        (m): m is string => typeof m === 'string' && m.trim().length > 0,
      )
    : null
  const paymentMethods =
    storedPaymentMethods && storedPaymentMethods.length > 0
      ? storedPaymentMethods
      : DEFAULT_PAYMENT_METHODS

  // Financing partners — section hides entirely when null/empty. We don't
  // push patients to financing if the clinic has no partner relationship.
  // FINANCING WIDGETS (2026-10-09): the registry fills in each provider's
  // facts (apply link from a slug, the standard line, the button wording);
  // the FIRST partner is the primary and leads the page — with the
  // provider's own widget when the clinic turned it on.
  const financingPartners = resolveFinancingPartners(profile.financingPartners as ClinicFinancingPartner[] | null)
  const primaryWidget = financingPartners[0]?.widget ? financingPartners[0] : null
  // Cherry paints white on its primary colour, so it gets the palette's
  // AA-floored CTA fill rather than the raw brand (a pale sage would wash
  // out), and the template's real font names (the widget cannot inherit).
  const widgetBrand = siteTemplate.buildPalette(brand).brandStrong
  const widgetFonts = widgetFontsFromTemplate(siteTemplate.fontCss)

  // Cancellation policy — section hides when null. No fake dollar fees.
  const cancellationPolicy =
    typeof profile.cancellationPolicy === 'string' && profile.cancellationPolicy.trim().length > 0
      ? profile.cancellationPolicy.trim()
      : null

  // Billing FAQ — read from clinic_profile.faq, filter to category.
  const allFaq = (profile.faq as ClinicFaqItem[] | null) ?? []
  const billingFaqFromClinic = allFaq.filter(
    (item) => (item.category ?? '').toLowerCase() === 'billing',
  )
  const billingFaq =
    billingFaqFromClinic.length > 0 ? billingFaqFromClinic : DEFAULT_BILLING_FAQ

  // FAQPage JSON-LD from the rendered Billing Q&A accordion.
  const faqLd = faqPageJsonLd(
    billingFaq.map((f) => ({ question: f.question, answer: f.answer })),
  )

  const Body = siteTemplate.pages.subpages.financing
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
        <Body copyOverrides={copyOverrides} headingInk={headingInk} name={name} bookHref={bookHref} brand={brand} bookLabel={bookLabel} profile={profile} howSteps={howSteps} paymentMethods={paymentMethods} financingPartners={financingPartners} primaryWidget={primaryWidget} widgetBrand={widgetBrand} widgetFonts={widgetFonts} cancellationPolicy={cancellationPolicy} billingFaq={billingFaq} />
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
