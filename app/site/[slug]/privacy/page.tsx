import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  resolveSiteBasePath,
  clinicPortalSignInUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'


// Template revision, not a per-clinic edit date — bump when the policy copy
// itself changes.
const POLICY_REVISED = 'July 2026'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/privacy`
  return {
    title: `Privacy Policy — ${name}`,
    description: `How ${name} handles the information you share through this website.`,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
  }
}

/** Section heading + body paragraphs — one visual voice for the whole page. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2
        className="text-xl sm:text-2xl font-semibold mb-3"
        style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-[15px] sm:text-base leading-[1.7]" style={{ color: INK }}>
        {children}
      </div>
    </section>
  )
}

export default async function PrivacyPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter } = siteTemplate.chrome
  const [publishedPosts, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])

  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const headingInk = readableInk(brand)
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath || '/'}#contact`
  const signIn = clinicPortalSignInUrl(slug)
  const contactBits = [profile.email, profile.phone].filter(Boolean).join(' or ')

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog: publishedPosts.length > 0,
    hasDentalPlans: membershipPlans.length > 0,
    hasTeam: ((profile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasCareers: openJobs.length > 0,
    services: navServicesFromClinicServices((profile.services as ClinicService[] | null) ?? []),
  })

  return (
    <div
      className="min-h-screen antialiased"
      style={{ backgroundColor: BG, color: INK, fontFamily: 'var(--font-sans, Inter, sans-serif)' }}
    >
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1} className="py-14 sm:py-20">
        <div className="max-w-[760px] mx-auto px-5 sm:px-8">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: INK_MUTED }}
          >
            {name}
          </p>
          <h1
            className="text-[32px] sm:text-[44px] font-semibold leading-[1.08] tracking-[-0.015em] mb-3"
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            Privacy policy.
          </h1>
          <p className="text-sm mb-12" style={{ color: INK_MUTED }}>
            How this website handles the information you share with us. Last revised {POLICY_REVISED}.
          </p>

          <Section title="The short version">
            <p>
              We collect only what we need to respond to you and care for you, we never sell your
              information, and this site carries no third-party advertising trackers. Questions any
              time: {contactBits || 'contact the office'}.
            </p>
          </Section>

          <Section title="What we collect">
            <p>
              <strong>Information you give us.</strong> When you use a form on this site — booking a
              visit, asking a question, checking your insurance, completing intake paperwork,
              joining a membership plan, making a purchase, or applying for a role — we receive what
              you type: typically your name, contact details, and the details of your request. If
              you create a patient-portal account, we also hold your sign-in details.
            </p>
            <p>
              <strong>Basic usage information.</strong> We keep first-party page-view counts and
              standard technical logs (browser type, pages visited) to understand how the site is
              used. We do not use third-party advertising networks or cross-site tracking on this
              website.
            </p>
          </Section>

          <Section title="How we use it">
            <p>
              To respond to you, schedule and confirm visits, send appointment reminders and other
              care-related messages (like a review invitation after a visit or a billing notice),
              run the patient portal and online store, and improve this website. Marketing emails
              always include an unsubscribe link, and unsubscribing never affects your care.
            </p>
          </Section>

          <Section title="Health information">
            <p>
              Details you share in intake or insurance forms are used for your care and handled in
              accordance with applicable law. Please don&rsquo;t use this website for medical
              emergencies — call the office{profile.phone ? ` at ${profile.phone}` : ''} or 911.
              For questions about your medical records themselves, contact the office directly.
            </p>
          </Section>

          <Section title="Payments">
            <p>
              Online payments are processed by Stripe, a PCI-compliant payment processor. Your card
              number goes directly to Stripe and is never stored on our servers.
            </p>
          </Section>

          <Section title="Cookies">
            <p>
              This site uses essential cookies only — the ones that keep you signed in to the
              patient portal and keep a cart together in the store. There are no advertising or
              cross-site tracking cookies.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p>
              The service providers that operate this website for us — hosting, email delivery, and
              payment processing — receive only what they need to do their job. Beyond that, we
              share personal information only when the law requires it. We never sell it.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can unsubscribe from marketing email with one click, and you can contact us any
              time to access, correct, or ask us to delete the information you&rsquo;ve shared
              through this site{contactBits ? ` — reach us at ${contactBits}` : ''}.
            </p>
          </Section>
        </div>
      </main>

      <SiteFooter
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />
    </div>
  )
}
