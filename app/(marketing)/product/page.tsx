import {
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  type ToneTileGlyph,
  PageHero,
  SectionOpener,
  MONO_LABEL,
  DAY_WIRE,
  DashboardMock,
  PortalMock,
  EditorMock,
  BookingMock,
  MessagesMock,
  ReviewsMock,
  RecallFunnelMock,
  ShopMock,
  GoogleSocialMock,
} from '@/components/marketing/ui'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import { DEMO_URL } from '@/lib/marketing/site'
import Link from 'next/link'
import ChapterRail from './chapter-rail'

/**
 * THE PRODUCT TOUR — `BRAND.md` Part 8 move 6, page 3.
 *
 * The longest page on the site (16,100px at 390 before this move) and the one
 * most likely to read as a wall: ten module sections, each a headline, a
 * paragraph, a product mock and six bullets, alternating left and right and
 * separated by identical `gray-100` hairlines. Nothing about it was wrong. It
 * was ten of the same thing in a row, which is the same failure the tone tiles
 * were built to fix, one altitude up — a page-level version of nine identical
 * ticks saying nothing nine times.
 *
 * SO THE MOVE HERE IS STRUCTURE RATHER THAN SKIN. Three decisions, in the
 * order they matter:
 *
 *  1. **The page is a numbered tour and now says so.** Every section opens on
 *     a chapter mark — the tone tile, `NN / 10` as a mono numeral, a dot, the
 *     eyebrow — and the numeral is the whole reason the page reads as ten of
 *     something rather than as an unbounded scroll. Part 4's veto is on the
 *     210px outlined ghost numeral, and the sentence that closes it names this
 *     exact alternative: *"A chapter number belongs in the eyebrow and the
 *     chapter rail, at reading size, where it is real text."* Both homes it
 *     names are now real.
 *  2. **The sticky nav became a chapter rail that answers "where am I".** It
 *     was ten grey pills that never changed; it is now mono micro-labels with
 *     the header's own active underline tracking the reader down the page. See
 *     `chapter-rail.tsx` — that is where the reasoning for the client boundary
 *     lives.
 *  3. **Hard left, one column, no alternation.** The old left/right swap was
 *     the page's only defence against monotony and it cost the thing Part 4
 *     asks for: on odd sections the heading started at the middle of the page.
 *     Now the chapter mark, the headline, the lede, the product and the spec
 *     list all start on the column the hero's headline starts on, and the
 *     rhythm is carried by the chapter head leading full width before the
 *     section splits — the screen on the left at seven columns (up from six),
 *     what is in it on the right at five.
 *
 *     A SPINE IN THE LEFT MARGIN WAS THE FIRST DRAFT AND IT IS WHY THIS SAYS
 *     "hard left" TWICE. A sticky three-column rail carrying the chapter mark
 *     beside its section looks good and reads well, and it moved every heading
 *     on the page ~180px right of the hero's. That is the pricing page's cost
 *     in a new costume — a structural column is a narrower container by
 *     another name — so the rail went to the top of the page, where it is
 *     chrome, and the chapter mark came back to the reading column.
 *
 * THE PAGE IS NOT SHORTER AND THAT IS NOT THE GOAL — 17,100px at 390 against
 * 16,100 before, because the spec block gained a header and the chapters gained
 * air. A wall is not a length problem; it is a "how much is left and where am
 * I" problem, and a tour you can see the shape of is navigable at any length.
 * The one thing that WOULD have shortened it is cutting content off the page a
 * visitor came to read.
 *
 * WHY THE MOCKS DO NOT BLEED OFF THE EDGE HERE, since Part 3 calls that the
 * signature move and this is the page with ten product mocks on it. The bleed
 * is a crop, and it is the right trade on a hero whose job is to say "this is
 * a real product" in one glance. It is the wrong trade on the page whose job
 * is showing the screens in full: cropping ten of them charges the reader the
 * exact thing they came for. The grid-break this page has instead is one of
 * proportion — the product column is wider than the reading measure — which is
 * Part 11's "the app is the picture" written as a layout fact.
 *
 * THE TWO-TIER SHAPE IS UNTOUCHED (Part 3, and the pricing page's note on the
 * same trap). Fifty-four bullets across ten sections is an INVENTORY: the tile
 * states the subject ONCE, on the chapter, and the rows take that chapter's
 * tone as a dash. A tile on all fifty-four rows is the identical mark the
 * owner vetoed, just prettier. What got louder is the group HEADER — a mono
 * label, a `DAY_WIRE` hairline and the section's real bullet count as a mono
 * numeral, computed rather than typed, for the reason the check-mark census
 * went stale twice.
 *
 * THE TONE VOCABULARY IS LOAD-BEARING AND THE LIST IS SHORT ENOUGH TO READ:
 * `brand` (teal) is what the product IS — the front desk, the website,
 * booking, the portal, messages; `growth` (emerald) is what it EARNS —
 * reviews, the shop and memberships; `auto` (violet) is what it does WITHOUT
 * YOU — the Google/social sync, recall, the PMS bridge. `rose` and `amber` are
 * withheld because they are the app's needs-attention colours and nothing on a
 * sales page is urgent; `fuchsia` is withheld because Part 2 gives it exactly
 * two homes and a module is neither. The tones come from
 * `lib/marketing/tone-tiles.ts` with the subject, never picked here.
 *
 * NO EMOJI ON THIS PAGE. Part 5 bans them in product mocks, and a tour that is
 * ten product mocks with captions is the same register — the glyphs INSIDE the
 * mocks (the birthday cake on a patient row, the `$` on an unpaid balance) are
 * the real product showing its own marks, which Part 0 decision 4 allows and
 * which this page renders unchanged. Delight here is light, alignment, type
 * and a rail that keeps its place.
 *
 * EVERY NUMBER IN A MOCK IS THE MOCK'S (Part 5). `$523`, `214 website visits`,
 * `4.9 · 128` and Dream Dental itself are illustrative and stay inside a
 * frame; nothing on this page states one of them in our own voice.
 */

export const metadata = {
  title: 'Platform tour — DreamCRM',
  alternates: { canonical: '/product' },
  description:
    'A deep dive through every module: the front-desk daily-ops layer, website studio, online booking, patient portal, unified messages, reviews & surveys, recall & loyalty, shop & memberships, and the PMS sync.',
}

interface ModuleSection {
  id: string
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  /* TIER B (`BRAND.md` Part 3). Ten sections × ~six bullets is fifty-four
     lines, and fifty-four tone tiles is wallpaper rather than fifty-four
     statements — the bullets under "Online booking" are all about online
     booking, which the eyebrow, the headline and the mock have already said
     three ways. So the tile states the section ONCE, in the chapter mark, and
     the bullets take that section's tone as a dash. */
  glyph: ToneTileGlyph
  docHref: string
  visual: 'dashboard' | 'portal' | 'editor' | 'booking' | 'messages' | 'reviews' | 'recall' | 'shop' | 'gbp'
}

const SECTIONS: ModuleSection[] = [
  {
    id: 'frontdesk',
    glyph: 'calendar',
    eyebrow: 'Run the day',
    title: 'The front desk’s whole morning on one screen',
    body: 'Every module above feeds a daily-ops layer built for the person at the desk. The Overview is a morning huddle — today’s chairs, who hasn’t confirmed, what came in overnight. The Appointments agenda groups the day the way the desk thinks and ages unconfirmed visits from green to red; a freed slot offers itself to your fast-pass waitlist before it goes empty. Follow-ups create themselves from balances, overdue recall, and unconfirmed visits, so nothing slips. And the money side is handled: booking deposits, online balance payments, patient-started payment plans with card-on-file autopay, and a collections workboard.',
    bullets: [
      'Morning-huddle Overview: today’s chair, attention cards, overnight activity',
      'Appointments agenda with aging edges + one-click confirm / reschedule / no-show',
      'Fast-pass waitlist: a cancelled slot fills itself before it goes empty',
      'Booking deposits (per visit type) that confirm the appointment on payment',
      'Self-running follow-ups from balances, recall, and unconfirmed visits',
      'Collections workboard + payment plans with card-on-file autopay',
    ],
    docHref: '/docs/managing-the-schedule',
    visual: 'dashboard',
  },
  {
    id: 'website',
    glyph: 'globe',
    eyebrow: 'The storefront',
    title: 'A practice website you actually control',
    body: 'Most practices rent their website from an agency and email support to change a sentence. Your DreamCRM site is yours: open the Website Studio and your real, live site appears in an editable canvas — hover any section, click Edit, save, published. Services come from a curated dental library with per-practice AI customization; the blog, SEO plumbing (sitemaps, local schema, social cards), careers page, and lead forms are all part of the same site.',
    bullets: [
      'Edit-in-place studio — change text, photos, services, and hours by clicking the page',
      'AI copy assistant with a monthly allowance included (manual editing is always free)',
      'Services library with detail pages, FAQs, and navigation that build themselves',
      'SEO dashboard reading real Google Search Console data',
      'Blog with AI-drafted posts you review before publishing',
      'Careers page with JobPosting schema — Google for Jobs indexes your openings free',
    ],
    docHref: '/docs/editing-your-website',
    visual: 'editor',
  },
  {
    id: 'booking',
    glyph: 'clock',
    eyebrow: 'Acquisition',
    title: 'Online booking that protects the schedule',
    body: 'Patients book from your real availability — office hours minus what is already on the books, in your timezone — on your public site and in the portal. The classic self-scheduling failure (a root canal booked into a 30-minute cleaning slot) is designed out: you choose which visit types are bookable online, and everything else routes to a phone call.',
    bullets: [
      'Live slot grid, double-booking impossible (the second patient is asked to re-pick)',
      'Visit-type rules and minimum-notice windows, set by you',
      'After-hours capture — bookings happen when your phones are off',
      'Confirmation emails carry your intake form automatically',
      'Every booking tagged with its source: website, portal, or front desk',
      'With your PMS connected, bookings push into it and cancellations clear the slot',
    ],
    docHref: '/docs/online-booking-rules',
    visual: 'booking',
  },
  {
    id: 'portal',
    glyph: 'people',
    eyebrow: 'Retention',
    title: 'A patient portal wearing your brand, not ours',
    body: 'Patients get a warm, mobile-first portal with your logo, your colors, your voice — not dental-software chrome. They confirm and self-reschedule visits, fill forms before they arrive, see their balance with an honest as-of date, pay online, and manage the whole family from one passwordless login. You control every feature with toggles where off means gone — no dead links — and preview the result as a patient before sharing it.',
    bullets: [
      'State-aware next-visit card: confirm → add to calendar → directions → reschedule',
      'Self-serve reschedule/cancel with your notice window ("call us" inside it)',
      'Passwordless sign-in links — portals die on forgotten passwords',
      'Family access: parents manage kids’ visits and forms from one login',
      'Online balance payments through your own Stripe account',
      'Per-feature toggles + welcome copy + announcement bar + preview-as-patient',
    ],
    docHref: '/docs/setting-up-the-patient-portal',
    visual: 'portal',
  },
  {
    id: 'messages',
    glyph: 'chat',
    eyebrow: 'Communication',
    title: 'Every patient conversation in one thread',
    body: 'Portal messages and patient email merge into a single conversation per patient, so the front desk answers people, not channels. Threads a patient is waiting on grow an aging edge from green to red — the inbox triages itself. Your practice Gmail connects too, with team triage for everything that isn’t a patient thread.',
    bullets: [
      'One thread per patient across portal + email',
      'Aging colors on unanswered inbound — nothing rots silently',
      'Reply templates for the three messages you send fifty times a week',
      'Connected Gmail inbox with assignment and resolve states',
      'Patient-facing email sends from your practice identity, not ours',
    ],
    docHref: '/docs/messages-and-your-inbox',
    visual: 'messages',
  },
  {
    id: 'reviews',
    glyph: 'star',
    eyebrow: 'Reputation',
    title: 'Reviews collected at the right moment',
    body: 'After a good visit, send a one-tap review request. The patient writes their words on your page; you choose which become testimonials on your website — their exact words, never edited — and they’re invited onward to Google where public reputation compounds. Same ask to every patient, no rating-gating: clean under the FTC’s fake-reviews rule.',
    bullets: [
      'Text-first review capture you own, with Google/Healthgrades/Facebook share-on',
      'One-click feature/unfeature onto your website’s testimonial section',
      'Ready-to-ask list driven by completed visits',
      'Post-visit 0–10 NPS surveys with detractor escalation to the owner',
      'Per-patient rate limiting so nobody gets over-asked',
    ],
    docHref: '/docs/reviews-collection',
    visual: 'reviews',
  },
  {
    id: 'gbp',
    glyph: 'megaphone',
    eyebrow: 'Local presence',
    title: 'Your Google profile and socials, run from one place',
    body: 'Connect your Google Business Profile in a couple of clicks and the real reviews patients leave sync in — reply from your dashboard, and your live star rating shows on your website. The same connection keeps your Google hours, address, and photos in step with your site and surfaces your local search performance on the SEO and Analytics pages. Then compose once and publish — or schedule — to Google, Instagram, Facebook, TikTok, YouTube, and LinkedIn from a single composer with a content calendar.',
    bullets: [
      'Real Google reviews sync in — reply in one place; they drive your site’s rating',
      'Facebook recommendations alongside them, with a reply link-out',
      'Google hours, address, and photos keep your site current automatically',
      'Local performance — impressions, calls, directions — on SEO + Analytics',
      'One composer → Google, Instagram, Facebook, TikTok, YouTube, LinkedIn',
      'Schedule ahead and see everything on a content calendar',
    ],
    docHref: '',
    visual: 'gbp',
  },
  {
    id: 'recall',
    glyph: 'bolt',
    eyebrow: 'Reactivation',
    title: 'Recall that fills chairs, measured honestly',
    body: 'Audiences build themselves from live patient data — due, overdue, lapsed, birthdays — and stay current without list maintenance. Warm templates go out by email with booking links, and the funnel reports what matters: not opens, but visits actually booked. If your PMS is connected, its recall engine drives the due dates.',
    bullets: [
      'Self-maintaining audiences from lifecycle + recall status',
      'System templates with your voice: reactivation, birthday, welcome',
      'Sent → Opened → Clicked → Booked attribution to real appointments',
      'Loyalty program + refer-a-friend with booking attribution',
      'Broadcast a segment-picked message from the inbox in one shot',
      'One-click unsubscribe honored everywhere automatically',
    ],
    docHref: '/docs/recall-campaigns',
    visual: 'recall',
  },
  {
    id: 'shop',
    glyph: 'cart',
    eyebrow: 'New revenue',
    title: 'A shop and membership plans nobody else ships',
    body: 'Sell whitening kits, electric brushes, and branded merch from your own website, and run in-house membership plans (the uninsured-patient answer) with benefit tracking. Payments run through your own Stripe account — payouts land in your bank, not ours. No orbital-layer competitor ships a storefront; this is yours alone in the category.',
    bullets: [
      'Product catalog with variants, inventory, pickup or flat-rate shipping',
      'Membership plans billed monthly or annually, with benefit usage tracking',
      'Birthday coupons and promo codes',
      'Stripe Connect: your account, your payouts, your Stripe dashboard',
      'Order pipeline from paid to picked-up/shipped',
    ],
    docHref: '/docs/setting-up-your-shop',
    visual: 'shop',
  },
  {
    id: 'integrations',
    glyph: 'sync',
    eyebrow: 'The foundation',
    title: 'PMS sync through official, sanctioned paths — only',
    body: 'DreamCRM wraps your PMS; it never replaces it and never sneaks behind it. One bridge reaches Open Dental, Dentrix, Eaglesoft, and most other systems — we set it up with you in a short server install. Patients, appointments, providers, insurance, and family links flow in; bookings and cancellations flow back; everything moves through official, sanctioned paths. Open Dental has publicly cautioned its customers about vendors writing directly into its database; we built the kind of integration they recommend instead.',
    bullets: [
      'One bridge for Open Dental, Dentrix, Eaglesoft + more — set up with you, free',
      'Two-way: imports patients/visits/insurance/family, pushes bookings + cancellations',
      'Transparent field map on the integration page: exactly what reads and writes',
      'Sync-health monitoring with proactive alerts — never silent failure',
      'Charts, procedures, and claims never move; clinical data stays in the PMS',
      'Online booking offers your real open times, straight from the PMS schedule',
    ],
    docHref: '/docs/connecting-your-pms',
    visual: 'dashboard',
  },
]

/**
 * The rail's chapters, derived from the sections themselves rather than typed
 * beside them. An eleventh module is in the rail the day it is in the tour —
 * the tone-tile census lesson (Part 8 move 3) applied to a nav.
 */
const CHAPTERS = SECTIONS.map((s) => ({ id: s.id, label: s.eyebrow }))

// Exhaustive by construction: a new section's `visual` value won't compile
// until it has a mock here (the old ternary chain silently fell through).
const VISUALS: Record<ModuleSection['visual'], React.ReactNode> = {
  dashboard: <DashboardMock />,
  portal: (
    <div className="flex justify-center py-2">
      <PortalMock />
    </div>
  ),
  editor: <EditorMock />,
  booking: <BookingMock />,
  messages: <MessagesMock />,
  reviews: <ReviewsMock />,
  recall: <RecallFunnelMock />,
  shop: <ShopMock />,
  gbp: <GoogleSocialMock />,
}

/* TIER A (`BRAND.md` Part 3): every card here is a different KIND of thing, so
   every card earns its own tile. That is the opposite call from the bullets
   above and it is the same rule — a mark has to say something, and nine
   different subjects are nine different statements. */
const ALSO: Array<[ToneTileGlyph, string, string]> = [
  ['form', 'Digital intake forms', 'Photo & insurance-card fields, OCR autofill, AI pre-visit summary, Spanish, kiosk mode, and an OD chart mirror.'],
  ['cart', 'Membership plans', 'In-house plans for the uninsured — monthly or annual, with benefit-usage tracking and a portal upsell.'],
  ['money', 'Payment plans', 'Patient-started installments with card-on-file autopay, retries, and a collections workboard.'],
  ['people', 'Careers + ATS', 'Public job postings with JobPosting schema (Google for Jobs) and a hiring pipeline.'],
  ['chart', 'Practice analytics', 'A scorecard of new patients, retention, reputation, and search — measured against the prior window.'],
  ['gift', 'Loyalty + referrals', 'Points for visits and a refer-a-friend link with booking attribution baked in.'],
  ['globe', 'Custom domains', 'Point your own domain at your DreamCRM site with managed SSL.'],
  ['key', 'Family access', 'One passwordless login runs the whole household’s visits, forms, and balances.'],
  ['shield', 'Honest by default', 'Published pricing, month-to-month, official APIs only, and every gap marked before you buy.'],
]

/** Part 3's card step (14px) with the emission shadow — depth is light spilling
 *  out from under a raised object, never a hard-edged drop shadow. */
const CARD_LIFT =
  'shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]'

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="Platform tour"
        title="One system for the whole front office, zero copy-paste between the parts"
        sub="Because it's one product, the modules compound: a website lead becomes a patient record, the patient gets a portal, the visit triggers a review request, the recall campaign knows who's overdue, and the front desk sees all of it on one morning screen — automatically."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
          <GhostCta href={DEMO_URL} external>
            Browse the demo practice ↗
          </GhostCta>
        </div>
      </PageHero>

      <ChapterRail chapters={CHAPTERS} />

      {/* ── THE TEN CHAPTERS ──────────────────────────────────────────────
             One `max-w-6xl` column, hard left, no alternation. Every section
             on this page uses this container and no other, so every hard-left
             edge lands where the hero's headline starts — the move-6 rule the
             pricing page paid for ("narrow the LIST, not the container"). ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {SECTIONS.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="scroll-mt-[7rem] border-b py-14 last:border-b-0 lg:py-20"
            style={{ borderColor: DAY_WIRE }}
          >
            {/* ── THE CHAPTER MARK, HARD LEFT ──────────────────────────
                   The tile, the chapter numeral and the eyebrow, on the
                   same column the hero's headline starts on — and so is
                   everything under it. The gradient rule that leads a
                   `PageHero` eyebrow is deliberately absent here: Part 2
                   gives fuchsia exactly two homes, and ten gradient marks
                   down one page is precisely the dilution that rule exists
                   to stop. The rail above carries one, on the chapter you
                   are actually in. ── */}
            <div className="flex items-center gap-3">
              <ToneTile glyph={s.glyph} size="lg" />
              {/* Computed, never typed — a number written by hand goes stale
                  silently, and this repo has watched one do it twice
                  (Part 8 move 3). */}
              <p className={`text-gray-500 ${MONO_LABEL}`}>
                <span aria-hidden="true">
                  {String(i + 1).padStart(2, '0')} / {SECTIONS.length}
                </span>
                <span className="sr-only">
                  Chapter {i + 1} of {SECTIONS.length}
                </span>
              </p>
              <span className="h-1 w-1 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />
              <p className={`min-w-0 text-teal-700 ${MONO_LABEL}`}>{s.eyebrow}</p>
            </div>

            <h2 className="mt-4 max-w-3xl text-[1.7rem] font-bold leading-tight tracking-[-0.02em] text-gray-950 sm:text-[2.1rem]">
              {s.title}
            </h2>
            {/* The reading MEASURE is constrained, never the container — the
                move-6 rule the pricing page paid for. */}
            <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-gray-600">
              {s.body}
            </p>
            {s.docHref && (
              <Link
                href={s.docHref}
                className="group mt-5 inline-flex items-center gap-2 text-[0.88rem] font-semibold text-teal-700"
              >
                <span className="group-hover:underline">Read the setup doc</span>
                {/* 150ms ease-out, compositor-only, no overshoot — Part 6's
                    interaction band. The arrow leans toward the doc. */}
                <span
                  aria-hidden="true"
                  className="transition-transform duration-150 ease-out group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            )}

            {/* ── THE EVIDENCE AND THE SPEC ────────────────────────────
                   The screen on the left, what is in it on the right —
                   seven columns to the product, five to the list. Part 11:
                   the app is the picture, and on this page that is a
                   layout fact rather than a sentence. ── */}
            <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-7">
                <ScrollReveal>{VISUALS[s.visual]}</ScrollReveal>
              </div>

              {/* ── TIER B: the subject is stated once, on the chapter mark
                     above; these rows take that chapter's tone as a dash. ── */}
              <div className="lg:col-span-5">
                <div
                  className="flex items-center gap-3 border-b pb-3"
                  style={{ borderColor: DAY_WIRE }}
                >
                  <h3 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>What’s included</h3>
                  <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                    <span aria-hidden="true">{String(s.bullets.length).padStart(2, '0')}</span>
                    <span className="sr-only">{s.bullets.length} included</span>
                  </p>
                </div>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-1">
                  {s.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-3 text-[0.875rem] leading-snug text-gray-700"
                    >
                      <ToneDash glyph={s.glyph} className="mt-[0.45rem]" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* ── EVERYTHING ELSE IN THE BOX ────────────────────────────────────
             The one band on the page, on the ticker's `surface-1` with
             `DAY_WIRE` edges — opaque, painted over the ground, so no bloom
             reaches its ink. It sits here on purpose: after ten chapters the
             page needs a change of surface more than it needs an eleventh
             hairline. ── */}
      <section className="border-y bg-[#F8FAFF]" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionOpener
            eyebrow="And so much more"
            title="The parts that don’t need their own tour"
            lede="Deep systems that ride along with the modules above — no add-on line items, all in the same flat price."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ALSO.map(([glyph, title, body]) => (
              <div
                key={title}
                className={`rounded-[14px] border bg-white p-5 transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_2px_6px_-2px_rgb(58_103_217/0.18),0_26px_54px_-32px_rgb(58_103_217/0.6)] ${CARD_LIFT}`}
                style={{ borderColor: DAY_WIRE }}
              >
                <h3 className="flex items-center gap-2.5 text-[0.95rem] font-bold text-gray-950">
                  <ToneTile glyph={glyph} size="md" />
                  {title}
                </h3>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             It opens with a 36px gradient rule under the header and closes
             with the same mark, so the brand's three hues are the first and
             last thing on the page. The same shape the pricing page closes
             on; deliberately not a second panel, and deliberately not a
             second dark slab above the `gray-950` footer. ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            End of the tour
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Ten minutes from signup to a live website.
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Everything you just read is live in the product today — one plan, one price,
            month-to-month. Run it on your own practice for a week before you decide.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/pricing">See pricing</GhostCta>
          </div>
          {/* The hero's trust row, arriving on this page: mono, dot
              separators, no mark at all. Part 3 — "every mark says
              something", and four tiles here would be four statements the
              tour has already made. The module count is computed. */}
          <div className={`mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
            {[
              `${SECTIONS.length} modules, one product`,
              '7 days free',
              'No card to start',
              'Month-to-month',
            ].map((t, i) => (
              <span key={t} className="flex items-center gap-3">
                {i > 0 && <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />}
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
