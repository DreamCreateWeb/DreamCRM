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
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff, ClinicFaqItem } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  copyOverride,
  resolveCopyList,
  hasColoringPages,
} from '@/lib/clinic-site-helpers'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { DeepBand } from '@/components/clinic-site/decor'
import NumberedSteps from '@/components/clinic-site/numbered-steps'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'


interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/new-patients`
  const { title, description } = applySeoOverride(
    resolveSeoMeta(data.profile.seoMeta)['new-patients'],
    {
      title: `New Patients — ${name}`,
      description: `Your first visit at ${name}: what to expect, what to bring, and how insurance and payment work. No surprises, no judgment.`,
    },
  )
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

// ── Universal defaults — warm, anti-shame, generic-dental-honest (DESIGN.md).
// Never invents prices, durations that could mislead, or clinical claims a
// specific office might not honor. Every string is clinic-editable in place.

const EXPECT_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Book a time that fits',
    body:
      "Book online in about a minute, or call us. Tell us what's going on — even if the answer is \"it's been a while and I'm not sure where to start.\"",
  },
  {
    title: 'Forms from your couch',
    body:
      'We send your intake forms ahead of time so you can fill them out at home in a few minutes — not on a clipboard in the waiting room.',
  },
  {
    title: 'The visit itself',
    body:
      'A thorough exam, any X-rays we actually need, and time to talk. We look, we listen, and we explain what we see in plain words.',
  },
  {
    title: 'A plan you understand',
    body:
      'You leave knowing where things stand, what (if anything) needs doing, and what it will cost — before anything gets scheduled.',
  },
]

const BRING_ITEMS: Array<{ title: string; body: string }> = [
  {
    title: 'Your insurance card',
    body:
      "If you have dental insurance, bring the card (or a photo of it). We'll verify your benefits and file claims for you.",
  },
  {
    title: 'A photo ID',
    body: 'A driver’s license or any government-issued ID does the trick.',
  },
  {
    title: 'Your medication list',
    body:
      'Anything you take regularly — some medications matter for dental care, and a list beats remembering on the spot.',
  },
  {
    title: 'Past records, if you have them',
    body:
      'Recent X-rays from a previous office save you time (and repeat imaging). No records? No problem — we start fresh.',
  },
]

const DEFAULT_NEW_PATIENT_FAQ: ClinicFaqItem[] = [
  {
    id: 'np-default-1',
    category: 'New patients',
    question: 'How long should I plan for my first visit?',
    answer:
      'First visits run longer than routine cleanings because we take the time to look at everything and answer your questions. We will confirm the details when you book, so you can plan your day around it.',
  },
  {
    id: 'np-default-2',
    category: 'New patients',
    question: 'Will I get a cleaning at my first visit?',
    answer:
      'Usually, yes — when your exam shows a routine cleaning is what you need. If your gums need a different kind of care, we will explain why and schedule the right treatment instead of rushing it.',
  },
  {
    id: 'np-default-3',
    category: 'New patients',
    question: "I haven't been to a dentist in years. Will you judge me?",
    answer:
      'Never. A big share of our new patients say exactly this. You will get a plan for moving forward, not a lecture about the past.',
  },
  {
    id: 'np-default-4',
    category: 'New patients',
    question: 'Can I book for my whole family?',
    answer:
      'Yes — tell us who is coming and we will do our best to schedule visits back-to-back so you are not making three separate trips.',
  },
]

/**
 * /new-patients — the universal first-visit guide. Answers the three
 * questions every anxious new patient actually has (what happens, what do I
 * bring, what will it cost) in the clinic's own brand voice, and routes them
 * to book / intake / insurance without hunting. Universal defaults render on
 * day 0; every string is inline-editable (copy:newPatients.*), and the money
 * cards read the clinic's REAL carriers + payment methods.
 */
export default async function NewPatientsPage({ params }: Props) {
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
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug)
  // Same absolute-URL rule as the homepage hero's intake link: the auth +
  // portal half of the flow only exists on the apex www host.
  const intakeHref = `${appBaseUrl()}/site/${data.slug}/intake-start`

  const services = (profile.services as ClinicService[] | null) ?? []

  const expectSteps = resolveCopyList(copyOverrides, 'newPatients.expect', EXPECT_STEPS)
  const bringItems = resolveCopyList(copyOverrides, 'newPatients.bring', BRING_ITEMS)

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
    services: navServicesFromClinicServices(services),
  })

  // The money cards read REAL profile data (no fake content): carriers from
  // acceptedInsuranceCarriers, methods from paymentMethods, each falling back
  // to honest universal copy when unset.
  const carriers: string[] = Array.isArray(profile.acceptedInsuranceCarriers)
    ? (profile.acceptedInsuranceCarriers as unknown[]).filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      )
    : []
  const paymentMethods: string[] = Array.isArray(profile.paymentMethods)
    ? (profile.paymentMethods as unknown[]).filter(
        (m): m is string => typeof m === 'string' && m.trim().length > 0,
      )
    : []
  const insuranceBodyDerived =
    carriers.length > 0
      ? `We accept ${carriers.slice(0, 3).join(', ')}${carriers.length > 3 ? ` and ${carriers.length - 3} more` : ''} — and we verify your benefits before your visit so there are no surprises at check-in.`
      : 'We work with most major PPO plans. Send us your carrier and plan name and we will verify your benefits before your visit.'
  const paymentBodyDerived =
    paymentMethods.length > 0
      ? `We accept ${paymentMethods.join(', ')}. You will always see the cost before treatment is scheduled.`
      : 'Transparent self-pay pricing, with a clear estimate before anything is scheduled. You will always see the cost first.'

  // New-patient FAQ — clinic-authored items in a first-visit-shaped category
  // win; universal defaults otherwise.
  const allFaq = (profile.faq as ClinicFaqItem[] | null) ?? []
  const npFaqFromClinic = allFaq.filter((item) =>
    /new patient|first visit|getting started/i.test(item.category ?? ''),
  )
  const npFaq = npFaqFromClinic.length > 0 ? npFaqFromClinic : DEFAULT_NEW_PATIENT_FAQ
  const faqLd = faqPageJsonLd(npFaq.map((f) => ({ question: f.question, answer: f.answer })))

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

      <main id="main-content" tabIndex={-1}>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-10 pb-10 sm:pt-20 sm:pb-16">
          <div className="max-w-[800px] mx-auto px-5 sm:px-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
              style={{ color: INK_MUTED }}
              data-edit-field="copy:newPatients.heroEyebrow"
              data-edit-kind="text"
              data-edit-label="eyebrow"
            >
              {copyOverride(copyOverrides, 'newPatients.heroEyebrow', 'Patients · Your first visit')}
            </p>
            <h1
              className="text-[32px] sm:text-[48px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.015em] mb-6"
              style={{
                color: headingInk,
                fontFamily: 'var(--font-display, Georgia, serif)',
              }}
              data-edit-field="copy:newPatients.heading"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'newPatients.heading', '') || (
                <>Your first visit at {name}.</>
              )}
            </h1>
            <p
              className="text-base sm:text-lg leading-[1.6] mb-9"
              style={{ color: INK }}
              data-edit-field="copy:newPatients.heroIntro"
              data-edit-kind="text"
              data-edit-label="intro"
            >
              {copyOverride(copyOverrides, 'newPatients.heroIntro', '') || (
                <>
                  New place, new faces — we get it. Here&rsquo;s exactly what your
                  first visit looks like, what to bring, and how the money part
                  works. No surprises, no judgment.
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={bookHref}
                className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
              >
                {bookLabel}
              </a>
              <a
                href={intakeHref}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium border bg-[var(--c-surface,#FFFFFF)] transition hover:shadow-sm"
                style={{ color: INK, borderColor: BORDER }}
              >
                Start your intake online
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        {/* ── What to expect — 4 numbered steps ───────────────────────────── */}
        <section className="py-16 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <NumberedSteps
              steps={expectSteps}
              brand={headingInk}
              columns={2}
              surface="bg"
              eyebrow={copyOverride(copyOverrides, 'newPatients.expect.eyebrow', 'What to expect')}
              heading={
                copyOverride(copyOverrides, 'newPatients.expect.heading', '') ||
                'Your first visit, step by step.'
              }
              editKeyPrefix="newPatients.expect"
            />
          </div>
        </section>

        {/* ── Before you arrive — deep band w/ checklist + intake card ────── */}
        <DeepBand className="pt-20 pb-14 sm:pt-32 sm:pb-24" arcFill="var(--c-surface, #FFFFFF)">
          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="text-center max-w-[700px] mx-auto mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: 'rgba(250, 247, 242, 0.7)' }}
                data-edit-field="copy:newPatients.bringEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.bringEyebrow', 'Before you arrive')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: 'var(--c-deep-ink, #FAF7F2)',
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.bringHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.bringHeading', '') || 'What to bring'}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.55]"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                data-edit-field="copy:newPatients.bringIntro"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(
                  copyOverrides,
                  'newPatients.bringIntro',
                  'Four things, and only if you have them — missing one is never a reason to reschedule.',
                )}
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-start">
              {/* Left: the bring checklist */}
              <ul className="space-y-5">
                {bringItems.map((item, i) => (
                  <li key={item.title} className="flex items-start gap-4">
                    <span
                      className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full mt-0.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                      aria-hidden="true"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                    <div>
                      <h3
                        className="text-lg font-semibold mb-1 leading-tight"
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
                        data-edit-field={`copy:newPatients.bring.${i}.title`}
                        data-edit-kind="text"
                        data-edit-label="title"
                      >
                        {item.title}
                      </h3>
                      <p
                        className="text-[15px] leading-[1.6]"
                        style={{ color: 'rgba(255,255,255,0.78)' }}
                        data-edit-field={`copy:newPatients.bring.${i}.body`}
                        data-edit-kind="text"
                        data-edit-label="text"
                      >
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Right: skip-the-clipboard intake card */}
              <div
                className="rounded-2xl sm:rounded-3xl p-7 sm:p-10"
                style={{ backgroundColor: 'var(--c-surface, #FFFFFF)', color: INK }}
              >
                <h3
                  className="text-xl sm:text-2xl font-semibold mb-3"
                  style={{
                    color: headingInk,
                    fontFamily: 'var(--font-display, Georgia, serif)',
                  }}
                  data-edit-field="copy:newPatients.intakeHeading"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.intakeHeading', 'Skip the clipboard')}
                </h3>
                <p
                  className="text-[15px] sm:text-base leading-[1.65] mb-6"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.intakeBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(
                    copyOverrides,
                    'newPatients.intakeBody',
                    'Do your paperwork from home — it takes a few minutes, and your answers are waiting for us when you arrive. Your info stays private and goes straight to your chart.',
                  )}
                </p>
                <a
                  href={intakeHref}
                  className="inline-flex items-center px-6 py-3 rounded-full text-[15px] font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
                  style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
                >
                  Start your intake online
                  <span aria-hidden="true" className="ml-2">→</span>
                </a>
              </div>
            </div>
          </div>
        </DeepBand>

        {/* ── The money part — insurance + payment cards (real data) ──────── */}
        <section className="py-14 sm:py-24">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="max-w-[640px] mb-12">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
                data-edit-field="copy:newPatients.moneyEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.moneyEyebrow', 'The money part')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.moneyHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.moneyHeading', '') ||
                  'Costs, insurance, and zero surprises.'}
              </h2>
            </ScrollReveal>
            <div className={`grid gap-5 sm:gap-7 ${hasDentalPlans ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <ScrollReveal
                className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
              >
                <h3
                  className="text-lg font-semibold mb-2 leading-tight"
                  style={{ color: INK }}
                  data-edit-field="copy:newPatients.moneyInsuranceTitle"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyInsuranceTitle', 'Using insurance?')}
                </h3>
                <p
                  className="text-[15px] leading-[1.6] mb-4 flex-1"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.moneyInsuranceBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyInsuranceBody', '') ||
                    insuranceBodyDerived}
                </p>
                <a
                  href={`${basePath}/insurance`}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                  style={{ color: headingInk }}
                >
                  See insurance details
                  <span aria-hidden="true">→</span>
                </a>
              </ScrollReveal>
              <ScrollReveal
                delay={100}
                className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
              >
                <h3
                  className="text-lg font-semibold mb-2 leading-tight"
                  style={{ color: INK }}
                  data-edit-field="copy:newPatients.moneyPaymentTitle"
                  data-edit-kind="text"
                  data-edit-label="title"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyPaymentTitle', 'Paying without insurance?')}
                </h3>
                <p
                  className="text-[15px] leading-[1.6] mb-4 flex-1"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:newPatients.moneyPaymentBody"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(copyOverrides, 'newPatients.moneyPaymentBody', '') ||
                    paymentBodyDerived}
                </p>
                <a
                  href={`${basePath}/payment-financing`}
                  className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                  style={{ color: headingInk }}
                >
                  Payment &amp; financing
                  <span aria-hidden="true">→</span>
                </a>
              </ScrollReveal>
              {hasDentalPlans && (
                <ScrollReveal
                  delay={200}
                  className="rounded-2xl p-6 sm:p-7 flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-sm"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <h3
                    className="text-lg font-semibold mb-2 leading-tight"
                    style={{ color: INK }}
                    data-edit-field="copy:newPatients.plansTitle"
                    data-edit-kind="text"
                    data-edit-label="title"
                  >
                    {copyOverride(copyOverrides, 'newPatients.plansTitle', 'No dental insurance?')}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.6] mb-4 flex-1"
                    style={{ color: INK_MUTED }}
                    data-edit-field="copy:newPatients.plansBody"
                    data-edit-kind="text"
                    data-edit-label="text"
                  >
                    {copyOverride(
                      copyOverrides,
                      'newPatients.plansBody',
                      'Our in-house dental plan covers preventive care and saves on other treatment — no deductibles, no claim forms, no waiting periods.',
                    )}
                  </p>
                  <a
                    href={`${basePath}/dental-plans`}
                    className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2"
                    style={{ color: headingInk }}
                  >
                    See our dental plans
                    <span aria-hidden="true">→</span>
                  </a>
                </ScrollReveal>
              )}
            </div>
          </div>
        </section>

        {/* ── No judgment, ever — the anti-shame promise ──────────────────── */}
        <section className="py-14 sm:py-20" style={{ backgroundColor: SURFACE }}>
          <div className="max-w-[720px] mx-auto px-5 sm:px-8 text-center">
            <ScrollReveal>
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: INK_MUTED }}
                data-edit-field="copy:newPatients.comfortEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'newPatients.comfortEyebrow', 'Been a while?')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{
                  color: headingInk,
                  fontFamily: 'var(--font-display, Georgia, serif)',
                }}
                data-edit-field="copy:newPatients.comfortHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.comfortHeading', '') ||
                  'No judgment, ever.'}
              </h2>
              <p
                className="text-base sm:text-lg leading-[1.65]"
                style={{ color: INK_MUTED }}
                data-edit-field="copy:newPatients.comfortBody"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(
                  copyOverrides,
                  'newPatients.comfortBody',
                  'Whether it has been six months or six years, you will get the same warm welcome. We are not here to lecture you about flossing — we are here to help you move forward from wherever you are starting.',
                )}
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── First-visit FAQ ─────────────────────────────────────────────── */}
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
                data-edit-field="copy:newPatients.faqHeading"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'newPatients.faqHeading', '') ||
                  'First-visit questions, answered.'}
              </h2>
            </ScrollReveal>
            <div className="space-y-3">
              {npFaq.map((item, i) => (
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
          heading={copyOverride(copyOverrides, 'newPatients.cta.heading', 'Ready when you are.')}
          subhead={copyOverride(
            copyOverrides,
            'newPatients.cta.subhead',
            'Book online in about a minute — or call, and a real person will help you find a time.',
          )}
          editKeyPrefix="newPatients.cta"
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
