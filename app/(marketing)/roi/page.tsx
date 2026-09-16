import Link from 'next/link'
import {
  PageHero,
  SectionOpener,
  PrimaryCta,
  GhostCta,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd } from '@/lib/marketing/seo'
import { PLAN_PRICE_MONTHLY, VISITS_PER_PATIENT_PER_YEAR } from '@/lib/recall-roi'
import RoiCalculator from './roi-calculator'

export const metadata = {
  title: 'Dental recall ROI calculator — what missed hygiene visits cost',
  description:
    'Free calculator: enter your active patients, recall rate, and hygiene visit value — see what off-schedule patients cost your practice each year, and what winning some back is worth. Runs in your browser; nothing is sent to us.',
  alternates: { canonical: '/roi' },
}

/**
 * THE RECALL ROI CALCULATOR — `BRAND.md` Part 8 move 6, page 6 (the tools).
 *
 * THE SECOND BESPOKE HERO THE AUDIT FOUND, and it is the exact shape page 2
 * found on `/compare/[vendor]` and page 5 found on `GuideShell`: a
 * `from-teal-50/60` band with a hand-rolled `Eyebrow`/`h1` pair, sitting
 * under a `max-w-3xl` container. **That is the THIRD time the count of pages
 * wearing this brand was wrong in the same direction**, and the tell is
 * always the same — the page imports `Eyebrow` (so it looks converted in a
 * grep) while rendering its own band around it. Page 5 handed forward "check
 * whether the page actually renders `PageHero`"; this is what that check
 * catches.
 *
 * THIS PAGE IS AN INSTRUMENT AND THE MOVE RESPECTS THAT. Nothing here
 * touches `computeRecallRoi`, the three scenarios, the hedging, or a single
 * number it produces. `BRAND.md` Part 5 bans emoji on "ROI and grader
 * numbers" and the reason is this page: its whole pitch is *"that's
 * arithmetic on your own numbers, not a projection"*, and a decorative glyph
 * beside a number is the one thing that makes a measurement look like a
 * marketing claim.
 *
 * THE MOVE IS THE ARITHMETIC ITSELF. "How the math works (all of it)" was a
 * paragraph SPELLING OUT an equation in prose — *"patients off the schedule ×
 * two hygiene visits a year × your average visit value"* — set in a
 * proportional face, which is Part 4's named failure case one page over from
 * page 5's leader-dot column: **mono is for any number the reader is meant to
 * compare.** A page that asks a practice to trust its arithmetic should show
 * the arithmetic as arithmetic. It is a mono formula line now, with the prose
 * underneath doing what prose is for — saying why the scenarios are hedged.
 *
 * SECTION CONTAINERS ALL MATCH — the constraint pages 1–5 paid for. The old
 * body ran `max-w-3xl` hero / `max-w-5xl` calculator / `max-w-3xl` close, so
 * three sections started at three different left edges under a centred-ish
 * hero. One `max-w-6xl` column throughout; the reading measure is held by
 * narrowing the TEXT.
 *
 * THE PRICE RESOLVES. The close typed `$200/mo flat` and
 * `lib/recall-roi.ts` typed `PLAN_PRICE_MONTHLY = 200` — the fifth and worst
 * copy of DREAMCRM-38's number, because the calculator DIVIDES by it. Both
 * read `getQuotedPlan()` now and `tests/marketing/pricing-price-source.test.tsx`
 * scans this route.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 * Measured run: `BRAND.md` Part 7, "The tools, measured".
 */
export default function RoiPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Recall ROI calculator', path: '/roi' },
        ])}
      />

      <PageHero
        eyebrow="Free calculator"
        title="What are missed hygiene visits costing you?"
        sub="Every practice has patients who quietly fell off the recall schedule. Put in three numbers you already know and see what that’s worth per year — the math runs right here in your browser."
      />

      <section className="mx-auto max-w-6xl px-4 pb-4 pt-2 sm:px-6">
        <RoiCalculator />
      </section>

      {/* ── THE ARITHMETIC, AS ARITHMETIC ─────────────────────────────────
             Part 4: mono for any number the reader is meant to compare. The
             formula is the page's argument, so it gets to LOOK like one
             instead of being described in a sentence. `overflow-x-auto` is
             deliberately NOT here — Part 10 grades the document, and a scroll
             box is how `/compare/[vendor]` dragged 212px sideways for three
             moves. It wraps instead, which is why the operators are their own
             flex children rather than one long string. ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <SectionOpener
          eyebrow="Show your work"
          title="How the math works — all of it"
          lede="Three numbers you typed, two the industry agrees on, and nothing else. There is no model here and no projection of your results."
        />

        <div
          className="max-w-3xl rounded-[14px] border bg-white p-5 sm:p-6"
          style={{ borderColor: DAY_WIRE }}
        >
          <p className={`text-gray-500 ${MONO_LABEL}`}>What’s at stake, per year</p>
          {/* THE SPOKEN VERSION IS A SENTENCE, NOT THE FRAGMENTS. Split
              across flex children the equation reads to a screen reader as
              seven disconnected scraps ("patients off the schedule", "times",
              "2 visits/yr"…), and `×` is pronounced differently by every
              engine. So the visual line is `aria-hidden` and the spoken one
              is an ordinary sentence beside it — the same call the hub index
              made about its numerals, in the other direction. Not
              `role="math"` with a label: that role's name support is thin
              across screen readers, and a sentence needs no support at all. */}
          <p className="sr-only">
            Patients off the schedule, times {VISITS_PER_PATIENT_PER_YEAR} hygiene visits a year,
            times your average hygiene visit value, equals what is at stake per year.
          </p>
          <div
            className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 font-mono-num text-[0.85rem] leading-relaxed text-gray-800"
            aria-hidden="true"
          >
            <span>patients off the schedule</span>
            <span className="text-teal-700">×</span>
            <span>{VISITS_PER_PATIENT_PER_YEAR} visits/yr</span>
            <span className="text-teal-700">×</span>
            <span>your visit value</span>
            <span className="text-teal-700">=</span>
            <span className="font-semibold text-gray-950">at stake</span>
          </div>
          <p className="mt-4 border-t pt-4 text-[0.9rem] leading-relaxed text-gray-700" style={{ borderColor: DAY_WIRE }}>
            The three columns above apply a 10%, 25% and 40% win-back rate to that number —
            hedged on purpose, because a recall engine reaches people; it doesn’t teleport them
            into chairs. The only practice-specific numbers anywhere on this page are the ones
            you typed.
          </p>
        </div>

        <p className="mt-8 max-w-2xl text-[0.98rem] leading-relaxed text-gray-700">
          The part software actually changes is the <span className="font-semibold">asking</span>.
          Most practices ask once, by hand, when someone remembers. A recall engine asks every due
          patient, every cycle, forever — email first, with a booking link — and reports the only
          number that matters: booked back. That’s the exact funnel DreamCRM runs and shows you,
          and we published the scripts free:{' '}
          <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
            the recall scripts
          </Link>
          .
        </p>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             The page opens with a 36px gradient rule under the header and
             closes on the same mark, so the brand's three hues are the first
             and last thing on it. Hard left on the hero's own column, which
             is the shape pages 1, 3, 4 and 5 close on — deliberately not the
             old centred stack under a `bg-gray-50/70` slab. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Start asking
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            The break-even line is the whole pitch
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            ${PLAN_PRICE_MONTHLY}/mo flat, month-to-month. At your own fees, the number above says
            how many visits a month it takes to pay for itself — and everything past that is the
            upside you just calculated.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days, no card</PrimaryCta>
            <GhostCta href="/grade">Grade your practice free</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
