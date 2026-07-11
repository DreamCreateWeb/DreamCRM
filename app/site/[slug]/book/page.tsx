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
import { type ClinicService, type ClinicStaff } from '@/lib/types/clinic-content'
import {
  buildClinicNavLinks,
  navServicesFromClinicServices,
  copyOverride,
  isSelfBookingEnabled,
} from '@/lib/clinic-site-helpers'
import { publicVisitTypes } from '@/lib/types/visit-types'
import { readableInk } from '@/lib/clinic-site-theme'
import { hasBookableSlotsInWindow } from '@/lib/services/booking'
import {
  canTakeBookingDeposits,
  finalizeBookingDepositFromSession,
  type DepositReceipt,
} from '@/lib/services/booking-deposits'
import { formatOdDate } from '@/lib/services/pms/datetime'
import { CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import ClosingCTA from '@/components/clinic-site/closing-cta'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import BookForm from './book-form'
import RequestForm from './request-form'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'


interface Props {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/book`
  const selfBooking = isSelfBookingEnabled(data.profile)
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta).book, {
    title: selfBooking ? `Book a Visit — ${name}` : `Request an Appointment — ${name}`,
    description: selfBooking
      ? `Book your appointment online with ${name} — pick a time that works for you.`
      : `Request an appointment with ${name} — tell us what you need and we’ll reach out to find a time.`,
  })
  // Mirror the home page's metadata completeness: siteName, OG/Twitter images
  // (hero photo when present), and the favicon.
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

const RE_ASSURANCES: Array<{
  title: string
  body: string
  icon: React.ReactNode
}> = [
  {
    title: 'Same-week visits',
    body: 'Most new patients are scheduled within 3–5 days.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: 'No judgment, ever',
    body: 'However long it’s been, you’re welcome. We meet you where you are.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    title: 'We’ll explain everything',
    body: 'No surprises. Treatment, options, and cost — in plain language.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    title: 'Easy to reschedule',
    body: 'Life happens. Move or cancel without hassle — we’ll send a reminder.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
]

export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // Deposit return trip: Stripe sends the patient back here with the checkout
  // session id. Finalize idempotently (the Connect webhook also finalizes —
  // whichever lands first wins) and render the receipt in place of the form.
  const sp = searchParams ? await searchParams : {}
  const depositSessionId = typeof sp.deposit_session === 'string' ? sp.deposit_session : null
  // "deposit=later" = the patient backed out of Stripe Checkout. The visit is
  // still booked (fail-open by design) — say so instead of showing a blank form.
  const depositSkipped = sp.deposit === 'later'
  let depositReceipt: DepositReceipt | null = null
  if (depositSessionId && depositSessionId.length < 200) {
    try {
      depositReceipt = await finalizeBookingDepositFromSession(data.orgId, depositSessionId)
    } catch (err) {
      console.warn('[book] deposit finalize failed', err)
    }
  }

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  if (!isPro) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground — same treatment every other site page uses. Raw `brand` still
  // paints backgrounds, pill tints, and decorative SVG strokes.
  const headingInk = readableInk(brand)
  const copyOverrides = (data.profile.copyOverrides as Record<string, string> | null) ?? null
  const basePath = await resolveSiteBasePath(slug)
  // Whether ANY day in the bookable window has an opening, so we can surface a
  // prominent "call us" fallback when the whole window is closed/full (phone is
  // otherwise only in a side card, below the fold on mobile).
  const tz = data.profile.timezone?.trim() || CLINIC_DEFAULT_TZ
  const todayKey = formatOdDate(new Date(), tz)
  // When self-scheduling is OFF the page shows a request form (no slot grid), so
  // skip the 14-day availability scan entirely.
  const selfBooking = isSelfBookingEnabled(data.profile)
  const [publishedPosts, membershipPlans, openJobs, windowHasAvailability] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 1 }),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
    selfBooking ? hasBookableSlotsInWindow(data.orgId, todayKey, 14) : Promise.resolve(true),
  ])
  // Deposits only surface when the clinic can actually charge (Connect active)
  // — otherwise the widget shows no deposit copy and booking stays free-flow.
  const anyDepositConfigured = publicVisitTypes(data.profile.visitTypeSettings).some(
    (t) => t.depositCents > 0,
  )
  const depositsChargeable = anyDepositConfigured ? await canTakeBookingDeposits(data.orgId) : false
  const publicTypes = publicVisitTypes(data.profile.visitTypeSettings).map((t) => ({
    id: t.id,
    label: t.label,
    durationMinutes: t.durationMinutes,
    depositCents: depositsChargeable ? t.depositCents : 0,
  }))
  const hasBlog = publishedPosts.length > 0
  const hasDentalPlans = membershipPlans.length > 0
  const hasCareers = openJobs.length > 0
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0
  const signIn = clinicPortalSignInUrl(slug)
  // On the /book page itself, the Book CTA in the nav links should also
  // route to /book (we're already here, but the nav should remain consistent
  // across the rest of the site).
  const bookHref = `${basePath}/book`
  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const bookLabel = siteTemplate.bookLabel
  const { Header: SiteHeader, Footer: SiteFooter, MobileActions: SiteMobileActions } = siteTemplate.chrome

  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(
      (data.profile.services as ClinicService[] | null) ?? [],
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
      <SiteHeader
        data={data}
        basePath={basePath}
        navLinks={navLinks}
        bookHref={bookHref}
        bookLabel={bookLabel}
        signInUrl={signIn}
      />

      <main id="main-content" tabIndex={-1}>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="pt-14 sm:pt-20 pb-10 sm:pb-14">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8 text-center">
            <ScrollReveal>
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-5"
                style={{ color: headingInk }}
                data-edit-field="copy:book.heroEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'book.heroEyebrow', 'Book a visit')}
              </p>
              <h1
                className="text-[32px] sm:text-[48px] lg:text-[68px] font-semibold leading-[1.04] tracking-[-0.02em] mb-6"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:book.heroTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(
                  copyOverrides,
                  'book.heroTitle',
                  selfBooking ? 'Let’s get you on the schedule.' : 'Request an appointment.',
                )}
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p
                className="text-lg sm:text-xl leading-[1.55] mx-auto max-w-[600px]"
                style={{ color: INK_MUTED }}
              >
                {selfBooking ? (
                  <>
                    Pick a time that works. Most patients are seen the same week — and
                    it&rsquo;s a calm, welcoming visit from the moment you arrive.
                  </>
                ) : (
                  <>
                    Tell us a bit about what you need and we&rsquo;ll reach out — usually
                    within one business day — to find a time that works for you.
                  </>
                )}
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── 2-col main: reassurance left, form right (desktop). Mobile
            shows reassurance FIRST so the page eases into the form rather
            than leading with a wall of inputs. ───────────────────────── */}
        <section className="pb-12 sm:pb-24">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-12 items-start">
              {/* Reassurance column — order-first on every breakpoint. */}
              <ScrollReveal as="div" className="lg:col-span-5">
                <div className="lg:sticky lg:top-32">
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                    style={{ color: headingInk }}
                  >
                    What to expect
                  </p>
                  <h2
                    className="text-2xl sm:text-3xl font-semibold leading-[1.15] tracking-[-0.015em] mb-7"
                    style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  >
                    A calm, welcoming visit.
                  </h2>
                  <ul className="space-y-5">
                    {RE_ASSURANCES.map((r, i) => (
                      <ScrollReveal
                        as="li"
                        key={i}
                        delay={i * 90}
                        className="flex gap-4"
                        style={{ listStyle: 'none' }}
                      >
                        <span
                          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${brand}1A`, color: headingInk }}
                        >
                          {r.icon}
                        </span>
                        <div>
                          <h3 className="text-base font-semibold mb-1" style={{ color: INK }}>
                            {r.title}
                          </h3>
                          <p className="text-sm leading-[1.55]" style={{ color: INK_MUTED }}>
                            {r.body}
                          </p>
                        </div>
                      </ScrollReveal>
                    ))}
                  </ul>

                  {data.profile.phone && (
                    <div
                      className="mt-8 rounded-2xl p-5 text-sm"
                      style={{
                        backgroundColor: SURFACE,
                        border: `1px solid ${BORDER}`,
                        color: INK_MUTED,
                      }}
                    >
                      Prefer to talk to a person? Call us at{' '}
                      <a
                        href={`tel:${data.profile.phone}`}
                        className="font-semibold hover:underline"
                        style={{ color: INK }}
                      >
                        {data.profile.phone}
                      </a>
                      .
                    </div>
                  )}
                </div>
              </ScrollReveal>

              {/* Form column. Mobile uses a tighter `rounded-2xl p-5` so the
                  form card doesn't dwarf the viewport; desktop keeps the
                  generous `rounded-3xl p-9`. */}
              <ScrollReveal
                delay={120}
                className="lg:col-span-7"
              >
                <div
                  className="rounded-2xl sm:rounded-3xl p-5 sm:p-9 shadow-sm"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  {depositReceipt && depositReceipt.status === 'paid' ? (
                    <DepositReceiptCard receipt={depositReceipt} brand={brand} clinicPhone={data.profile.phone ?? null} />
                  ) : (
                    <>
                      {depositSkipped && (
                        <div
                          className="rounded-2xl p-4 mb-6 text-sm leading-relaxed"
                          style={{ backgroundColor: `${brand}12`, border: `1px solid ${brand}40`, color: INK_MUTED }}
                        >
                          <strong style={{ color: INK }}>Your visit is booked</strong> — the deposit
                          didn&rsquo;t go through, so the office may reach out about it. No need to
                          book again.
                        </div>
                      )}
                      {selfBooking ? (
                        <BookForm
                          orgId={data.orgId}
                          timeZone={tz}
                          slug={data.slug}
                          brand={brand}
                          clinicName={name}
                          clinicPhone={data.profile.phone ?? null}
                          windowHasAvailability={windowHasAvailability}
                          visitTypes={publicTypes}
                        />
                      ) : (
                        <RequestForm
                          slug={data.slug}
                          brand={brand}
                          clinicName={name}
                          clinicPhone={data.profile.phone ?? null}
                          visitTypes={publicTypes}
                        />
                      )}
                    </>
                  )}
                </div>
                {selfBooking && (
                  <p className="text-center mt-5 text-xs" style={{ color: INK_MUTED }}>
                    By booking, you agree to a reminder email. We&rsquo;ll never share
                    your details.
                  </p>
                )}
              </ScrollReveal>
            </div>
          </div>
        </section>

        <ClosingCTA
          heading={copyOverride(copyOverrides, 'book.cta.heading', 'It’s a pleasure to care for you.')}
          subhead={copyOverride(copyOverrides, 'book.cta.subhead', 'See you soon — and don’t hesitate to reach out if you have any questions before your visit.')}
          editKeyPrefix="book.cta"
          primary={{ label: 'See our services', href: `${basePath}/services` }}
          secondary={
            data.profile.phone
              ? { label: data.profile.phone, href: `tel:${data.profile.phone}` }
              : undefined
          }
          brand={brand}
          variant="teal"
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

/** Post-Stripe receipt shown in place of the booking form. The visit itself
 *  was booked before the redirect; this confirms the money landed. */
function DepositReceiptCard({
  receipt,
  brand,
  clinicPhone,
}: {
  receipt: DepositReceipt
  brand: string
  clinicPhone: string | null
}) {
  const amount =
    receipt.amountCents % 100 === 0
      ? `$${receipt.amountCents / 100}`
      : `$${(receipt.amountCents / 100).toFixed(2)}`
  return (
    <div className="text-center py-10 sm:py-12">
      <div
        className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
        style={{ backgroundColor: brand + '22' }}
      >
        <svg className="w-10 h-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold tracking-[-0.02em] mb-2" style={{ color: INK }}>
        Deposit received — you&rsquo;re all set, {receipt.patientFirstName}.
      </h2>
      <p className="leading-relaxed max-w-md mx-auto" style={{ color: INK_MUTED }}>
        Your {amount} deposit is in and your{' '}
        {receipt.visitType.replace(/_/g, ' ')} visit is confirmed. The deposit is credited
        toward your visit, so there&rsquo;s nothing extra to pay for it. A confirmation
        email with your visit details is on its way.
      </p>
      {clinicPhone && (
        <p className="text-sm mt-7" style={{ color: INK_MUTED }}>
          Need to change something? Call us at{' '}
          <a href={`tel:${clinicPhone}`} className="font-semibold hover:underline" style={{ color: INK }}>
            {clinicPhone}
          </a>
          .
        </p>
      )}
    </div>
  )
}
