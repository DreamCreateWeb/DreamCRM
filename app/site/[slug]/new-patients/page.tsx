import { notFound } from 'next/navigation'
import { intakeDoorOpen } from '@/lib/feature-switches'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  clinicPortalSignInUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff, ClinicFaqItem } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'
import { buildClinicNavLinks, navServicesFromClinicServices, resolveCopyList, hasColoringPages, isSelfBookingEnabled, intakeStartHref } from '@/lib/clinic-site-helpers'
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

/**
 * Step 2 while the Intake Forms door is CLOSED (law 1 — OFF until chosen,
 * honest while pending). The default above promises forms sent ahead of the
 * visit; with the door shut there is no form to send, and the first-visit
 * guide's whole job is to say exactly what happens. A clinic's own edit of
 * `newPatients.expect.1.*` still wins either way.
 */
const EXPECT_STEP_FORMS_IN_OFFICE: { title: string; body: string } = {
  title: 'A few quick forms',
  body:
    'We keep the paperwork short — a few minutes when you arrive, and someone at the desk to help if anything is unclear.',
}

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
  const bookHref = isSelfBookingEnabled(profile) ? `${basePath}/book` : `${basePath || '/'}#contact`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome
  const signIn = clinicPortalSignInUrl(slug, data.profile.portalSettings)
  // Same absolute-URL rule as the homepage hero's intake link: the auth +
  // portal half of the flow only exists on the apex www host.
  const intakeHref = intakeStartHref(data.slug)
  // OFF UNTIL CHOSEN: no intake CTA while the Intake Forms door is closed (the page would 404).
  const intakeOpen = intakeDoorOpen(data.profile)

  const services = (profile.services as ClinicService[] | null) ?? []

  const expectDefaults = intakeOpen
    ? EXPECT_STEPS
    : EXPECT_STEPS.map((step, i) => (i === 1 ? EXPECT_STEP_FORMS_IN_OFFICE : step))
  const expectSteps = resolveCopyList(copyOverrides, 'newPatients.expect', expectDefaults)
  const bringItems = resolveCopyList(copyOverrides, 'newPatients.bring', BRING_ITEMS)

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

  const Body = siteTemplate.pages.subpages.newPatients
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
        <Body copyOverrides={copyOverrides} headingInk={headingInk} name={name} bookHref={bookHref} brand={brand} bookLabel={bookLabel} intakeOpen={intakeOpen} intakeHref={intakeHref} expectSteps={expectSteps} bringItems={bringItems} hasDentalPlans={hasDentalPlans} insuranceBodyDerived={insuranceBodyDerived} basePath={basePath} paymentBodyDerived={paymentBodyDerived} npFaq={npFaq} profile={profile} />
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
