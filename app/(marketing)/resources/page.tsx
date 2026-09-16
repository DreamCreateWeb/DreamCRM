import Link from 'next/link'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { JsonLd, SITE_URL } from '@/lib/marketing/seo'

/**
 * THE PRACTICE GROWTH LIBRARY — `BRAND.md` Part 8 move 6, page 5 (the hub).
 *
 * THE MOVE IS THE ONE PAGES 3 AND 4 MADE, ARRIVING AT A THIRD COSTUME OF THE
 * SAME MISTAKE. This was three equal cards in a `md:grid-cols-3`, and three
 * equivalent tiles is what a CHECKLIST looks like — the owner's tone-tile veto
 * one altitude up (`BRAND.md` Part 3). A library index is not three
 * interchangeable things; it is a shelf, and the only question a reader brings
 * to a shelf is *which one has what I need right now*. The old card could not
 * answer it: a title, one sentence, a read time.
 *
 * SO IT IS AN INDEX NOW, one row per guide, and the row ANSWERS THAT QUESTION.
 * `contains` from the registry names the artifacts actually on the page below
 * — the templates, the worked example, the cadence. That is this page's
 * delight and it is usefulness rather than ornament: the honest version of
 * personality on an index is that the index is worth reading.
 *
 * THE CONTAINS LIST IS TIER B, AND IT IS THE ONE LIST OUTSIDE AN INVENTORY
 * THAT EARNS `ToneDash`. `BRAND.md` Part 3: a tile on the GROUP, a tone dash
 * on each row, where the rows are one kind of thing under a heading that
 * already names the subject. The guide IS that heading and its tile IS the
 * group's mark, so four dashes in the guide's own tone say "still inside this
 * guide" without four more glyphs saying it again.
 *
 * SECTION CONTAINERS ALL MATCH — the constraint pages 1–4 paid for and handed
 * forward. The old body sat on `max-w-5xl` under a `max-w-6xl` hero, so every
 * row started 64px right of the `h1`. One `max-w-6xl` column throughout, and
 * the reading measure is held by narrowing the TEXT rather than the container.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–4's answer, for
 * pages 1–4's reason. Every run in this body rides the page's own white at its
 * flat ratio; only the three hero runs needed measuring, and they are in
 * `BRAND.md` Part 7, "The resource library, measured".
 *
 * THE COUNT IS COMPUTED, in the group header and in all three numerals. A
 * number written into prose goes stale silently.
 *
 * NO EMOJI, and the reason is worth stating because the issue that ordered
 * this page expected some. `BRAND.md` Part 5 has TWO separate clauses that are
 * easy to run together: the ANIMATED set marks a MOMENT, and PLAIN unicode is
 * allowed in body copy *where a named human is writing*. Neither applies here.
 * A library index has no moment in it — the visitor has not done anything yet
 * — and these guides carry no byline, so there is no named human writing them.
 * Part 5's table is untouched. The longer version is in `guide-ui.tsx`.
 */

export const metadata = {
  title: 'Practice growth library — free guides for dental practices',
  alternates: { canonical: '/resources' },
  description:
    'Free, copy-ready guides for growing a dental practice: recall scripts that get patients back, membership plan pricing math, and the patient-growth playbook in the right order.',
}

export default function ResourcesIndexPage() {
  const total = String(RESOURCE_GUIDES.length).padStart(2, '0')

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Practice growth library',
          itemListElement: RESOURCE_GUIDES.map((g, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: g.title,
            url: `${SITE_URL}/resources/${g.slug}`,
          })),
        }}
      />
      <PageHero
        eyebrow="Practice growth library"
        title="Free guides, real scripts, honest math."
        sub="Everything here is copy-ready and works whether or not you ever use DreamCRM — the scripts are the ones our own platform sends, and the math is the math."
      />

      {/* ── THE SHELF ─────────────────────────────────────────────────────
             The group header is the product tour's spec-header idiom, the
             same one the manifesto opens its beliefs with: a mono label, a
             `DAY_WIRE` hairline, the real count as a mono numeral. ── */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
          <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>On the shelf</h2>
          <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
            <span aria-hidden="true">{total}</span>
            <span className="sr-only">{RESOURCE_GUIDES.length} guides</span>
          </p>
        </div>

        <ol>
          {RESOURCE_GUIDES.map((g, i) => (
            <li key={g.slug} className="border-b py-9 lg:py-11" style={{ borderColor: DAY_WIRE }}>
              <div className="grid gap-x-10 gap-y-4 lg:grid-cols-12">
                {/* THE SPINE — the tile, the position and the read time, which
                    are the three things a reader checks before committing ten
                    minutes. The numeral is `aria-hidden` with no `sr-only`
                    twin: these are `<li>`s in an `<ol>`, which every screen
                    reader already announces as "2 of 3", and a twin would
                    read the position twice. */}
                <div className="lg:col-span-5">
                  <div className={`flex items-center gap-3 text-gray-500 ${MONO_LABEL}`}>
                    <ToneTile glyph={g.glyph} size="md" />
                    <span aria-hidden="true">
                      {String(i + 1).padStart(2, '0')} / {total}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
                    <span>{g.readMinutes} min</span>
                  </div>
                  <h3 className="mt-3 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.45rem]">
                    <Link
                      href={`/resources/${g.slug}`}
                      className="mkt-nudge-host inline-flex items-start gap-2 hover:underline"
                    >
                      {g.title}
                      {/* ONE LINK PER ROW, and the arrow lives inside it. A
                          second "Read the guide →" pointing at the same href
                          is a second tab stop that goes exactly where the
                          first one does. Part 6's hover: 140ms ease-out, no
                          spring, and `mkt-nudge` is gated to a fine pointer
                          in `MarketingMotionStyles` so it does not fire on a
                          touch-and-hold. */}
                      <span className="mkt-nudge mt-[0.3em] shrink-0 text-teal-700" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </h3>
                </div>

                {/* WHAT IS ACTUALLY IN IT. */}
                <div className="lg:col-span-7">
                  <p className="max-w-2xl text-[0.95rem] leading-relaxed text-gray-700">
                    {g.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {g.contains.map((c) => (
                      <li
                        key={c}
                        className="flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-gray-600"
                      >
                        <ToneDash glyph={g.glyph} className="mt-[0.6em]" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             The page opens with a 36px gradient rule under the header and
             closes on the same mark, so the brand's three hues are the first
             and last thing on it. The shape pages 1, 3 and 4 close on, and
             deliberately not the old centred `teal-50` panel — a centred
             block under a hard-left hero is the drift move 6 exists to
             close. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Before you read anything
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            See where your practice actually stands
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            The grader checks your website, your Google listing, your reviews, and your
            search rank — free, instant, yours to keep. Then read the guide that matches
            what it finds.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/grade">Grade your practice free</PrimaryCta>
            <GhostCta href="/signup">Start free — 7 days</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
