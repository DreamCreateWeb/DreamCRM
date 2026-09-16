import {
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  PageHero,
  SectionOpener,
  MONO_LABEL,
  DAY_WIRE,
  type ToneTileGlyph,
} from '@/components/marketing/ui'
import { JsonLd, faqPageLd, softwareApplicationLd } from '@/lib/marketing/seo'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { PriceCard } from './price-card'

/**
 * THE PRICING PAGE — `BRAND.md` Part 8 move 6, page 1.
 *
 * Move 4 gave every subpage a Daylight `PageHero`; this is the first page whose
 * own BODY comes across, and pricing went first on purpose: it is the honest
 * test of whether the language survives a table. A brand book that only works
 * on hero sections is a brand book for hero sections.
 *
 * WHAT CARRIES THE LANGUAGE HERE, none of it new vocabulary:
 *
 *  - **Hard left** (Part 4). The centred SectionTitle is gone from this page in
 *    favour of the `Eyebrow` + heading pair the homepage's "Honest by default"
 *    section already uses — so every section opens with the mono micro-label
 *    and the reading column starts where the hero's does.
 *  - **The price panel breaks the section seam** (Part 3's grid-break, in the
 *    only form this page has one). It is pulled UP into the hero's light rather
 *    than floating in dead white a screen below it, which is what the old
 *    centred card did. The panel is opaque, so no reading text moves onto the
 *    bloom — the hero's own measured runs (Part 7, the DREAMCRM-72 table) are
 *    the only ink on a decorative layer on this page, and move 6 re-derived
 *    them against THIS page rather than trusting the component's.
 *  - **`surface-1` and `DAY_WIRE`** instead of `gray-50` and `gray-100`: the
 *    daylight ground and the daylight hairline, the same pair the ticker and
 *    the chrome carry.
 *  - **Part 3's radius ladder** — 14px cards, 12px tiles, 10px controls, and
 *    nothing is a pill that is not an eyebrow badge or a status chip.
 *
 * NO EMOJI ON THIS PAGE. Part 5's reversal on DREAMCRM-56 turned the ban into
 * a usage rule and left pricing on the never list by name. Delight here is
 * light, alignment and type — not a glyph.
 *
 * EVERY NUMBER ON THE PAGE IS REAL. The price resolves from
 * `lib/stripe-config.ts` (see the metadata note below); the per-group counts in
 * the inventory are `rows.length`, computed rather than typed, so they cannot
 * go stale the way the check-mark census did — twice — while a sentence claimed
 * otherwise.
 */

/**
 * THE PRICE IS RESOLVED, NEVER TYPED — DREAMCRM-38's rule, which exists
 * because three surfaces had each drifted to quoting the $500 LIST price for a
 * plan that costs $200. This page is the loudest place that could happen, and
 * it was the last one still holding its own copy of the four numbers.
 *
 * It is read at module scope because `metadata` is a const and the founding
 * rate is part of the page's description. `getQuotedPlan()` is pure config —
 * no database, no Stripe call — so this costs nothing at render.
 */
const PLAN = getQuotedPlan()
const PRICE = {
  rateMonthly: PLAN.price,
  rateAnnual: PLAN.annualPrice,
  listMonthly: PLAN.listPrice ?? null,
  listAnnual: PLAN.listAnnualPrice ?? null,
}

/**
 * The single-plan feature list — mirrors the real module surface of the
 * product. One column, everything included: the tier matrix retired
 * 2026-07-19 when pricing collapsed to the founding practice rate.
 */
/* TIER B (`BRAND.md` Part 3). Twenty-six rows across four groups is an
   INVENTORY, and a tone tile on every row of an inventory is wallpaper — the
   same nothing-said-many-times that made the tick bland in the first place.
   So the tile states the subject ONCE, on the group heading where it is
   actually news, and the rows take that group's tone as a dash. The reader
   still knows which domain they are in on every line; they are just not told
   it twenty-six times.

   MOVE 6 DID NOT TOUCH THAT SHAPE, and the temptation to was real: the
   two-tier list is the quietest thing on a page the move is meant to make
   louder. But a tile on all 26 rows is the identical mark the owner vetoed,
   just prettier (Part 0 item 10), so what got louder is the group HEADER — a
   mono micro-label, a hairline under it, and the group's real row count as a
   mono numeral — while the rows stay exactly as legible as they were. */
const INCLUDED: Array<{ group: string; glyph: ToneTileGlyph; rows: string[] }> = [
  {
    group: 'Website & brand',
    glyph: 'globe',
    rows: [
      'Practice website on your address',
      'Edit-in-place Website Studio',
      'AI copy assistant (monthly allowance)',
      'Contact + insurance-check lead capture',
      'SEO foundations (sitemap, schema, social cards)',
      'Blog + AI-drafted posts',
      'SEO dashboard (Google Search Console data)',
      'Careers page + applicant tracking',
    ],
  },
  {
    group: 'Front office',
    glyph: 'calendar',
    rows: [
      'Patient records with action flags',
      'Appointments agenda + reminders',
      'Online booking from live availability',
      'Website leads triage queue',
      'Unified patient messages',
      'Connected Gmail inbox',
      'Digital intake forms',
    ],
  },
  {
    group: 'Patient experience',
    glyph: 'people',
    rows: [
      'Clinic-branded patient portal',
      'Self-serve reschedule & cancel',
      'Family access (one login per household)',
      'Review collection + website testimonials',
      'Google reviews sync + reply',
    ],
  },
  {
    group: 'Growth & integrations',
    glyph: 'megaphone',
    rows: [
      'Recall & outreach campaigns',
      'Google Business sync + social posting',
      'Practice analytics',
      'Online shop + membership plans',
      'Online balance payments (via Stripe Connect)',
      'Open Dental two-way sync (official API)',
    ],
  },
]

/* THE FAQ QUOTES THE CONFIG TOO, and that is the half of DREAMCRM-38's rule
   that is easiest to leave undone. Three of these answers carry the price in
   PROSE, a few hundred pixels below a panel that resolves it — so a reprice
   that swapped the panel's numbers and left these alone would put two
   different prices on the same page, under a heading that says "answered
   straight". Prose is exactly where a stale number survives longest, because
   nothing about it looks like configuration. */
const PRICING_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Do I have to pay to try it?',
    a: 'No. Every practice starts with a 7-day free trial of everything — website, booking, portal, messaging, reviews, marketing, all of it — with no credit card required. You add billing only when you decide to stay.',
  },
  {
    q: 'Is there a contract or setup fee?',
    a:
      'No. It’s month-to-month with no setup fee, and you can cancel anytime — your ' +
      `website content exports with you. Prefer annual? Pay for 10 months, get 12: ${usd(PRICE.rateAnnual)}/year.`,
  },
  {
    q: `Why is the price ${usd(PRICE.rateMonthly)} instead of ${usd(PRICE.listMonthly ?? PRICE.rateMonthly)}?`,
    a:
      'We’re building our founding group of practices, and their feedback shapes what we ' +
      `build next. Founding practices get the whole platform at ${usd(PRICE.rateMonthly)}/mo, and the ` +
      'rate stays locked for as long as you’re a subscriber — new modules land on the same price.',
  },
  {
    q: 'What does Open Dental access cost on their side?',
    a: 'Open Dental bills API access for your office (around $30/mo, paid to Open Dental). That fee is theirs, not ours — we surface it up front because surprise line items are how trust dies.',
  },
  {
    q: 'Do you take a cut of my shop or membership revenue?',
    a: 'Shop and membership payments run through your own Stripe account and pay out to your bank. Stripe charges its standard processing fees; your subscription covers the platform.',
  },
  {
    q: 'What about texting (SMS)?',
    a: 'Patient-facing email is live today (sent from your practice identity). Two-way SMS is on our roadmap but not available yet — it needs a regulated carrier-registration process we haven’t completed. We won’t sell it before it works.',
  },
  {
    q: 'How many social accounts can I connect?',
    a: 'Connecting your Google Business profile is free and never counts against a limit. For social platforms (Instagram, Facebook, TikTok, YouTube, LinkedIn), two connected accounts are included; if you want more, there’s a flat $20/mo add-on for up to five. It’s published here, same as everything else.',
  },
  {
    q: 'Is my data locked in?',
    a: 'No. Your PMS remains the system of record for clinical data, your website content is exportable, and leaving is a cancellation, not a migration project.',
  },
]

export const metadata = {
  title: 'Pricing — DreamCRM',
  alternates: { canonical: '/pricing' },
  description:
    `One plan, everything included: ${usd(PRICE.rateMonthly)}/mo founding practice rate` +
    `${PRICE.listMonthly ? ` (regularly ${usd(PRICE.listMonthly)})` : ''}. ` +
    'Website, booking, portal, messaging, reviews, recall, shop, PMS sync. ' +
    `Month-to-month, no contract — or annual with 2 months free (${usd(PRICE.rateAnnual)}/year).`,
}

/* `SectionOpener` moved to `components/marketing/ui.tsx` on move 6 page 2
   (DREAMCRM-76). It was local here on purpose while ONE page wanted the shape;
   the second page to want it is the moment two private copies of a heading
   recipe become the drift this direction is supposed to prevent. The component
   is unchanged — same measurements, same `Eyebrow`, same reading measure. */

export default function PricingPage() {
  return (
    <>
      <JsonLd data={faqPageLd(PRICING_FAQS)} />
      <JsonLd data={softwareApplicationLd([{ name: 'DreamCRM', price: PRICE.rateMonthly }])} />
      <PageHero
        eyebrow="Pricing"
        title="One plan. The whole platform."
        sub="No tiers, no discovery calls, no per-feature add-ons. Everything DreamCRM does, one published price."
      />

      {/* ── THE PRICE PANEL, BREAKING THE SEAM ────────────────────────────
             `BRAND.md` Part 3's grid-break, in the form this page has one: the
             panel is pulled UP into the hero band's light instead of floating
             in dead white below it. `relative z-10` is what puts it over the
             hero — the hero is `relative` at z-auto, so a positioned sibling
             paints above it without either one needing a z-index war.

             IT COSTS NO CONTRAST. The panel is an opaque `bg-white` card, so
             every run inside it rides white at its flat ratio no matter what
             the bloom behind it is doing; the only ink on a decorative layer on
             this page is still the hero's own, and move 6 re-measured those
             against THIS page (Part 7). ── */}
      <section className="relative z-10 mx-auto -mt-4 max-w-6xl px-4 sm:px-6 lg:-mt-10">
        <PriceCard {...PRICE} />
        <p className="mt-6 max-w-xl text-[0.9rem] leading-relaxed text-gray-600">
          Everything below is live in the product today — not a roadmap. New modules
          ship regularly, and they land on your plan at no extra cost.
        </p>
      </section>

      {/* ── THE INVENTORY — the table the language had to survive ───────── */}
      <section className="mt-16 border-y bg-[#F8FAFF] lg:mt-20" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionOpener
            eyebrow="Everything included"
            title="The whole product, on one line item"
            lede="The real module list, mirrored one-to-one — nothing hidden behind a sales call, nothing gated behind a bigger plan."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {INCLUDED.map((group) => (
              <div
                key={group.group}
                className="group rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
                style={{ borderColor: DAY_WIRE }}
              >
                <div
                  className="flex items-center gap-3 border-b pb-4"
                  style={{ borderColor: DAY_WIRE }}
                >
                  <ToneTile glyph={group.glyph} size="lg" />
                  <h3 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>{group.group}</h3>
                  {/* The group's real row count, as a mono numeral. Computed,
                      so it cannot drift away from the list beneath it the way
                      a number written in prose does. */}
                  <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                    <span aria-hidden="true">{String(group.rows.length).padStart(2, '0')}</span>
                    <span className="sr-only">{group.rows.length} included</span>
                  </p>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {group.rows.map((row) => (
                    <li
                      key={row}
                      className="flex items-start gap-3 text-[0.875rem] leading-snug text-gray-700"
                    >
                      <ToneDash glyph={group.glyph} className="mt-[0.45rem]" />
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE QUESTIONS ────────────────────────────────────────────────── */}
      {/* Every section on this page is `max-w-6xl`, so every hard-left edge
          lands on the same column as the hero's headline — Part 1's "precise"
          is measured alignment now that the drawn grid is vetoed, and a
          narrower CONTAINER here would have shifted this whole block inward by
          ~110px at 1440. The reading measure is constrained on the list
          instead, which is the thing that actually wanted to be narrow. */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionOpener
          eyebrow="Straight answers"
          title="Pricing questions, answered"
          lede="Including the ones with an awkward answer. The gaps are marked here for the same reason the price is: you find out before you buy, not after."
        />
        <div className="max-w-3xl space-y-2.5">
          {PRICING_FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-[14px] border bg-white px-5 py-4 transition-shadow duration-150 ease-out open:shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
              style={{ borderColor: DAY_WIRE }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold text-gray-950 [&::-webkit-details-marker]:hidden">
                {f.q}
                {/* 12px tile, Part 3's small-tile step — the same `teal-50` /
                    `teal-700` affordance the homepage pillars carry, not a new
                    recipe. The turn is 200ms ease-out: Part 6's interaction
                    band, and no spring overshoot, which is the dashboard's
                    register and reads as bounce here. */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-teal-50 text-[1.05rem] font-bold leading-none text-teal-700 transition-transform duration-200 ease-out group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[0.9rem] leading-relaxed text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             It opens with a 36px gradient rule under the header and closes
             with the same mark, so the brand's three hues are the first and
             last thing on the page. Deliberately NOT a second dark panel: the
             footer directly below is already `bg-gray-950`, and two dark slabs
             stacked is what "the light ENDS here" stops being. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Start today
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Run it for a week before you decide.
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Seven days of the whole platform on your own practice — your website, your
            booking page, your patients. No card, and nothing to cancel if you walk away.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/compare">See how we compare</GhostCta>
          </div>
          {/* The hero's trust row, arriving on this page: mono, dot separators,
              no mark at all. Part 3 — "every mark says something", and four
              tiles here would be four statements the price has already made. */}
          <div className={`mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
            {['7 days free', 'No card to start', `${usd(PRICE.rateMonthly)}/mo after, flat`, 'Month-to-month'].map(
              (t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />}
                  {t}
                </span>
              ),
            )}
          </div>
        </div>
      </section>
    </>
  )
}
