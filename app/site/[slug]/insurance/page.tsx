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
import type { ClinicService, ClinicStaff, ClinicFaqItem } from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import InsuranceVerifierForm from '@/components/clinic-site/insurance-verifier-form'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
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
  const url = `${publicSiteUrl(data)}/insurance`
  const title = `Insurance — ${name}`
  const description = `Dental insurance accepted at ${name}. Verify your plan and learn how we handle in-network vs out-of-network benefits.`
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
  const brand = profile.brandColor ?? '#9CAF9F'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const bookLabel = 'Book a Visit'
  const signIn = `${appBaseUrl()}/signin`

  const services = (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES

  const navLinks = buildClinicNavLinks({
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
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
            >
              Patients · Insurance
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: brand,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
            >
              Insurance at {name}.
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
            >
              We want care to be easy to use — so we verify your benefits up
              front, file the claim for you, and answer every &ldquo;wait, what
              did my plan say?&rdquo; question along the way.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: brand }}
              >
                {bookLabel}
              </a>
              <a
                href="#verify"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-white transition hover:shadow-sm"
                style={{ color: INK, borderColor: BORDER }}
              >
                Check your insurance
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        {/* ── "We're here to help" 4-bullet grid ─────────────────────────── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                We&apos;re here to help
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: brand,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
              >
                Benefits, on your side.
              </h2>
            </ScrollReveal>
            <ul className="grid sm:grid-cols-2 gap-5 sm:gap-7">
              {HELP_BULLETS.map((b, i) => (
                <ScrollReveal
                  as="li"
                  key={b.title}
                  delay={(i % 2) * 100}
                  className="rounded-2xl p-6 sm:p-7 transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, listStyle: 'none' }}
                >
                  <div
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-4"
                    style={{ backgroundColor: `${brand}1F`, color: brand }}
                  >
                    <svg
                      className="w-5 h-5"
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
                  </div>
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                  >
                    {b.title}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6]"
                    style={{ color: INK_MUTED }}
                  >
                    {b.body}
                  </p>
                </ScrollReveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Carriers + verifier — forest-teal band (matches homepage) ──── */}
        <section
          className="py-14 sm:py-24"
          style={{ backgroundColor: '#36514c', color: '#FAF7F2' }}
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="text-center max-w-[700px] mx-auto mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
              >
                Insurance
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: '#FAF7F2',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
              >
                Carriers we accept
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55]"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                We work with most major PPO carriers. Not sure if your plan is
                covered? Drop us your info below and we will verify before your
                visit.
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
              {/* Left: carriers */}
              <div>
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: '#FAF7F2',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                >
                  Our insurance carriers
                </h3>
                {insuranceCarriers.length > 0 ? (
                  <>
                    <p
                      className="text-sm sm:text-base leading-[1.55] mb-5"
                      style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                    >
                      We are happy to accept most major PPO dental insurance
                      plans, including (but not limited to):
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                      {insuranceCarriers.map((carrier) => (
                        <li
                          key={carrier}
                          className="flex items-start gap-2.5 text-[15px] leading-snug"
                          style={{ color: '#FAF7F2' }}
                        >
                          <svg
                            className="w-5 h-5 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                          <span>{carrier}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p
                    className="text-base leading-[1.55]"
                    style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                  >
                    Call us to verify your specific plan — we work with most
                    major PPO carriers.
                  </p>
                )}
              </div>

              {/* Right: verifier form */}
              <div id="verify" className="scroll-mt-24">
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: '#FAF7F2',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                >
                  Check your insurance
                </h3>
                <p
                  className="text-sm sm:text-base leading-[1.55] mb-5"
                  style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                >
                  Curious if your insurance will cover your exam? Drop us a
                  note and we will get back to you within one business day.
                </p>
                <InsuranceVerifierForm
                  orgId={data.orgId}
                  brand={brand}
                  carriers={insuranceCarriers.length > 0 ? insuranceCarriers : null}
                  services={services.length > 0 ? services.map((s) => s.name) : null}
                />
              </div>
            </div>
            {/* Logo marquee — same pattern as the homepage Insurance section. */}
            {insuranceCarriers.length > 0 && (
              <div className="mt-14 sm:mt-20 -mx-5 sm:-mx-8" style={{ overflowX: 'clip' }}>
                <div
                  className="flex gap-4 sm:gap-5 ins-marquee-track px-5 sm:px-8"
                  style={{ width: 'max-content' }}
                >
                  {[...insuranceCarriers, ...insuranceCarriers].map((carrier, i) => (
                    <div
                      key={`${carrier}-${i}`}
                      className="shrink-0 bg-white rounded-2xl px-7 py-5 flex items-center justify-center w-[220px] h-[88px]"
                      style={{ borderTop: `3px solid ${brand}` }}
                      aria-hidden={i >= insuranceCarriers.length ? 'true' : undefined}
                    >
                      <span
                        className="text-[15px] font-semibold tracking-tight text-center leading-tight"
                        style={{
                          color: '#1C1A17',
                          fontFamily: 'var(--font-display, Georgia, serif)',
                        }}
                      >
                        {carrier}
                      </span>
                    </div>
                  ))}
                </div>
                <style>{`
                  @keyframes ins-marquee-kf {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                  }
                  .ins-marquee-track {
                    animation: ins-marquee-kf ${Math.max(35, insuranceCarriers.length * 4)}s linear infinite;
                    will-change: transform;
                  }
                  .ins-marquee-track:hover { animation-play-state: paused; }
                  @media (prefers-reduced-motion: reduce) {
                    .ins-marquee-track {
                      animation: none;
                      flex-wrap: wrap;
                      width: 100% !important;
                      justify-content: center;
                    }
                  }
                `}</style>
              </div>
            )}
          </div>
        </section>

        {/* ── Insurance process — In-network vs Out-of-network ─────────── */}
        <section className="py-14 sm:py-24">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[700px] mb-14">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: brand }}
              >
                How it works
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: brand,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
              >
                The insurance process at {name}.
              </h2>
            </ScrollReveal>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
              {/* In-network */}
              <ScrollReveal>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: INK_MUTED }}
                >
                  If we&apos;re in-network with your plan
                </p>
                <NumberedSteps steps={IN_NETWORK_STEPS} brand={brand} columns={1} />
              </ScrollReveal>
              {/* Out-of-network */}
              <ScrollReveal delay={120}>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: INK_MUTED }}
                >
                  If we&apos;re out-of-network
                </p>
                <NumberedSteps steps={OUT_OF_NETWORK_STEPS} brand={brand} columns={1} />
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ── "No dental insurance?" → /dental-plans (gated) ─────────────── */}
        {hasDentalPlans && (
          <section
            className="py-16 sm:py-20"
            style={{ backgroundColor: '#36514c', color: '#FAF7F2' }}
          >
            <div className="max-w-[900px] mx-auto px-5 sm:px-8 text-center">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
              >
                No dental insurance?
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: '#FAF7F2',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
              >
                Our in-house dental plan covers preventive care.
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55] mb-7 max-w-[640px] mx-auto"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                No deductibles, no claim forms, no waiting periods. Join the
                {name === data.orgName ? '' : ''} membership plan to keep your
                routine care covered and save on any other treatment.
              </p>
              <a
                href={`${basePath}/dental-plans`}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: '#FFFFFF', color: INK }}
              >
                See our dental plans
                <span aria-hidden="true" className="ml-2">→</span>
              </a>
            </div>
          </section>
        )}

        {/* ── HSA/FSA + final-bill explainer ──────────────────────────── */}
        <section className="py-14 sm:py-24" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: brand }}
                >
                  HSA & FSA
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{
                    color: brand,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                >
                  Use your HSA or FSA dollars here.
                </h2>
                <p
                  className="text-[16px] leading-[1.65]"
                  style={{ color: INK_MUTED }}
                >
                  We accept HSA and FSA cards for eligible dental care. Most
                  treatment we provide qualifies (preventive, restorative,
                  orthodontic). Cosmetic treatments like whitening typically do
                  not qualify — we will let you know either way before billing.
                </p>
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: brand }}
                >
                  The final bill
                </p>
                <h2
                  className="text-2xl sm:text-3xl lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{
                    color: brand,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                >
                  No silent surprises.
                </h2>
                <p
                  className="text-[16px] leading-[1.65]"
                  style={{ color: INK_MUTED }}
                >
                  We verify your benefits and walk you through a clear estimate
                  before any treatment begins. After the visit, your insurance
                  pays its portion, and any remaining patient balance is billed
                  through your portal. You will never see a charge you have not
                  already been told about.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ accordion ──────────────────────────────────────────────── */}
        <section className="py-16 sm:py-24">
          <div className="max-w-[820px] mx-auto px-5 sm:px-8">
            <ScrollReveal>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-10 sm:mb-12 text-center"
                style={{
                  color: brand,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
              >
                Insurance questions, answered.
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {insuranceFaq.map((item, i) => (
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
        </section>

        <ClosingCTA
          heading="Have more questions?"
          subhead="Call us, book a visit, or message us through the portal — we’ll walk you through anything insurance-shaped."
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
