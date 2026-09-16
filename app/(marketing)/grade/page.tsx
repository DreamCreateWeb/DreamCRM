import type { Metadata } from 'next'
import {
  PageHero,
  SectionOpener,
  ToneTile,
  MONO_LABEL,
  DAY_WIRE,
  type ToneTileGlyph,
} from '@/components/marketing/ui'
import GradeForm from './grade-form'

export const metadata: Metadata = {
  title: 'Grade your dental practice’s online presence — DreamCRM',
  description:
    'Free grader for dental practices: your website, your Google Business listing, and your reviews — scored in seconds, with what patients actually experience.',
}

/**
 * THE PRACTICE GRADER — `BRAND.md` Part 8 move 6, page 6 (the tools).
 *
 * THE FIRST OF THREE PAGES THE MOVE-6 AUDIT FOUND WITH A BESPOKE HERO. This
 * one had no hero component at all — a bare `<section>` with a hand-rolled
 * `text-xs uppercase` eyebrow and a `text-4xl font-semibold` `h1`, which is
 * neither `PageHero`'s display step nor its weight. It now opens in the
 * language like every other subpage.
 *
 * WHAT THE PAGE IS, AND THE LINE THAT DRAWS: this is an INSTRUMENT that
 * states numbers about a real practice. Nothing here touches what it
 * computes, and nothing restyles a measured result into looking like a
 * marketing claim — `BRAND.md` Part 5's "every number is real, or visibly an
 * example" cuts the other way on a grader. The only numbers on this page are
 * the three things it checks and how long it takes.
 *
 * THE THREE 🌐/📍/⭐ EMOJI ARE GONE, and they are the owner's tone-tile veto
 * arriving on the last page that still had it. Part 5 bans emoji as
 * DECORATION and bans them on "ROI and grader numbers" by name; three system
 * emoji standing in for icons down a list is the bland-check-mark shape in a
 * second costume — worse, actually, since a glyph that renders differently on
 * every platform cannot be a brand mark at all. They are tone tiles now
 * (`globe` / `megaphone` / `star`), TIER A because each line is a different
 * KIND of thing. The subjects are the ones `/product` already uses for these
 * exact three modules — the website, the Google profile, reputation — which
 * is the merit that picks them. That they land one per tone FAMILY is a
 * consequence, not the reason: choosing a subject to get a colour is the
 * failure Part 3's first tone rule names, and page 5 already rejected a
 * glyph for exactly that.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer,
 * for pages 1–5's reason. Every run in this body rides the page's own white
 * at its flat ratio; only the three hero runs needed measuring, and they are
 * in `BRAND.md` Part 7, "The tools, measured".
 *
 * SECTION CONTAINERS ALL MATCH. The old body sat on `max-w-6xl` already, so
 * this page cost nothing there — but the form CARD is what would have drifted:
 * a `max-w-xl` wrapper around it to "keep the form tidy" is the narrower
 * container pages 1–5 each paid for. The grid column does that job instead.
 */

/**
 * WHAT A PATIENT ACTUALLY SEES, in the order the grader checks it. The copy
 * is the page's existing copy — this move is shape, not a rewrite.
 */
const CHECKS: Array<{ glyph: ToneTileGlyph; title: string; body: string }> = [
  {
    glyph: 'globe',
    title: 'Your website',
    body: 'Secure, phone-ready, bookable after hours, and readable in a Google result.',
  },
  {
    glyph: 'megaphone',
    title: 'Your Google listing',
    body: 'Findable on the map, open, and pointing at the right website.',
  },
  {
    glyph: 'star',
    title: 'Your reviews',
    body: 'The stars and the volume patients filter by before they ever call.',
  },
]

export default function GradePage() {
  const total = String(CHECKS.length).padStart(2, '0')

  return (
    <>
      <PageHero
        eyebrow="Free grader"
        title="How does your practice look to a patient searching right now?"
        sub="We check the three things patients actually see and grade them the way a patient experiences them. Takes about ten seconds, and the report is yours either way."
      />

      {/* ── THE INSTRUMENT AND ITS DIAL ───────────────────────────────────
             Seven columns of "what gets checked" to five of form. The form is
             narrower on purpose: a field column wider than its labels reads as
             a page that has run out of things to ask. Below `lg` they stack
             with the checks first, which is the same order the hero argues in.
             The form is a raised white CARD rather than the old
             `bg-gray-50/70` well — Part 3's depth is emission, and a grey
             well under a light page is the "it went bland" failure Part 1
             names. ── */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionOpener
              eyebrow="What gets checked"
              title="The three things a patient looks at before they call"
              lede="Not a hundred technical signals. The same three a person actually checks — graded on what they would see, not on what a crawler would."
            />

            <ol>
              {CHECKS.map((c, i) => (
                <li key={c.title} className="border-b py-6" style={{ borderColor: DAY_WIRE }}>
                  <div className={`flex items-center gap-3 text-gray-500 ${MONO_LABEL}`}>
                    <ToneTile glyph={c.glyph} size="md" />
                    {/* `aria-hidden` with no `sr-only` twin: these are `<li>`s
                        in an `<ol>`, which a screen reader already announces
                        as "2 of 3". The hub index on page 5 made the same
                        call for the same reason. */}
                    <span aria-hidden="true">
                      {String(i + 1).padStart(2, '0')} / {total}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[1.15rem] font-bold leading-snug tracking-[-0.02em] text-gray-950">
                    {c.title}
                  </h3>
                  <p className="mt-1.5 max-w-xl text-[0.95rem] leading-relaxed text-gray-700">
                    {c.body}
                  </p>
                </li>
              ))}
            </ol>

            <p className="mt-6 max-w-xl text-[0.9rem] leading-relaxed text-gray-600">
              The report names what is already working before it names what is not, and every
              line says where to look. It is yours whether or not you ever open DreamCRM.
            </p>
          </div>

          <div className="lg:col-span-5">
            <div
              className="rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)] sm:p-7"
              style={{ borderColor: DAY_WIRE }}
            >
              {/* The card's own mark: the mono label pages 1–5 open their
                  sections with, leading a `DAY_WIRE` hairline. Deliberately
                  NOT the 36px gradient rule — Part 4 gives that to the page's
                  opening and closing marks, and a third one mid-page is how a
                  signature stops being one. */}
              <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
                <p className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>Grade my practice</p>
                <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>≈ 10 sec</p>
              </div>
              <div className="mt-5">
                <GradeForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
