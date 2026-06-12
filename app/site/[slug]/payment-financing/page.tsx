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
  ClinicFaqItem,
  ClinicFinancingPartner,
} from '@/lib/types/clinic-content'
import {
  DEFAULT_PAYMENT_METHODS,
} from '@/lib/types/clinic-content'
import { CLINIC_THEME, readableInk } from '@/lib/clinic-site-theme'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  copyOverride,
  resolveCopyList,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

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
  const financingPartners = Array.isArray(profile.financingPartners)
    ? (profile.financingPartners as ClinicFinancingPartner[]).filter(
        (p) => p && typeof p.name === 'string' && p.name.trim().length > 0,
      )
    : []

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
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
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[820px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:paymentFinancing.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.heroEyebrow', 'Patients · Payment & Financing')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:paymentFinancing.heroTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.heroTitle', `Payment options at ${name}.`)}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
            >
              We want great care to feel easy to pay for. Here is exactly how
              billing works at our office — no silent surprises, no marketing
              math.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
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
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── How patients pay — universal explainer (no marketing pitch) ── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <NumberedSteps
              steps={howSteps}
              brand={brand}
              columns={3}
              eyebrow={copyOverride(copyOverrides, 'paymentFinancing.how.eyebrow', 'How it works')}
              heading={copyOverride(copyOverrides, 'paymentFinancing.how.heading', 'Honest billing, every visit.')}
              surface="bg"
              editKeyPrefix="paymentFinancing.how"
            />
          </div>
        </section>

        {/* ── Payment methods — pill grid ─────────────────────────────────── */}
        <section
          className="py-14 sm:py-20"
          data-edit-field="paymentFinancing"
          data-edit-kind="modal"
          data-edit-label="payment & financing"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-10">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:paymentFinancing.methodsEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.methodsEyebrow', 'Payment methods')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:paymentFinancing.methodsHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.methodsHeading', 'We accept the way you want to pay.')}
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {paymentMethods.map((method, i) => (
                <ScrollReveal
                  as="li"
                  key={method}
                  delay={(i % 4) * 60}
                  className="flex items-center gap-3 rounded-2xl px-5 py-4 transition hover:shadow-sm"
                  style={{
                    backgroundColor: SURFACE,
                    border: `1px solid ${BORDER}`,
                    listStyle: 'none',
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                    style={{ backgroundColor: `${brand}1F`, color: headingInk }}
                  >
                    <svg
                      className="w-4.5 h-4.5"
                      width={18}
                      height={18}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </span>
                  <span
                    className="text-[15px] sm:text-base font-medium"
                    style={{ color: INK }}
                  >
                    {method}
                  </span>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── HSA & FSA — full-width band ──────────────────────────────────── */}
        <section
          className="py-14 sm:py-20"
          style={{ backgroundColor: '#36514c', color: '#FAF7F2' }}
        >
          <div className="max-w-[900px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: 'rgba(250, 247, 242, 0.7)' }}
              data-edit-field="copy:paymentFinancing.hsaEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.hsaEyebrow', 'HSA & FSA')}
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
              style={{
                color: '#FAF7F2',
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:paymentFinancing.hsaHeading"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'paymentFinancing.hsaHeading', 'Use your tax-advantaged dollars here.')}
            </h2>
            <p
              className="text-base sm:text-lg leading-[1.65] max-w-[700px] mx-auto"
              style={{ color: 'rgba(255, 255, 255, 0.85)' }}
              data-edit-field="copy:paymentFinancing.hsaBody"
              data-edit-kind="text"
              data-edit-label="text"
            >
              {copyOverride(
                copyOverrides,
                'paymentFinancing.hsaBody',
                'Most dental care is HSA / FSA eligible — including cleanings, fillings, crowns, root canals, and orthodontics. Cosmetic treatments like whitening typically do not qualify. Bring your HSA / FSA card to your visit, or pay another way and submit the itemized receipt to your administrator.',
              )}
            </p>
          </div>
        </section>

        {/* ── Financing partners (only when set) ───────────────────────── */}
        {financingPartners.length > 0 && (
          <section className="py-14 sm:py-24">
            <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
              <ScrollReveal className="max-w-[640px] mb-12">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: headingInk }}
                  data-edit-field="copy:paymentFinancing.financingEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.financingEyebrow', 'Financing')}
                </p>
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:paymentFinancing.financingHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.financingHeading', 'Financing options we partner with.')}
                </h2>
                <p
                  className="text-base leading-[1.6]"
                  style={{ color: INK_MUTED }}
                >
                  For larger treatment plans, our financing partners can help
                  you spread payments over time with terms that work for your
                  budget.
                </p>
              </ScrollReveal>
              <div className="grid gap-5 sm:gap-6 sm:grid-cols-2">
                {financingPartners.map((p, i) => (
                  <ScrollReveal
                    as="div"
                    key={p.id}
                    delay={(i % 2) * 110}
                    className="rounded-2xl p-6 sm:p-7 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                    style={{
                      backgroundColor: SURFACE,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    {p.logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.logoUrl}
                        alt={p.name}
                        className="h-10 w-auto object-contain mb-5 self-start"
                        width={160}
                        height={40}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span
                        className="text-2xl font-bold mb-4 self-start"
                        style={{
                          color: headingInk,
                          fontFamily: 'var(--font-display, Georgia, serif)',
                        }}
                      >
                        {p.name}
                      </span>
                    )}
                    <h3
                      className="text-lg font-semibold mb-2 leading-tight"
                      style={{ color: INK }}
                    >
                      {p.name}
                    </h3>
                    {p.description && (
                      <p
                        className="text-[15px] leading-[1.6] mb-5"
                        style={{ color: INK_MUTED }}
                      >
                        {p.description}
                      </p>
                    )}
                    {p.applyUrl && (
                      <a
                        href={p.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold mt-auto self-start transition-all duration-300 hover:gap-2"
                        style={{ color: headingInk }}
                      >
                        Learn more
                        <span aria-hidden="true">→</span>
                      </a>
                    )}
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Cancellation policy (only when set) ─────────────────────── */}
        {cancellationPolicy && (
          <section
            className="py-16 sm:py-20"
            style={{ backgroundColor: SURFACE }}
            data-edit-field="paymentFinancing"
            data-edit-kind="modal"
            data-edit-label="cancellation policy"
          >
            <div className="max-w-[820px] mx-auto px-5 sm:px-8">
              <div className="mb-7">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
                  style={{ color: headingInk }}
                  data-edit-field="copy:paymentFinancing.cancelEyebrow"
                  data-edit-kind="text"
                  data-edit-label="eyebrow"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.cancelEyebrow', 'Cancellations & no-shows')}
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em]"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:paymentFinancing.cancelHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'paymentFinancing.cancelHeading', 'Our cancellation policy.')}
                </h2>
              </div>
              <div
                className="rounded-2xl p-6 sm:p-8"
                style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
              >
                <p
                  className="text-[16px] leading-[1.7] whitespace-pre-wrap"
                  style={{ color: INK }}
                >
                  {cancellationPolicy}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── FAQ accordion ──────────────────────────────────────────────── */}
        <section
          className="py-16 sm:py-24"
          data-edit-field="faq"
          data-edit-kind="modal"
          data-edit-label="FAQ"
        >
          <div className="max-w-[820px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-10 sm:mb-12 text-center"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:paymentFinancing.faqHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'paymentFinancing.faqHeading', 'Billing questions, answered.')}
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {billingFaq.map((item, i) => (
                <ScrollReveal as="div" key={item.id} delay={i * 45}>
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
                        style={{ color: headingInk }}
                      >
                        +
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 mt-0.5 text-2xl leading-none font-light hidden group-open:inline"
                        style={{ color: headingInk }}
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
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'paymentFinancing.cta.heading', 'Questions about your bill?')}
          subhead={copyOverride(copyOverrides, 'paymentFinancing.cta.subhead', 'Reach out — we’ll walk you through anything that doesn’t look right.')}
          editKeyPrefix="paymentFinancing.cta"
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
