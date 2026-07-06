import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { appBaseUrl, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import type { BlogPost } from '@/lib/db/schema/clinic'
import type {
  ClinicService,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
  ClinicStaff,
} from '@/lib/types/clinic-content'
import { readableInk } from '@/lib/clinic-site-theme'
import {
  firstSentence,
  copyOverride,
  buildClinicNavLinks,
  navServicesFromClinicServices,
} from '@/lib/clinic-site-helpers'
import ContactForm from '@/app/site/[slug]/contact-form'
import SiteHeader from '@/components/clinic-site/site-header'
import SiteFooter from '@/components/clinic-site/site-footer'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'
import TestimonialsCarousel from '@/components/clinic-site/testimonials-carousel'
import ServicePills from '@/components/clinic-site/service-pills'
import TeamGallery from '@/components/clinic-site/team-gallery'
import InsuranceVerifierForm from '@/components/clinic-site/insurance-verifier-form'
import GoogleRatingBadge, { GOOGLE_RATING_MIN_COUNT } from '@/components/clinic-site/google-rating-badge'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { RippleMotif, ArcDivider, GrainOverlay, SparkleGlyph } from '@/components/clinic-site/decor'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'
import { brandTint } from '@/lib/brand-tint'

/**
 * Modern Family/Wellness template — the default clinic site.
 *
 * Design direction: hellotend.com verbatim, adapted for single-clinic content.
 * Section flow (top→bottom): two-bar header (top brand-color strip + main
 * white nav) · 3-col hero (H1 + secondary-H2 center, oval portraits flanking)
 * · pill service carousel · trust-stats card · "the {clinic} difference"
 * 2-col · arrow-paginated testimonials carousel · Location (map + directions)
 * · Insurance band (carriers + verifier + logo marquee) · clinical-team 3-col
 * with 4 icon callouts (only when ≥2 office photos) · "From the blog" 3-card
 * band (only when published posts exist) · "it's a pleasure" CTA banner ·
 * contact form (basic tier only — pro/premium book via /book) · dark
 * forest-teal footer (full weekly hours live here). The standalone staff
 * grid, about paragraph, office-tour gallery, and hours sections were
 * removed to match Tend's flow; that content lives on /about + the footer.
 * See CLAUDE.md for the full breakdown.
 */

// The neutral roles now read the brand-derived palette vars (set on :root by
// the site layout from the clinic's one brand color). Literal fallbacks match
// the original warm-neutral scheme so a surface rendered outside the layout
// (e.g. a unit test) still paints. These are style values only — never passed
// into readableInk's color math (that takes the raw brand + a real hex).

interface Props {
  data: ClinicSiteData
  /** Base path for internal links — used so server renders correctly under /site/[slug] */
  basePath: string
  /** Absolute URL to the app's sign-in page. Patients + staff both auth here;
   *  tenant context routes them to the right dashboard after login. Absolute
   *  (not relative) because on a clinic subdomain a relative /signin would be
   *  rewritten to /site/<slug>/signin and 404. */
  signInUrl?: string
  /** Whether the clinic has at least one published blog post — gates the
   *  About → Blog dropdown child. */
  hasBlog?: boolean
  /** Up to 3 recent published posts — drives the homepage "From the blog"
   *  band. Empty array hides the section (same gate as the Blog nav link). */
  recentPosts?: BlogPost[]
  /** All-time count of completed `review_request` rows. Substituted into any
   *  stat with `dynamic: 'review_count'` so the "happy patients" trust signal
   *  reflects real data instead of a hardcoded "8,000+". Defaults to 0. */
  reviewCount?: number
  /** Whether the clinic has ≥1 active membership plan — gates the Patients →
   *  Dental Plans dropdown child. Same shape as `hasBlog`. */
  hasDentalPlans?: boolean
  /** Whether the clinic has ≥1 open job posting — gates the About → Careers
   *  dropdown child. Empty/false hides Careers from the nav so we never
   *  surface a link to an empty roles page. */
  hasCareers?: boolean
  /** Whether the clinic has ≥1 staff member — gates the About → Meet Our Team
   *  dropdown child. Derived inside the page wrapper (no DB call needed; it's
   *  just `staff.length > 0` on the already-loaded profile). */
  hasTeam?: boolean
  /** 4★+ Google reviews (already filtered + shaped) that auto-feature in the
   *  testimonials carousel alongside the clinic's manual testimonials. The page
   *  loads these from the synced `platform_review` rows so Google stays the live
   *  source of truth (no copying into clinic_profile). Defaults to none. */
  featuredGoogleReviews?: ClinicTestimonial[]
  /** The clinic's live Google rating (synced average + count) — the same
   *  numbers that feed the JSON-LD AggregateRating. Surfaced as a star badge in
   *  the hero when there are enough real reviews. Null/absent → no badge. */
  googleRating?: { average: number | null; count: number } | null
}

/**
 * Display formatter for the live "happy patients" trust stat. Small counts
 * stay exact (a clinic with 5 reviews should not show "10+"); medium counts
 * round to the nearest 10 ("47" → "47+"); large counts collapse to "k+"
 * notation ("8,500" → "8k+"). Conservative rounding so the headline never
 * overstates what the clinic has actually earned.
 *
 * Exported for unit testing.
 */
export function formatReviewCount(n: number): string {
  if (n < 10) return String(n)
  if (n < 100) return `${n}+`
  if (n < 1000) return `${Math.floor(n / 10) * 10}+`
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k+`
  return `${Math.floor(n / 1000)}k+`
}

export default function ModernTemplate({ data, basePath, signInUrl, hasBlog = false, recentPosts = [], reviewCount = 0, hasDentalPlans = false, hasCareers = false, hasTeam = false, featuredGoogleReviews = [], googleRating = null }: Props) {
  const { profile, primaryLocation } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F' // sage default — warm neutral, not clinical blue
  // Contrast-safe text fill for brand-colored headings/eyebrows/links/numerals
  // on the warm ground. Raw `brand` stays on backgrounds, borders, pills, and
  // SVG icon strokes (decorative accents); only text fills route through this.
  const headingInk = readableInk(brand)
  // Live Google rating for the hero trust badge — shown only when the synced
  // average exists AND there are enough real reviews to headline honestly.
  const showGoogleRating =
    googleRating != null &&
    googleRating.average != null &&
    googleRating.count >= GOOGLE_RATING_MIN_COUNT
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const heroImageUrl = profile.heroImageUrl ?? null
  // Full service list (drives the nav dropdowns); `services` stays capped at 6
  // for the hero body composition below.
  const allServices: ClinicService[] =
    (profile.services as ClinicService[] | null) ?? []
  const services: ClinicService[] = allServices.slice(0, 6)
  const copyOverrides = (profile.copyOverrides as Record<string, string> | null) ?? null
  const differenceHeadline = copyOverride(copyOverrides, 'home.differenceHeadline', '')
  const imagePositions = (profile.imagePositions as Record<string, string> | null) ?? {}
  const insuranceFormFields = resolveLeadForm(
    (profile.leadForms as LeadFormsConfig | null) ?? null,
    'insurance_verifier',
  )
  const contactFormFields = resolveLeadForm(
    (profile.leadForms as LeadFormsConfig | null) ?? null,
    'contact',
  )
  const rawStats: ClinicStat[] = ((profile.stats as ClinicStat[] | null) ?? []).slice(0, 4)
  // Resolve dynamic stats at render. v1: only `review_count` is dynamic.
  // When the live count is 0 AND the stat is dynamic, drop the row rather
  // than display "0 happy patients" — fresh clinics see the section minus
  // that stat, and if it was the only stat the whole section hides cleanly
  // via the existing `stats.length > 0` guard below.
  const stats: ClinicStat[] = rawStats
    .map((s) =>
      s.dynamic === 'review_count'
        ? { ...s, value: formatReviewCount(reviewCount) }
        : s,
    )
    .filter((s) => !(s.dynamic === 'review_count' && reviewCount === 0))
  // Manual/first-party testimonials the clinic curated, PLUS 4★+ Google reviews
  // that auto-feature (passed in from the page — the live source of truth). Merged
  // at render so Google reviews are never copied into clinic_profile.
  const testimonials: ClinicTestimonial[] = [
    ...((profile.testimonials as ClinicTestimonial[] | null) ?? []),
    ...featuredGoogleReviews,
  ].slice(0, 50)
  const officePhotos: ClinicOfficePhoto[] =
    ((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).slice(0, 8)
  // Insurance carriers shown on the public Insurance section + populated
  // into the verifier-form carrier dropdown. JSONB string[] on
  // clinic_profile (migration 0038). When null/empty, the section falls
  // back to "call us to verify" copy and drops the dropdown.
  const insuranceCarriers: string[] = Array.isArray(profile.acceptedInsuranceCarriers)
    ? (profile.acceptedInsuranceCarriers as unknown[]).filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      )
    : []
  // Address used by the Location section — prefer the primary clinic
  // location row (multi-location clinics keep address there), fall back
  // to the profile-level fields. Same precedence as the Hours+Location
  // card lower on the page and the JSON-LD builder.
  const addrLine1 = primaryLocation?.addressLine1 ?? profile.addressLine1 ?? null
  const addrCity = primaryLocation?.city ?? profile.city ?? null
  const addrState = primaryLocation?.state ?? profile.state ?? null
  const addrPostal = primaryLocation?.postalCode ?? profile.postalCode ?? null
  const hasAddress = Boolean(addrLine1 || addrCity)
  const addressOneLine = [addrLine1, [addrCity, addrState].filter(Boolean).join(', '), addrPostal]
    .filter((p) => p && p.toString().trim().length > 0)
    .join(', ')
  // Keyless Google Maps embed — no API key required. The `q=` query +
  // `&output=embed` flag is the official no-auth path Google has supported
  // for the maps iframe for years. Cite the address verbatim.
  const mapQuery = encodeURIComponent(
    [addrLine1, addrCity, addrState, addrPostal].filter(Boolean).join(', '),
  )
  const mapEmbedSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`
  const mapDirectionsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const bookLabel = 'Book a Visit'
  // Patient "Login" → THIS clinic's patient portal, never the platform staff
  // sign-in (the page passes signInUrl; this is just a safe fallback).
  const signIn = signInUrl ?? clinicPortalSignInUrl(data.slug)
  const navLinks = buildClinicNavLinks({
    basePath,
    hasBlog,
    hasDentalPlans,
    hasTeam,
    hasCareers,
    services: navServicesFromClinicServices(allServices),
  })

  // Value-prop chips repeated in the chartreuse closer strip below the
  // "it's a pleasure" CTA card. Same palette + structure as the top
  // announcement strip in SiteHeader so the page composition rhymes —
  // chartreuse top, chartreuse bottom, with the closer card as the
  // bridge. Kept short + generic so they read on every clinic.
  // Voice/quality claims every clinic can honestly make — no operational
  // promises (no "same-week" availability guarantee, no "most insurance"
  // coverage claim) so the strip never overstates on a real clinic.
  const closerChips: string[] = [
    'No judgment, ever',
    'Gentle, modern care',
    'Insurance welcome',
    'Modern technology',
    'A caring team',
    'Comfortable visits',
  ]

  // Two flanking portrait photos for the hero. Left = clinic's hero image,
  // right = first office photo. Backdrops are HARDCODED universal pastels
  // (soft blue + warm peach) — Tend pairs the photo ovals against fixed
  // complementary panels regardless of brand color so the composition
  // reads the same on every palette. Decorative chrome, not content.
  const leftPortraitImage = heroImageUrl ?? null
  // Right hero oval = its own dedicated second hero photo (single-image replace).
  // Falls back to the first office photo for sites set up before the column.
  const rightPortraitImage =
    (profile.heroImageUrl2 as string | null) ?? officePhotos[0]?.url ?? null
  // "Why us" feature media — office photos only (never the hero image). Pick
  // the first office photo NOT already shown in the right hero oval, so a
  // clinic with a single office photo (and no second hero image) doesn't see
  // the same photo twice on one page. When the only office photo is already
  // feeding the hero oval, the slot stays EMPTY (collapses publicly, shows a
  // Studio add-prompt) rather than duplicating the image.
  const differenceMediaUrl =
    officePhotos.find((p) => p.url && p.url !== rightPortraitImage)?.url ?? null
  const leftPortraitBg = 'var(--c-brand-soft, #B8D4E8)'
  const rightPortraitBg = 'var(--c-surface-alt, #F0D9BD)'

  // Service pills under the hero — Tend's qualifier strip.
  const heroServicePills = services.slice(0, 6)
  // Team photos for the clay gallery slider under the stats — sourced straight
  // from the staff records, so it stays in sync with the Team editor.
  const teamGalleryMembers = ((profile.staff as ClinicStaff[] | null) ?? [])
    .filter((s): s is ClinicStaff & { photoUrl: string } => Boolean(s.photoUrl))
    .map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title ?? null,
      photoUrl: s.photoUrl,
      position: s.photoPosition ?? null,
    }))

  // Universal value-prop chips for the "difference" feature checklist. Drawn
  // from the clinic's own services first (so it feels personal), padded
  // with universal trust signals every dental practice can honestly claim.
  const differenceChips: string[] = (() => {
    const explicit = (profile.differenceChips as string[] | null) ?? null
    if (explicit && explicit.length > 0) return explicit.slice(0, 8)
    const out: string[] = []
    for (const s of services.slice(0, 4)) out.push(s.name)
    out.push('No judgment, ever')
    out.push('Gentle, modern care')
    out.push('Insurance welcome')
    out.push('Modern technology')
    out.push('Friendly staff')
    return out.slice(0, 8)
  })()

  // 4 universal clinical-team callouts. Generic-dental enough to not be
  // "fake" — every dentist's office can honestly claim each of these.
  // Adapted from Tend's "decades of experience / science-based care /
  // outcomes not quotas / putting safety first" pattern.
  const teamCallouts: Array<{ icon: string; title: string; copy: string }> = [
    {
      icon: 'experience',
      title: 'A team you can trust',
      copy: 'We put your comfort first, every visit.',
    },
    {
      icon: 'science',
      title: 'Modern, proven care',
      copy: 'Up-to-date technology and gentle techniques. No upsells.',
    },
    {
      icon: 'outcomes',
      title: 'Only what you need',
      copy: 'We recommend what makes sense for you — and tell you why.',
    },
    {
      icon: 'safety',
      title: 'Clean and careful',
      copy: 'Spotless, sterilized, single-use where it counts.',
    },
  ]

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
      {/* ── Hero — Tend-verbatim composition ──────────────────────────── */}
      {/* LEFT photo (asymmetric oval, breaks out of container with neg
          margin, ~35% viewport) | CENTER text column capped at 640px
          (eyebrow → H1 → leadin → CTAs → secondary H2) | RIGHT photo.
          Photos use a SOFT ASYMMETRIC OVAL radius (egg-shape, not full
          circle, not perfect ellipse) sitting on HARDCODED neutral
          backdrops (soft blue + warm peach) regardless of brand color.
          Mobile collapses to a centered single column; a horizontal
          photo scroll appears below the text instead. */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
        {/* Load-time hero choreography — CSS-only so it stays a server render.
            LCP-safe by construction: the H1 and the portrait photos animate
            TRANSFORM ONLY (painted at full opacity from the first frame); the
            opacity fades live on the small supporting elements. Everything is
            gated behind prefers-reduced-motion: no-preference, so reduced-
            motion users get the static hero. */}
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            @keyframes dc-hero-rise {
              from { opacity: 0; transform: translate3d(0, 14px, 0); }
              to   { opacity: 1; transform: translate3d(0, 0, 0); }
            }
            @keyframes dc-hero-settle {
              from { transform: translate3d(0, 12px, 0); }
              to   { transform: translate3d(0, 0, 0); }
            }
            @keyframes dc-hero-photo-in {
              from { transform: translate3d(0, 16px, 0) scale(0.975); }
              to   { transform: translate3d(0, 0, 0) scale(1); }
            }
            .dc-hr { animation: dc-hero-rise 640ms cubic-bezier(0.22, 1, 0.36, 1) both; }
            .dc-hr-1 { animation-delay: 60ms; }
            .dc-hr-2 { animation-delay: 140ms; }
            .dc-hr-3 { animation-delay: 220ms; }
            .dc-hr-4 { animation-delay: 300ms; }
            .dc-hr-5 { animation-delay: 360ms; }
            .dc-hr-6 { animation-delay: 430ms; }
            .dc-hr-t { animation: dc-hero-settle 720ms cubic-bezier(0.22, 1, 0.36, 1) both; }
            .dc-hero-photo { animation: dc-hero-photo-in 900ms cubic-bezier(0.22, 1, 0.36, 1) both; }
            .dc-hero-photo-r { animation-delay: 120ms; }
          }
        `}</style>
        {/* Soft brand wash behind the hero — a whisper of the clinic's color
            bleeding down from the top edge so the opening feels lit, not flat.
            ~8% alpha over the cream ground: decorative only, zero contrast
            impact on the text that sits over it. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[520px] pointer-events-none"
          style={{
            background: `radial-gradient(62% 62% at 50% 0%, ${brand}14 0%, transparent 72%)`,
          }}
        />
        {/* Signature ripple — the calm concentric linework (born in the
            empty-photo placeholder) now whispers behind the hero headline,
            giving every page of the site one recognizable visual DNA. */}
        <RippleMotif
          tint={brand}
          opacity={0.07}
          className="absolute left-1/2 -translate-x-1/2 -top-40 w-[720px] h-[720px]"
        />
        <div className="relative max-w-[1400px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-[1fr_minmax(0,640px)_1fr] gap-6 lg:gap-10 items-center">
            {/* LEFT photo — breakout to ~35% viewport, soft asymmetric oval */}
            <div className="hidden lg:block lg:-ml-12 xl:-ml-20">
              <OvalPortrait
                src={leftPortraitImage}
                bg={leftPortraitBg}
                brand={brand}
                variant="left"
                editField="heroImageUrl"
                position={imagePositions['heroImageUrl']}
                priority
                className="dc-hero-photo"
              />
            </div>

            {/* CENTER text column — caps at 640px so the photos take the
                breathing room. */}
            <div className="text-center max-w-[640px] mx-auto">
              <p
                className="dc-hr dc-hr-1 text-[12px] sm:text-[13px] font-semibold uppercase tracking-[0.22em] mb-5 sm:mb-6 flex items-center justify-center gap-2 flex-wrap"
                style={{ color: INK_MUTED }}
              >
                <span>{name}</span>
                {(primaryLocation?.city || profile.city) && (
                  <>
                    <span aria-hidden="true" className="opacity-50">·</span>
                    <span>
                      {primaryLocation?.city
                        ? `${primaryLocation.city}, ${primaryLocation.state}`
                        : `${profile.city}, ${profile.state}`}
                    </span>
                  </>
                )}
              </p>
              <h1
                className="dc-hr-t text-[34px] sm:text-[56px] lg:text-[80px] font-semibold leading-[1.05] tracking-[-0.02em] mb-5 sm:mb-6"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-section="hero"
                data-edit-field="tagline"
                data-edit-kind="text"
              >
                {profile.tagline ?? 'Dental care that finally feels human.'}
              </h1>
              {profile.about ? (
                <p
                  className="dc-hr dc-hr-2 text-base sm:text-lg leading-[1.55] mb-8 max-w-[460px] mx-auto"
                  style={{ color: INK }}
                  data-edit-field="about"
                  data-edit-kind="modal"
                  data-edit-label="intro"
                >
                  {/* firstSentence keeps its terminal punctuation — strip it so
                      the appended clause reads as ONE sentence ("…unhurried —
                      with no judgment, ever."), never "…unhurried. with…". */}
                  {firstSentence(profile.about).replace(/[.!?]+$/, '')} — with{' '}
                  <strong className="font-semibold">no judgment, ever.</strong>
                </p>
              ) : (
                <p
                  className="dc-edit-only text-base sm:text-lg italic opacity-50 leading-[1.55] mb-8 max-w-[460px] mx-auto"
                  style={{ color: INK }}
                  data-edit-field="about"
                  data-edit-kind="modal"
                  data-edit-label="intro"
                >
                  Add a sentence about your practice…
                </p>
              )}
              <div className="dc-hr dc-hr-3 flex flex-wrap items-center justify-center gap-3 mb-4">
                <a
                  href={bookHref}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                  style={{
                    backgroundColor: `var(--c-brand-strong, ${brand})`,
                    // Brand-tinted glow instead of a generic gray drop — reads
                    // as light coming through the button's own color.
                    boxShadow: `0 10px 24px -10px ${brand}99, 0 2px 6px -2px ${brand}66`,
                  }}
                >
                  {bookLabel}
                </a>
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="inline-flex items-center px-6 py-3.5 rounded-full text-base font-semibold bg-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-sm"
                    style={{
                      color: headingInk,
                      border: `1.5px solid ${brand}`,
                    }}
                  >
                    {profile.phone}
                  </a>
                )}
              </div>
              {/* Live Google rating — real synced stars right under the primary
                  CTA, the conversion-critical trust moment. Honest-gated. */}
              {showGoogleRating && (
                <div className="dc-hr dc-hr-4 mb-8 -mt-2">
                  <GoogleRatingBadge
                    average={googleRating!.average!}
                    count={googleRating!.count}
                    headingInk={headingInk}
                    variant="hero"
                  />
                </div>
              )}
              {/* Tertiary link — surfaces the "save my intake to my account"
                  flow without crowding the primary Book CTA. Always points
                  at the apex `www.` host (not `basePath`) because the rest
                  of the flow — better-auth's `/api/auth/*`, the patient
                  portal at `/patient/*` — only exist on the main app
                  domain. On a clinic subdomain a relative `/intake-start`
                  would get rewritten under `/site/<slug>/` and the auth
                  POST would 404 (issue we hit live). Absolute URL takes
                  the user to www, where auth + cookies + patient portal
                  all share one origin. */}
              <a
                href={`${appBaseUrl()}/site/${data.slug}/intake-start`}
                className="dc-hr dc-hr-5 inline-flex items-center gap-1 text-sm font-semibold mb-12 transition hover:gap-2"
                style={{ color: headingInk }}
              >
                New patient? Start your intake
                <span aria-hidden="true">→</span>
              </a>
              {/* Secondary H2 inside the same text column — Tend's verbatim
                  "A full range of care for all your needs" with bold (not
                  italic) emphasis on the last phrase. */}
              <h2
                className="dc-hr dc-hr-6 text-2xl sm:text-3xl lg:text-[40px] font-semibold leading-[1.15] tracking-[-0.01em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:home.differenceHeadline"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {differenceHeadline || (
                  <>
                    A full range of care for{' '}
                    <strong className="font-bold">all your needs</strong>.
                  </>
                )}
              </h2>
            </div>

            {/* RIGHT photo — breakout to ~35% viewport, soft asymmetric oval */}
            <div className="hidden lg:block lg:-mr-12 xl:-mr-20">
              <OvalPortrait
                src={rightPortraitImage}
                bg={rightPortraitBg}
                brand={brand}
                variant="right"
                editField="heroImageUrl2"
                editKind="image"
                editLabel="second hero image"
                position={imagePositions['heroImageUrl2']}
                className="dc-hero-photo dc-hero-photo-r"
              />
            </div>
          </div>

          {/* Mobile-only 4-portrait horizontal scroll */}
          {officePhotos.length > 0 && (
            <ul
              className="lg:hidden mt-12 -mx-5 sm:-mx-8 px-5 sm:px-8 flex gap-3 overflow-x-auto snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none' }}
            >
              {officePhotos.slice(0, 4).map((p) => (
                <li key={p.id} className="shrink-0 snap-start w-48 sm:w-56">
                  <div
                    className="aspect-[4/5] w-full overflow-hidden"
                    style={{
                      borderRadius: '50%',
                      backgroundColor: BORDER,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.alt ?? ''}
                      className="w-full h-full object-cover"
                      style={p.position ? { objectPosition: p.position } : undefined}
                      loading="lazy"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pill carousel of services with visible prev/next arrows —
              Tend's qualifier strip just below the hero. Client component
              so the arrows can scroll the row by one page on click. */}
          {heroServicePills.length > 0 && (
            <div
              className="mt-12 sm:mt-14"
              data-edit-field="services"
              data-edit-kind="modal"
              data-edit-label="services"
            >
              <ServicePills
                pills={heroServicePills.map((s) => ({ id: s.id, name: s.name }))}
                brand={brand}
                ink={INK}
                href={`${basePath}/services`}
              />
            </div>
          )}
          {/* Studio-only affordance: with zero services there'd be nothing on
              the homepage to click to reach the services picker. Invisible to
              the public — the strip simply doesn't exist until services do. */}
          {heroServicePills.length === 0 && (
            <div
              className="dc-edit-only mt-12 sm:mt-14"
              data-edit-field="services"
              data-edit-kind="modal"
              data-edit-label="services"
            >
              <div
                className="rounded-2xl border-2 border-dashed text-center py-8 px-6 text-sm font-medium"
                style={{ borderColor: BORDER, color: INK_MUTED }}
              >
                + Add your services — pick from the library and they&rsquo;ll appear here,
                in your menu, and on their own pages.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Trust anchors — stat card right under the hero ─────────────── */}
      {stats.length > 0 && (
        <section
          className="pt-8 pb-20 sm:pt-10 sm:pb-24"
          data-edit-section="stats"
          data-edit-field="stats"
          data-edit-kind="modal"
          data-edit-label="trust stats"
        >
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                boxShadow: '0 1px 2px rgba(28, 26, 23, 0.04)',
              }}
            >
              {/* Stats grid: 2×2 on mobile (so a 4-stat card doesn't tower)
                  → 1×n on sm+ → unchanged on lg. Dividers track the layout:
                  vertical-between-cols always, horizontal-between-rows only
                  for the 4-stat 2×2 case. */}
              <ul
                className={`grid ${
                  stats.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : stats.length === 3
                      ? 'grid-cols-1 sm:grid-cols-3'
                      : stats.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-1'
                }`}
                style={{ borderColor: BORDER }}
              >
                {stats.map((s, i) => (
                  <ScrollReveal
                    as="li"
                    key={s.id}
                    delay={i * 90}
                    yOffset={14}
                    className="text-center px-6 py-7 sm:py-9"
                    style={{ borderColor: BORDER, listStyle: 'none' }}
                  >
                    <div
                      className="text-[34px] sm:text-5xl font-semibold leading-none mb-2 tracking-[-0.02em]"
                      style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                    >
                      {s.value}
                    </div>
                    <div
                      className="text-[13px] sm:text-sm leading-snug font-medium"
                      style={{ color: INK_MUTED }}
                    >
                      {s.label}
                    </div>
                  </ScrollReveal>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── Meet the team — clay-card photo slider sourced from staff photos ── */}
      {/* ALWAYS rendered so the section never "goes missing" in the Studio: with
          no staff yet it shows editor-only placeholder portraits (dc-edit-only
          on the whole section) inviting the clinic to add their team; the LIVE
          site hides it until real people are added — we never show empty/fake
          faces publicly. Editing staff updates this gallery + the About page. */}
      <section className={`pb-16 sm:pb-24${teamGalleryMembers.length === 0 ? ' dc-edit-only' : ''}`}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="text-center max-w-[640px] mx-auto mb-9 sm:mb-12">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-3"
              style={{ color: INK_MUTED }}
            >
              Meet the team
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em]"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
              data-edit-field="copy:home.teamGalleryTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'home.teamGalleryTitle', '') || (
                <>The faces behind {name}.</>
              )}
            </h2>
          </div>
          <div
            data-edit-field="staff"
            data-edit-kind="modal"
            data-edit-label="team photos"
          >
            {teamGalleryMembers.length > 0 ? (
              <TeamGallery members={teamGalleryMembers} brand={brand} ink={INK} surface={SURFACE} />
            ) : (
              <ul className="flex gap-6 sm:gap-7 overflow-x-auto pb-4 pt-2 sm:px-14 lg:justify-center" style={{ scrollbarWidth: 'none' }}>
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="snap-start shrink-0 w-[230px] sm:w-[248px]">
                    <figure
                      className="rounded-[30px] p-3.5 text-center"
                      style={{
                        backgroundColor: SURFACE,
                        boxShadow: '13px 13px 30px rgba(28,26,23,0.14), -10px -10px 24px rgba(255,255,255,0.78)',
                      }}
                    >
                      <div
                        className="relative overflow-hidden rounded-[22px] aspect-[4/5] mb-3.5"
                        style={heroPlaceholderStyle(brand, brandTint(brand, 0.1))}
                      >
                        <HeroPlaceholderMotif brand={brand} />
                      </div>
                      <figcaption className="px-1 pb-1">
                        <div className="font-semibold text-[15px] leading-tight" style={{ color: INK_MUTED }}>
                          Add a team member
                        </div>
                        <div className="text-[12.5px] mt-0.5 font-medium" style={{ color: INK_MUTED, opacity: 0.65 }}>
                          Their role
                        </div>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── "The {clinic} difference" — 2-col feature/checklist ────────── */}
      {/* Left: feature media — video when `differenceVideoUrl` is set
          (ambient autoplay loop, no controls), else an office photo that
          isn't already in the hero oval (never the hero image — see
          `differenceMediaUrl`). With NO media we render a designed brand-gradient
          bloom (like the empty hero ovals) so the section keeps its polished
          2-column layout instead of collapsing — the "add a video/photo" prompt
          is editor-only. Right: H2 + leadin + Book CTA + 2-col chip checklist.
          Mirrors Tend's "Tend Dental difference" block. */}
      <section className="py-14 sm:py-24" style={{ backgroundColor: SURFACE }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Media slot: the intro video, else an office photo — never the
                hero image (mirroring the hero here made every new upload look
                like it had "also set the video field"). With no media the box
                shows a designed bloom publicly + an add-prompt in the Studio. */}
            <ScrollReveal>
              <div
                className="overflow-hidden"
                style={{
                  borderRadius: '32px',
                  backgroundColor: brandTint(brand, 0.1),
                  aspectRatio: '4 / 3',
                }}
                data-edit-field="differenceVideoUrl"
                data-edit-kind="modal"
                data-edit-label="intro video"
              >
                {profile.differenceVideoUrl ? (
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    aria-hidden="true"
                  >
                    <source src={profile.differenceVideoUrl} />
                  </video>
                ) : differenceMediaUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={differenceMediaUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  // No media yet → a designed brand-gradient bloom so the section
                  // stays a polished 2-column layout (public); the prompt to add a
                  // video/photo only shows in the Studio (dc-edit-only).
                  <div className="relative w-full h-full" style={heroPlaceholderStyle(brand, brandTint(brand, 0.1))}>
                    <HeroPlaceholderMotif brand={brand} />
                    <div
                      className="dc-edit-only absolute inset-0 flex items-center justify-center text-center text-sm font-medium px-8"
                      style={{ color: INK_MUTED }}
                    >
                      🎬 Add a short intro video — or office photos — and we&rsquo;ll feature one here.
                    </div>
                  </div>
                )}
              </div>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                style={{ color: headingInk }}
              >
                Why us?
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:home.differenceTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'home.differenceTitle', '') || (
                  <>The {name} <strong className="italic font-semibold">difference</strong></>
                )}
              </h2>
              {profile.about ? (
                <p
                  className="text-lg leading-[1.55] mb-8"
                  style={{ color: INK }}
                  data-edit-field="about"
                  data-edit-kind="modal"
                  data-edit-label="intro"
                >
                  {firstSentence(profile.about)}
                </p>
              ) : (
                <p
                  className="dc-edit-only text-lg italic opacity-50 leading-[1.55] mb-8"
                  style={{ color: INK }}
                  data-edit-field="about"
                  data-edit-kind="modal"
                  data-edit-label="intro"
                >
                  Add a sentence about your practice…
                </p>
              )}
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 mb-8"
                style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
              >
                {bookLabel}
              </a>
              <ul
                className="grid sm:grid-cols-2 gap-3"
                data-edit-field="differenceChips"
                data-edit-kind="modal"
                data-edit-label="“Why us” highlights"
              >
                {differenceChips.map((chip, i) => (
                  <ScrollReveal as="li" key={`${chip}-${i}`} delay={(i % 2) * 70 + Math.floor(i / 2) * 50} yOffset={12}>
                    <span
                      className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: brandTint(brand, 0.15),
                        color: INK,
                        border: `1px solid ${brand}55`,
                      }}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: brand }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {chip}
                    </span>
                  </ScrollReveal>
                ))}
              </ul>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Studio-only: add-trust-stats prompt ─────────────────────────── */}
      {/* The team + reviews sections now carry their OWN in-place editor
          placeholders (so they're never "missing" in the Studio), so this strip
          is just the remaining stats prompt — shown only on the rare emptied-
          stats case (a fresh clinic ships with the starter stats). dc-edit-only,
          so the public never sees it. */}
      {stats.length === 0 && (
        <section className="dc-edit-only py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4 text-center"
              style={{ color: INK_MUTED }}
            >
              Finish your homepage
            </p>
            <div className="max-w-md mx-auto">
              <button
                type="button"
                className="w-full rounded-2xl border-2 border-dashed text-center py-7 px-5 text-sm font-medium"
                style={{ borderColor: BORDER, color: INK_MUTED }}
                data-edit-field="stats"
                data-edit-kind="modal"
                data-edit-label="trust stats"
              >
                + Add trust stats — years open, happy patients, and more.
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials — promoted to this slot (was: services pillars,
          deleted). Tend's verbatim: "Why people love {clinic}" left-aligned
          serif heading, prev/next arrows top-right, dark forest-teal cards
          with white quote text + gold stars + author bottom-right. The full
          services catalog lives on /services; the hero pill carousel keeps
          a name-only preview. */}
      {/* ALWAYS rendered (editor-only placeholder when empty) so the reviews
          section is never "missing" in the Studio; the live site hides it until
          the clinic features a real review — never a fabricated testimonial. */}
      <section
        id="reviews"
        className={`scroll-mt-20 py-16 sm:py-28${testimonials.length === 0 ? ' dc-edit-only' : ''}`}
        data-edit-section="testimonials"
        data-edit-field="testimonials"
        data-edit-kind="modal"
        data-edit-label="reviews"
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
          <h2
            className={`text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] ${showGoogleRating ? 'mb-4' : 'mb-10'}`}
            style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            data-edit-field="copy:home.testimonialsTitle"
            data-edit-kind="text"
            data-edit-label="headline"
          >
            {copyOverride(copyOverrides, 'home.testimonialsTitle', '') || (
              <>
                Why people love <strong className="italic font-semibold">{name}</strong>
              </>
            )}
          </h2>
          {/* The aggregate under the promise — the same live Google rating as
              the hero badge, tying the individual quotes below to the real
              overall number. Same honest gate. */}
          {showGoogleRating && (
            <div className="mb-10">
              <GoogleRatingBadge
                average={googleRating!.average!}
                count={googleRating!.count}
                headingInk={headingInk}
                variant="section"
              />
            </div>
          )}
          {testimonials.length > 0 ? (
            <TestimonialsCarousel testimonials={testimonials} brand={brand} />
          ) : (
            /* Editor-only preview card matching the real forest-teal testimonial
               cards — invites the clinic to feature a collected patient review. */
            <div
              className="rounded-[28px] px-8 py-12 sm:px-12 sm:py-16 max-w-[760px]"
              style={{ backgroundColor: 'var(--c-deep, #36514c)', color: 'var(--c-deep-ink, #FAF7F2)' }}
            >
              <div className="text-5xl leading-none mb-2" style={{ color: 'rgba(250,247,242,0.5)' }} aria-hidden="true">
                &ldquo;
              </div>
              <p className="text-lg sm:text-xl font-medium leading-[1.5]" style={{ color: 'rgba(250,247,242,0.88)' }}>
                Feature a patient review here — collect them under Reviews, then star your favorites to showcase them
                on your site.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Location — "Come meet us at…" with map + directions ─────────── */}
      {/* Connective-tissue band between social proof (testimonials) and
          the clinical-team trust grid. Keyless Google Maps iframe; the
          "Get directions" CTA deep-links into google.com/maps/dir so the
          visitor can launch turn-by-turn from their device of choice.
          Hides cleanly when the clinic has no address at all. */}
      {hasAddress && (
        <section id="location" className="scroll-mt-20 py-14 sm:py-24">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <ScrollReveal className="text-center max-w-[760px] mx-auto mb-10">
              <p
                className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: INK_MUTED }}
              >
                Visit us
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-4"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:home.locationTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'home.locationTitle', '') ||
                  (addrLine1
                    ? `Come meet us at ${addrLine1}`
                    : `Come meet us in ${[addrCity, addrState].filter(Boolean).join(', ')}`)}
              </h2>
              {addressOneLine && (
                <p className="text-base sm:text-lg leading-[1.55]" style={{ color: INK_MUTED }}>
                  {addressOneLine}
                </p>
              )}
            </ScrollReveal>
            <div className="max-w-[1000px] mx-auto">
              <iframe
                src={mapEmbedSrc}
                className="w-full h-[280px] sm:h-[360px] lg:h-[400px]"
                style={{ border: 0, borderRadius: '24px' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                title={`Map showing ${name}`}
              />
              <div className="text-center mt-8">
                <a
                  href={mapDirectionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                  style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
                >
                  Get directions
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
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Insurance — forest-teal band with carrier list + verifier ───── */}
      {/* Full-width band using the same forest-teal palette as the footer
          + testimonial cards so the section feels visually
          grouped with the trust signals. Left column lists accepted PPO
          carriers from the new clinic_profile.acceptedInsuranceCarriers
          jsonb column (or a calm "call to verify" copy when empty); right
          column is a 2-field request form that lands in /leads with
          sourcePage='insurance_verifier' so front desk can follow up. NOT
          a real eligibility check (no Eligible.com / payer-API hookup —
          we're explicit about that in the success message). */}
      <section
        className="relative overflow-hidden pt-20 pb-14 sm:pt-32 sm:py-24"
        style={{ backgroundColor: 'var(--c-deep, #36514c)', color: 'var(--c-deep-ink, #FAF7F2)' }}
      >
        {/* The light ground dips gently INTO the deep band — an organic seam
            instead of a hard horizontal cut. */}
        <ArcDivider />
        <GrainOverlay opacity={0.04} />
        <RippleMotif
          tint="#FFFFFF"
          opacity={0.05}
          className="absolute -right-40 -bottom-56 w-[560px] h-[560px]"
        />
        <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8">
          <ScrollReveal className="text-center max-w-[700px] mx-auto mb-12">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: 'rgba(250, 247, 242, 0.7)' }}
            >
              Insurance
            </p>
            <h2
              className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
              style={{ color: 'var(--c-deep-ink, #FAF7F2)', fontFamily: 'var(--font-display, Georgia, serif)' }}
              data-edit-field="copy:home.insuranceTitle"
              data-edit-kind="text"
              data-edit-label="headline"
            >
              {copyOverride(copyOverrides, 'home.insuranceTitle', '') || 'Dental insurance coverage'}
            </h2>
            <p
              className="text-base sm:text-lg leading-[1.55]"
              style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              data-edit-field="copy:home.insuranceIntro"
              data-edit-kind="text"
              data-edit-label="intro"
            >
              {copyOverride(copyOverrides, 'home.insuranceIntro', '') || (
                <>
                  We want dental care to feel easy. We work with most major dental
                  insurance plans and are happy to help you make the most of your benefits.
                </>
              )}
            </p>
          </ScrollReveal>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
            {/* Left: carriers */}
            <div
              data-edit-field="acceptedInsuranceCarriers"
              data-edit-kind="modal"
              data-edit-label="insurance carriers"
            >
              <h3
                className="text-xl sm:text-2xl font-semibold mb-3"
                style={{ color: 'var(--c-deep-ink, #FAF7F2)', fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Our insurance carriers
              </h3>
              {insuranceCarriers.length > 0 ? (
                <>
                  <p
                    className="text-sm sm:text-base leading-[1.55] mb-5"
                    style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                  >
                    We accept most major PPO dental plans, including these and more:
                  </p>
                  <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {insuranceCarriers.map((carrier) => (
                      <li
                        key={carrier}
                        className="flex items-start gap-2.5 text-[15px] leading-snug"
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
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
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>{carrier}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p
                    className="text-base leading-[1.55] mb-5"
                    style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                  >
                    Call us to verify your specific plan — we work with most major PPO
                    carriers.
                  </p>
                  {/* Universal reassurance list (no fabricated carrier names) so the
                      column doesn't sit empty against the tall form — the same
                      universal-default precedent as the payment methods + billing FAQ. */}
                  <ul className="space-y-2.5">
                    {[
                      'Most major PPO plans accepted',
                      'We help verify your coverage before your visit',
                      'We file insurance claims for you',
                    ].map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2.5 text-[15px] leading-snug"
                        style={{ color: 'var(--c-deep-ink, #FAF7F2)' }}
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
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Right: verifier form */}
            <div>
              <h3
                className="text-xl sm:text-2xl font-semibold mb-3"
                style={{ color: 'var(--c-deep-ink, #FAF7F2)', fontFamily: 'var(--font-display, Georgia, serif)' }}
              >
                Check your insurance
              </h3>
              <p
                className="text-sm sm:text-base leading-[1.55] mb-5"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Curious if your insurance will cover your exam? Drop us a note and
                we&apos;ll get back to you within one business day.
              </p>
              <div
                data-edit-field="insurance_verifier"
                data-edit-kind="modal"
                data-edit-label="insurance check form"
              >
                <InsuranceVerifierForm
                  slug={data.slug}
                  brand={brand}
                  carriers={insuranceCarriers.length > 0 ? insuranceCarriers : null}
                  services={services.length > 0 ? services.map((s) => s.name) : null}
                  fields={insuranceFormFields}
                />
              </div>
            </div>
          </div>
          {/* Auto-scrolling carrier badge marquee. Pure CSS @keyframes —
              renders the carrier set TWICE in the same flex track and
              translates 0 → -50% so the seam is invisible. Pause on
              hover, prefers-reduced-motion fallback to a static row.
              v1 uses text-only branded cards: Clearbit's free logo API
              (the obvious source) was deprecated/sunsetted, Wikipedia's
              CDN rate-limits our IP, and the open-source brand-asset
              repos don't carry US dental-PPO carriers. Text cards
              avoid hotlinking / trademark concerns entirely and read
              cleanly as "carriers we accept" badges. Hides entirely
              when there are no carriers configured. */}
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
                      style={{ color: 'var(--c-ink, #1C1A17)', fontFamily: 'var(--font-display, Georgia, serif)' }}
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

      {/* ── Care-that-puts-you-first trust band — heading + 4 callouts ──── */}
      {/* Always renders: the 4 callouts are universal anti-shame trust
          signals (no clinic data), so this is never an empty husk even on a
          brand-new clinic. The headings are copy-overridable in the Studio
          but ship with warm defaults. */}
      <section className="py-16 sm:py-24" style={{ backgroundColor: SURFACE }}>
        <div className="max-w-[1040px] mx-auto px-5 sm:px-8">
          <div className="text-center max-w-[680px] mx-auto mb-10 sm:mb-14">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
                  style={{ color: headingInk }}
                >
                  Care that puts you first
                </p>
                <h2
                  className="text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] mb-5"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  data-edit-field="copy:home.teamHeading"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'home.teamHeading', '') || (
                    <>A team that <strong className="italic font-semibold">truly listens.</strong></>
                  )}
                </h2>
                <p
                  className="text-lg leading-[1.55] mb-8"
                  style={{ color: INK_MUTED }}
                  data-edit-field="copy:home.teamBlurb"
                  data-edit-kind="text"
                  data-edit-label="text"
                >
                  {copyOverride(copyOverrides, 'home.teamBlurb', '') || (
                    <>
                      Modern dentistry with a gentler touch — the kind of dental visit
                      you&rsquo;ve been hoping for.
                    </>
                  )}
                </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-4 sm:gap-5 max-w-[860px] mx-auto text-left">
            {teamCallouts.map((c, i) => (
              <ScrollReveal
                as="li"
                key={c.title}
                delay={(i % 2) * 80 + Math.floor(i / 2) * 60}
                yOffset={16}
                className="group/callout flex items-start gap-5 p-6 sm:p-7 rounded-[20px] bg-white transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  border: `1px solid ${BORDER}`,
                  listStyle: 'none',
                  boxShadow: '0 1px 2px rgba(28,26,23,0.04), 0 16px 40px -32px rgba(28,26,23,0.35)',
                }}
              >
                <span
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/callout:scale-105"
                  style={{
                    backgroundImage: `radial-gradient(120% 120% at 30% 25%, ${brand}40 0%, ${brand}1C 72%)`,
                    boxShadow: `inset 0 0 0 1.5px ${brand}4D`,
                    color: headingInk,
                  }}
                  aria-hidden="true"
                >
                        <TeamCalloutIcon kind={c.icon} />
                      </span>
                      <div>
                        <h3
                          className="text-[18px] font-semibold mb-1.5"
                          style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
                          data-edit-field={`copy:home.callout.${i}.title`}
                          data-edit-kind="text"
                          data-edit-label="title"
                        >
                          {copyOverride(copyOverrides, `home.callout.${i}.title`, c.title)}
                        </h3>
                        <p
                          className="text-[15px] leading-[1.65]"
                          style={{ color: INK_MUTED }}
                          data-edit-field={`copy:home.callout.${i}.body`}
                          data-edit-kind="text"
                          data-edit-label="text"
                        >
                          {copyOverride(copyOverrides, `home.callout.${i}.body`, c.copy)}
                        </p>
                      </div>
                    </ScrollReveal>
                  ))}
                </ul>
          <div className="text-center mt-10">
            <a
              href={`${basePath}/about`}
              className="inline-flex items-center gap-1 text-sm font-semibold transition-all hover:gap-2"
              style={{ color: headingInk }}
            >
              Meet our team
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Blog — 3-card recent-posts preview ─────────────────────────── */}
      {/* Mirrors Tend's homepage blog band: a left-aligned heading with a
          "View all posts" CTA, then up to 3 recent published posts as
          cards (cover image · category · title · excerpt · Read more).
          Only renders when the clinic has published posts — same gate as
          the Blog nav link. */}
      {recentPosts.length > 0 && (
        <section className="py-16 sm:py-28">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-12">
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em]"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:home.blogTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'home.blogTitle', '') || 'From the blog'}
              </h2>
              <a
                href={`${basePath}/blog`}
                className="inline-flex items-center px-5 py-3 rounded-full text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
              >
                View all posts
              </a>
            </div>
            <div
              className={`grid gap-6 lg:gap-8 ${
                recentPosts.length === 1
                  ? 'max-w-md mx-auto'
                  : recentPosts.length === 2
                    ? 'sm:grid-cols-2 max-w-3xl mx-auto'
                    : 'sm:grid-cols-2 lg:grid-cols-3'
              }`}
              data-edit-field="blog"
              data-edit-kind="modal"
              data-edit-label="blog posts"
            >
              {recentPosts.slice(0, 3).map((post, i) => (
                <ScrollReveal as="article" key={post.id} delay={(i % 3) * 90} yOffset={18}>
                <a
                  href={`${basePath}/blog/${post.slug}`}
                  className="group flex h-full flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <div className="aspect-[16/10] overflow-hidden" style={{ backgroundColor: brandTint(brand, 0.08) }}>
                    {post.coverImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={post.coverImageUrl}
                        alt={post.coverImageAlt ?? ''}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-col flex-1 p-6">
                    {post.category && (
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
                        style={{ color: headingInk }}
                      >
                        {post.category}
                      </p>
                    )}
                    <h3
                      className="text-lg font-semibold leading-snug mb-3"
                      style={{ color: INK }}
                    >
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p
                        className="text-[14px] leading-[1.6] mb-4 line-clamp-3"
                        style={{ color: INK_MUTED }}
                      >
                        {post.excerpt}
                      </p>
                    )}
                    <span
                      className="mt-auto text-sm font-semibold inline-flex items-center gap-1"
                      style={{ color: headingInk }}
                    >
                      Read more →
                    </span>
                  </div>
                </a>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── "It's a pleasure" closing CTA banner ─────────────────────────── */}
      {/* Tend-verbatim composition: a WHITE rounded-3xl floating card sits
          on a forest-teal background dressed with a soft watercolor-style
          gradient blob overlay. The card pops down into the chartreuse
          chip strip below via a negative margin, so the strip reads as
          continuous with the card's lower edge — the exact transition
          Tend uses between the closer line and the dark footer. */}
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: 'var(--c-deep, #36514c)' }}
      >
        {/* Soft watercolor-ish texture: layered radial gradients in subtle
            white-on-teal create the same painted-pattern feel Tend uses
            behind their closer card, without shipping a raster texture. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 12% 18%, rgba(255,255,255,0.10) 0%, transparent 38%),' +
              'radial-gradient(ellipse at 82% 64%, rgba(255,255,255,0.08) 0%, transparent 42%),' +
              'radial-gradient(ellipse at 48% 88%, rgba(255,255,255,0.06) 0%, transparent 38%),' +
              'radial-gradient(ellipse at 90% 12%, rgba(255,255,255,0.05) 0%, transparent 30%)',
          }}
        />
        <div
          className="relative max-w-[1240px] mx-auto px-5 sm:px-8 pt-14 sm:pt-24"
          style={{ paddingBottom: 'calc(2.5rem + 32px)' }}
        >
          {/* Floating white card. -mb-16 below pulls its bottom edge into
              the chartreuse strip so they overlap, matching Tend's
              composition. */}
          <div
            className="relative overflow-hidden bg-white rounded-2xl sm:rounded-3xl px-6 sm:px-12 lg:px-16 py-8 sm:py-12 lg:py-14 -mb-12 sm:-mb-20"
            style={{ boxShadow: '0 24px 48px -16px rgba(28, 26, 23, 0.30)' }}
          >
            <RippleMotif
              tint={brand}
              opacity={0.09}
              className="absolute -right-24 -top-24 w-[340px] h-[340px]"
            />
            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
              <div className="lg:col-span-8">
                <h2
                  className="text-3xl sm:text-4xl lg:text-[52px] font-semibold leading-[1.1] tracking-[-0.015em]"
                  style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                  data-edit-field="copy:home.closerTitle"
                  data-edit-kind="text"
                  data-edit-label="headline"
                >
                  {copyOverride(copyOverrides, 'home.closerTitle', '') || (
                    <>
                      Care at {name} isn&apos;t just easy, it&apos;s{' '}
                      <strong className="italic font-semibold">a pleasure.</strong>
                    </>
                  )}
                </h2>
              </div>
              <div className="lg:col-span-4 lg:text-right">
                <a
                  href={bookHref}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                  style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}
                >
                  {bookLabel}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closer chartreuse chip strip ──────────────────────────────── */}
      {/* Same brand-derived strip (var --c-strip) + ink palette as the top
          strip. Tend repeats this strip between the closer card and the
          dark footer; the visual rhyme closes the page composition the
          same way it opened it. Pure CSS marquee — no client component
          needed. Sits in a higher stacking context (z-10) so the card
          above overlaps onto it via its -mb-16 pull-down. */}
      <div
        className="relative z-10 overflow-hidden"
        style={{ backgroundColor: 'var(--c-strip, #E7FB7E)', color: 'var(--c-strip-ink, #1C1A17)' }}
      >
        <div
          className="tend-marquee max-w-[1400px] mx-auto px-5 sm:px-8 h-11 sm:h-12 flex items-center"
          aria-hidden="true"
        >
          <ul
            className="tend-marquee-track flex items-center whitespace-nowrap shrink-0 text-[13px] sm:text-[14px] font-medium"
            style={{ gap: '2.5rem' }}
          >
            {[...closerChips, ...closerChips].map((chip, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-2 shrink-0"
                style={{ color: 'var(--c-strip-ink, #1C1A17)' }}
              >
                <SparkleGlyph className="shrink-0 opacity-60" color="var(--c-strip-ink, #1C1A17)" />
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <ul className="sr-only">
          {closerChips.map((chip, i) => (
            <li key={i}>{chip}</li>
          ))}
        </ul>
      </div>

      {/* ── Contact form — basic tier only ─────────────────────────────── */}
      {/* Pro/premium clinics route every Book CTA to the /book slot picker,
          so they don't need an on-page form (and Tend's homepage has none —
          booking is always the widget). Basic-tier clinics have no /book,
          so their Book CTAs anchor here to the contact form, which is their
          only inbound-request channel. */}
      {!isPro && (
        <section
          id="contact"
          className="py-16 sm:py-28"
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-8">
            <div className="max-w-[600px] mx-auto text-center">
              <p
                className="text-xs font-semibold uppercase tracking-[0.16em] mb-5"
                style={{ color: headingInk }}
                data-edit-field="copy:home.contactEyebrow"
                data-edit-kind="text"
                data-edit-label="eyebrow"
              >
                {copyOverride(copyOverrides, 'home.contactEyebrow', 'Get in touch')}
              </p>
              <h2
                className="text-3xl sm:text-4xl lg:text-[48px] font-semibold leading-[1.08] tracking-[-0.015em] mb-5"
                style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
                data-edit-field="copy:home.contactTitle"
                data-edit-kind="text"
                data-edit-label="headline"
              >
                {copyOverride(copyOverrides, 'home.contactTitle', "We'd love to see you.")}
              </h2>
              <p
                className="text-lg leading-[1.6] mb-10"
                style={{ color: INK_MUTED }}
                data-edit-field="copy:home.contactIntro"
                data-edit-kind="text"
                data-edit-label="text"
              >
                {copyOverride(copyOverrides, 'home.contactIntro', "Fill out the form and we'll be in touch to confirm your visit.")}
              </p>
              <div
                {...(!isPro
                  ? {
                      'data-edit-field': 'contact',
                      'data-edit-kind': 'modal',
                      'data-edit-label': 'contact form',
                    }
                  : {})}
              >
                <ContactForm
                  slug={data.slug}
                  brand={brand}
                  isPro={isPro}
                  basePath={basePath}
                  fields={contactFormFields}
                  services={services.length > 0 ? services.map((s) => s.name) : null}
                  carriers={insuranceCarriers.length > 0 ? insuranceCarriers : null}
                />
              </div>
            </div>
          </div>
        </section>
      )}

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
        signInUrl={signIn}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// heroPlaceholderStyle — build a brand-aware abstract for an EMPTY hero oval.
// Founder goal: a brand-new clinic with no photos should still look
// intentional, never like a flat colored blob. We layer soft brand-derived
// radial blooms (two offsets, low opacity) over the existing Tend pastel
// backdrop, so the shape reads as a designed gradient that ties to the
// clinic's identity. Pure CSS (no external assets, no stock photos), static
// (reduced-motion-safe by construction), and it only paints the SAME box —
// zero layout shift, and the with-photo path never touches it.
//
// `brand` is the clinic hex. The pastel `bg` stays the base so the warm
// palette survives on every brand color; the brand only tints the blooms.
function heroPlaceholderStyle(brand: string, bg: string): React.CSSProperties {
  // 8-digit hex alpha suffixes (e.g. `${brand}59` ≈ 35%). Brand may be any
  // 6-digit hex; if it isn't, the suffixes simply produce an ignored value and
  // the solid `bg` base still shows — safe degradation, no throw.
  return {
    backgroundColor: bg,
    backgroundImage: [
      `radial-gradient(120% 90% at 22% 18%, ${brand}59 0%, ${brand}1f 38%, transparent 70%)`,
      `radial-gradient(110% 80% at 82% 88%, ${brand}40 0%, transparent 64%)`,
      // A faint diagonal wash gives the surface depth without a second color.
      `linear-gradient(135deg, ${brand}14 0%, transparent 55%)`,
    ].join(', '),
  }
}

// HeroPlaceholderMotif — a subtle inline-SVG line motif drawn over the brand
// bloom so the empty oval has a touch of texture (concentric soft arcs, like
// a calm ripple). Server-renderable, decorative (aria-hidden), no dependency.
// Strokes use the brand color at very low opacity so it whispers, never shouts.
function HeroPlaceholderMotif({ brand }: { brand: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 200 250"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      <g stroke={brand} strokeOpacity={0.16} strokeWidth={1.5} fill="none">
        <circle cx={100} cy={125} r={48} />
        <circle cx={100} cy={125} r={78} />
        <circle cx={100} cy={125} r={108} />
      </g>
    </svg>
  )
}

// OvalPortrait — symmetric vertical-pill photo panel that flanks the hero
// + the clinical-team section's outer columns. Uses a pure `50%` ellipse
// over a 4/5 portrait aspect so both ends are equally rounded and the
// curvature reads as a soft wide-pill shape (smoother than the prior
// asymmetric pebble). Backdrops are the clinic-site palette's blue and
// peach (passed in by the parent), giving a Tend-style flat solid backing.
// When EMPTY *and* a `brand` is supplied, the backdrop upgrades to a
// brand-aware abstract gradient (heroPlaceholderStyle + motif) so a photo-less
// site still looks designed.
// ────────────────────────────────────────────────────────────────────────

function OvalPortrait({
  src,
  bg,
  brand,
  variant: _variant,
  editField,
  editKind = 'image',
  editLabel,
  position,
  priority = false,
  className,
}: {
  src: string | null
  bg: string
  /** Clinic brand hex — when set, the EMPTY state renders a brand-tinted
   *  abstract instead of a flat fill. Omit (e.g. on the team band) to keep the
   *  plain pastel backing. */
  brand?: string
  variant?: 'left' | 'right'
  /** When set, the panel becomes editable in the Website Studio. */
  editField?: string
  /** 'image' = click-to-replace a single column; 'modal' = open a section editor. */
  editKind?: 'image' | 'modal'
  editLabel?: string
  /** CSS object-position focal point, e.g. "50% 30%". */
  position?: string
  /** The hero LCP image — eager + high fetch priority; others stay lazy. */
  priority?: boolean
  /** Extra classes on the wrapper (e.g. the hero entrance choreography). */
  className?: string
}) {
  // Only the EMPTY state gets the brand abstract; a present photo covers the
  // box entirely, so the with-photo render stays pixel-identical to before.
  const empty = !src
  const brandPlaceholder = empty && brand
  return (
    <div
      className={`relative overflow-hidden w-full aspect-[4/5]${className ? ` ${className}` : ''}`}
      style={
        brandPlaceholder
          ? { borderRadius: '50%', ...heroPlaceholderStyle(brand, bg) }
          : { borderRadius: '50%', backgroundColor: bg }
      }
      {...(editField
        ? {
            'data-edit-field': editField,
            'data-edit-kind': editKind,
            ...(editLabel ? { 'data-edit-label': editLabel } : {}),
          }
        : {})}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          // Explicit intrinsic size + aspect-ratio sizing so the browser
          // reserves layout box (no CLS) while the oval clip does the shaping.
          width={512}
          height={640}
          className="absolute inset-0 w-full h-full object-cover"
          style={position ? { objectPosition: position } : undefined}
          // The left hero portrait is the LCP element — load it eagerly with
          // high priority. Every other portrait (right hero, team band) stays
          // lazy so it doesn't compete for the initial paint.
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
        />
      ) : (
        <>
          {/* Brand line-motif over the bloom (publicly visible, decorative). */}
          {brandPlaceholder ? <HeroPlaceholderMotif brand={brand} /> : null}
          {/* Empty oval. Publicly it stays a clean decorative shape (no
              broken-image, no alt). In the Studio (dc-edit-only) it surfaces a
              hint so the owner knows the empty oval is a click target for
              adding a hero photo. dc-edit-only flips display:block, so the
              centering lives on an inner element that stays absolutely
              positioned. */}
          {editField ? (
            <span className="dc-edit-only">
              <span
                className="absolute inset-0 flex items-center justify-center text-center px-6 text-[13px] font-semibold"
                style={{ color: 'rgba(28, 26, 23, 0.55)' }}
              >
                + Add a photo
              </span>
            </span>
          ) : null}
        </>
      )}
      {/* Hairline inner ring — a whisper of edge so a light photo never bleeds
          into the cream ground. Painted above the photo (inset shadows on the
          wrapper would hide under the absolutely-positioned img). */}
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(28,26,23,0.07)' }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// TeamCalloutIcon — tiny inline-SVG icons for the clinical-team callouts.
// Server-renderable, no icon-lib dependency. Each kind matches one of the
// 4 universal trust signals (experience / science / outcomes / safety).
// ────────────────────────────────────────────────────────────────────────

function TeamCalloutIcon({ kind }: { kind: string }) {
  const props = {
    className: 'w-6 h-6',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'experience':
      // Badge / shield with checkmark
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'science':
      // Beaker / flask
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M14.25 3.104v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-9.5-1.5h5m-7.122 3.5h9.244a2.25 2.25 0 002.121-2.997L17.5 9.5h-11l-1.243 4.003A2.25 2.25 0 007.378 16.5z" />
        </svg>
      )
    case 'outcomes':
      // Sparkle / star
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      )
    case 'safety':
      // Shield
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )
    default:
      return null
  }
}

