import Link from 'next/link'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  type ToneTileGlyph,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'

/**
 * THE MANIFESTO — `BRAND.md` Part 8 move 6, page 4.
 *
 * The positioning page (2026-07-19 shift): identity-first, not
 * vendor-comparison-first. This page says what the PLATFORM believes — not a
 * team page, not a feature list. Consolidation economics live down-funnel
 * (compare pages + blog campaign); this is who the product is.
 *
 * ALMOST ALL PROSE, WHICH DECIDES BOTH HALVES OF THIS MOVE.
 *
 * **Half one — the decorative layers stay above the reading column.** Part 7
 * is not advisory about this and this is the page it was written for: a long
 * reading measure plus a wash is the exact combination that produced the 4.18
 * the whole Part keeps quoting. So nothing below `PageHero` carries a
 * decorative layer — same answer as pages 1, 2 and 3, and for the same reason.
 * Everything here rides the page's own white at its flat ratio, and the three
 * hero runs are measured in `BRAND.md` Part 7, "The manifesto, measured".
 *
 * **Half two — six beliefs in a 2x3 card grid was the thing to fix.** Nothing
 * was wrong with the old cards. They were six equivalent tiles, and six
 * equivalent tiles is what a CHECKLIST looks like: the grid said "here are six
 * features of our attitude" when the page's whole argument is that each line
 * is a position somebody could disagree with. That is the tone-tile lesson one
 * altitude up — a uniform mark repeated says the same nothing however many
 * times you repeat it (Part 3) — and the fix is the same shape the product
 * tour used on its ten chapters: number them, give each one air, and let the
 * claim and its argument sit in different columns.
 *
 * SO A BELIEF IS NOW A CLAIM ON THE LEFT AND ITS ARGUMENT ON THE RIGHT, under
 * `NN / 06` as a mono numeral. Five of twelve columns to the claim, seven to
 * the argument, hard left on the same `max-w-6xl` column the hero's headline
 * starts on — which is the constraint pages 1–3 paid for and handed forward:
 * SECTION CONTAINERS ALL MATCH, and a structural column is a narrower
 * container by another name. The claim column holds the heading, so every
 * heading on this page still begins where the `h1` begins; what moves right is
 * the prose, which is content rather than structure.
 *
 * THE COUNT IS COMPUTED, in the group header and in all six numerals. A number
 * written into prose goes stale silently — the check-mark census did it twice
 * and the comparison index did it inside the life of its own PR.
 *
 * THE TONE VOCABULARY, AND WHY IT IS MOSTLY `brand` HERE. Tones come from
 * `lib/marketing/tone-tiles.ts` with the subject and are never picked at a
 * call site (Part 3). On a positioning page most subjects genuinely ARE what
 * the product is — `tooth`, `people`, `flag`, `door` — so four tiles are teal
 * and that is the honest reading rather than a flat one. Two are `auto`: the
 * PMS bridge is `sync`, and "alive, not archived" earns `bolt` on its last
 * clause ("nothing hides behind a report you have to remember to run" is
 * something the product does without you). `growth` is absent because no
 * belief on this page is about what the product earns you — that argument is
 * the compare pages' and it is deliberately not this page's.
 *
 * THE RECEIPTS ARE THE PAGE'S ONE NEW IDEA AND THEY ARE HONESTY, NOT
 * DECORATION. The two beliefs that are checkable — the gaps are marked, and
 * leaving is allowed — carry a mono link to the page that proves them. A
 * manifesto that asserts and never points is the genre's failure mode; the
 * other four beliefs get no link because no page on this site proves them and
 * a decorative receipt would be worse than none.
 *
 * THE PRICE IS ON THE PAGE NOW, and that is the third honesty tenet arriving
 * on the page that is ABOUT the honesty tenets. `DESIGN.md`'s three are the
 * price on the page, the gaps marked, leaving allowed; this page carried two
 * of them as beliefs and never named the number, while Part 5 says *"Say the
 * number: $200/mo, flat"*. It resolves from `getQuotedPlan()` rather than
 * being typed — DREAMCRM-38's rule — and
 * `tests/marketing/pricing-price-source.test.tsx` now scans this route for a
 * typed plan price along with the pricing route.
 *
 * NO EMOJI. Part 5's permission is marking a MOMENT, and a manifesto has no
 * moment in it — the visitor has not done anything yet. A glyph here would be
 * decoration, which is the ban's other half. Delight on this page is the
 * numerals, the alignment, the receipts and the bookend.
 *
 * NOTHING THE PAGE ASSERTS CHANGED. Every belief keeps its title and its body
 * verbatim, because the honesty tenets are load-bearing brand personality
 * rather than small print (Part 5) and a restyle is not the place to soften
 * one. `tests/marketing/marketing-site.test.tsx` pins all three.
 */

/** Ours, resolved rather than typed (DREAMCRM-38). Pure config — no database,
 *  no Stripe call — so this costs nothing at render. */
const PLAN = getQuotedPlan()

export const metadata = {
  title: 'Why DreamCRM — what this platform believes',
  alternates: { canonical: '/why' },
  description:
    'DreamCRM is the patient-relationship platform for dental practices. Dental-only, wraps the PMS you already run, warm software for real front desks — with our gaps marked and no lock-in.',
}

const BELIEFS: Array<{
  glyph: ToneTileGlyph
  title: string
  body: string
  proof?: { href: string; label: string }
}> = [
  {
    glyph: 'tooth',
    title: 'Dental-only, on purpose, forever',
    body: 'Every default, template, reminder cadence, and integration is built for a dental practice — recall intervals, operatories, insurance checks, hygiene reappointment. Generic CRMs make your practice adapt to them. We adapted to you before you arrived, and we don’t dilute that by chasing other industries.',
  },
  {
    glyph: 'sync',
    title: 'We wrap your PMS. We don’t replace it.',
    body: 'Your practice management system is the system of record for clinical truth — charts, procedures, claims. It should stay that way. DreamCRM is the relationship layer around it: the website, booking, portal, messages, reviews, and recall that your PMS was never built to do well. Two-way sync through sanctioned integrations, so every change lands in your own audit trail.',
  },
  {
    glyph: 'people',
    title: 'Software for front desks, not analysts',
    body: 'The person running your morning isn’t reading dashboards — they’re juggling a phone, a waiting room, and a schedule that changed twice before 9am. So the product talks like a person: “3 still need a text,” never “3 records pending confirmation.” It leads with what needs doing, makes it one click, and celebrates what got done instead of shaming what didn’t.',
  },
  {
    glyph: 'bolt',
    title: 'Alive, not archived',
    body: 'A practice is a living thing — bookings land, patients confirm, reviews arrive. Your software should feel that way. Every number in DreamCRM carries its own pulse, every screen answers “what’s happening right now,” and nothing worth knowing hides behind a report you have to remember to run.',
  },
  {
    glyph: 'flag',
    title: 'Our gaps are marked',
    body: 'No VoIP phones. No SMS yet — it’s on the roadmap, not on the invoice. Open Dental’s API fee is theirs and we say so. Every comparison page on this site lists what the other vendor does better. We’d rather lose a deal honestly than win one that turns into a support ticket titled “this isn’t what I was told.”',
    proof: { href: '/compare', label: 'Read the comparisons' },
  },
  {
    glyph: 'door',
    title: 'Leaving is allowed',
    body: 'Month-to-month, no contract, no setup fee. Your website content exports with you, and your PMS never stopped being the source of truth. Lock-in is a business model for vendors who expect you to want to leave. We’d rather build the thing you don’t want to leave.',
    proof: { href: '/pricing', label: 'See the price and the terms' },
  },
]

export default function WhyPage() {
  return (
    <>
      <PageHero
        eyebrow="Why DreamCRM"
        title="The patient-relationship platform for dental practices"
        sub="One system for everything between you and your patients — built on a few beliefs we’re not flexible about."
      />

      {/* ── THE SHORT VERSION ─────────────────────────────────────────────
             The page's thesis, hard left on the hero's own column with the
             prose held to a reading measure rather than the container being
             narrowed to one. That distinction is page 1's cost handed
             forward: narrowing the CONTAINER moves this paragraph's left edge
             off the column every heading on the page starts on. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-2 pt-4 sm:px-6">
        <div className="max-w-3xl">
          <p className={`mb-4 text-gray-500 ${MONO_LABEL}`}>The short version</p>
          <p className="text-[1.05rem] leading-relaxed text-gray-700">
            Most dental software is built for the back office: billing engines with a
            patient list attached, dashboards designed for consultants. DreamCRM is
            built for the other half of the practice — the relationship half. The
            website a patient finds you on, the booking that gets them in the chair,
            the portal that answers their questions at 9pm, the message that makes a
            no-show a reschedule, the review that brings the next family in. One
            system, one login, wrapped around the PMS your team already knows.
          </p>
        </div>
      </section>

      {/* ── THE BELIEFS, NUMBERED ─────────────────────────────────────────
             The group header is the product tour's spec-header idiom: a mono
             label, a `DAY_WIRE` hairline, and the real count as a mono
             numeral — computed, never typed. ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
          <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>What we believe</h2>
          <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
            <span aria-hidden="true">{String(BELIEFS.length).padStart(2, '0')}</span>
            <span className="sr-only">{BELIEFS.length} beliefs</span>
          </p>
        </div>

        <ol>
          {BELIEFS.map((b, i) => (
            <li key={b.title} className="border-b py-9 lg:py-11" style={{ borderColor: DAY_WIRE }}>
              <div className="grid gap-x-10 gap-y-4 lg:grid-cols-12">
                {/* THE CLAIM. Five columns, and the heading is in here rather
                    than leading full width, so the position reads as a stated
                    thing with its argument beside it instead of as a headline
                    with a paragraph under it. */}
                <div className="lg:col-span-5">
                  {/* THE NUMERAL IS `aria-hidden` WITH NO `sr-only` TWIN, and
                      that is the difference between this list and the product
                      tour's chapters. Those are ten sibling `<section>`s, so
                      their "Chapter 3 of 10" is the only place the position
                      exists. These are `<li>`s in an `<ol>`, which every
                      screen reader already announces as "3 of 6" — a twin
                      here would read the position twice, which is Part 5's
                      rule about labels stated in markup instead of in copy. */}
                  <div className={`flex items-center gap-3 text-gray-500 ${MONO_LABEL}`}>
                    <ToneTile glyph={b.glyph} size="md" />
                    <span aria-hidden="true">
                      {String(i + 1).padStart(2, '0')} / {String(BELIEFS.length).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.45rem]">
                    {b.title}
                  </h3>
                </div>

                {/* THE ARGUMENT, and — where one exists — the receipt. */}
                <div className="lg:col-span-7">
                  <p className="max-w-2xl text-[0.95rem] leading-relaxed text-gray-700">{b.body}</p>
                  {b.proof && (
                    <Link
                      href={b.proof.href}
                      className={`group mt-4 inline-flex items-center gap-2 text-teal-700 hover:underline ${MONO_LABEL}`}
                    >
                      {b.proof.label}
                      <span
                        className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             It opens with a 36px gradient rule under the header and closes on
             the same mark, so the brand's three hues are the first and last
             thing on the page. The shape pages 1 and 3 close on; deliberately
             not a second panel, and deliberately not a dark slab above the
             `gray-950` footer. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            See it, don&apos;t take our word
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            The proof is a login away
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Seven days of everything, no card, no call. Or walk through a fully
            populated practice first and see how a Tuesday actually feels.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/product">Tour the platform</GhostCta>
          </div>
          {/* The hero's trust row, arriving on this page: mono, dot
              separators, no mark at all (Part 3 — "every mark says
              something", and four tiles here would be four statements the
              manifesto has already made). The price is the third honesty
              tenet and it resolves rather than being typed. */}
          <div
            className={`mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}
          >
            {[`${usd(PLAN.price)}/mo, flat`, '7 days free', 'No card to start', 'Month-to-month'].map(
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
