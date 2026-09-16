import Link from 'next/link'
import { Children, isValidElement, type ReactNode } from 'react'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  type ToneTileGlyph,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { JsonLd, articleLd, breadcrumbLd } from '@/lib/marketing/seo'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import type { ResourceGuide } from '@/lib/marketing/resources'

/**
 * THE GUIDE SHELL AND THE ARTICLE PRIMITIVES — `BRAND.md` Part 8 move 6,
 * page 5. Shared shell for the practice-growth guides: hero, article column,
 * Article/Breadcrumb JSON-LD and the one CTA block. Content pages stay bespoke
 * TSX; this keeps the chrome and the schema uniform.
 *
 * ── THE ISSUE'S PREMISE WAS WRONG AND IT IS THE FIRST THING TO FIX ─────────
 *
 * DREAMCRM-79 opens "these already inherit the new header, footer and
 * `PageHero` from move 4, so the top of each page is converted". True of the
 * HUB. Not true here: this shell carried its own `from-teal-50/60` band with a
 * hand-rolled `Eyebrow`/`h1` pair — the exact shape `compare/[vendor]` was
 * found in on move 6 page 2, on three more pages, for the same reason (a page
 * that renders its own hero does not inherit the one it never called). Move
 * 4's claim that "all eight subpages inherit it without being opened" counted
 * ROUTE GROUPS; these three articles are a fourth hero nobody counted. So the
 * top of each guide is converted HERE, and `PageHero` now opens all four
 * resource routes.
 *
 * ── THE RULE THAT DECIDES EVERY OTHER CHOICE BELOW ────────────────────────
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER. Pages 1–4 reached this
 * independently and this is the page it matters most on: `BRAND.md` Part 7's
 * 4.18 — "a real failure that reads as nearly fine" — was measured on a
 * caption sitting in a bloom's spill, and an article is a reading column
 * eight screens long. So every run in an article body rides the page's own
 * white at its flat ratio, graded through `tests/a11y/palette.ts`:
 * `gray-700` (body) 10.30, `gray-600` (quiet rows) 6.91, `gray-500` (mono
 * labels) 5.30, `teal-700` (links, the script labels) 7.05. Only the three
 * hero runs needed the instrument; they are in `BRAND.md` Part 7, "The
 * resource library, measured", graded with grain ON at all three widths.
 *
 * ── SECTION CONTAINERS ALL MATCH, AND ON AN ARTICLE THAT TAKES A TRICK ────
 *
 * The old article was `mx-auto max-w-3xl` under what is now a `max-w-6xl`
 * hero, so at 1440 every paragraph began ~250px right of the `h1`. That is
 * page 1's cost, handed forward through three pages: narrow the TEXT, never
 * the CONTAINER. Every section here is `max-w-6xl` and the reading measure is
 * held by `max-w-2xl` on the prose itself, so the article starts exactly where
 * the headline does and still reads at a sane measure.
 *
 * Long-form also earns a step UP in body size — `1rem` rather than the
 * `0.95rem` a card body uses. Eight screens of reading is a different job from
 * a paragraph in a grid, and the measure was set to suit it.
 *
 * What the right half of the page does instead of nothing is `GuideRail`
 * below — read its header before moving either column, because which SIDE it
 * is on is the whole difference between it and the rail page 3 nearly shipped.
 *
 * ── EMOJI: THE PERMISSION THE ISSUE EXPECTED DOES NOT EXIST HERE ──────────
 *
 * DREAMCRM-79 names these pages as "the one place the curated animated set is
 * allowed in body copy — where a named human is writing in the first person".
 * Read against `BRAND.md` Part 5 that runs two separate clauses together, and
 * NEITHER of them lands here:
 *
 *   1. Part 5's body-copy clause is about **plain unicode**, not the animated
 *      set: *"Plain unicode emoji are still fine in body copy where a named
 *      human is writing… The animated set is for moments; a character in a
 *      sentence is a character in a sentence."* The curated six mark MOMENTS.
 *   2. Its precondition is a **named human**, and these guides have no byline.
 *      `ResourceGuide` has no author field and no page signs itself. The voice
 *      is "we" — the company — which is not a person writing in the first
 *      person, and a corporate "we" is exactly the voice Part 5's clause is
 *      distinguishing itself FROM.
 *
 * And there is no moment on these pages to mark either: the visitor has read
 * something, which is not a win they caused. So this is the fifth move-6 page
 * in a row with no emoji, and Part 5's table is untouched — a seventh glyph
 * would be an edit to that table first, and nothing here asked for one.
 *
 * **The honest option, stated rather than quietly taken:** if the body-copy
 * clause is ever to have a call site, these guides need a real named author
 * with a byline. That is a CONTENT decision (and the registry's own content
 * laws forbid inventing one), not a brand-character one, so it is the owner's
 * call rather than this move's.
 *
 * ── THE PRICE RESOLVES (DREAMCRM-38) ──────────────────────────────────────
 *
 * The closing CTA said "$200/mo" as a literal. That is the fourth surface
 * DREAMCRM-38 was about, found on the fourth page to be rebuilt, and it is
 * live on all three guides at once because it lives in this shared shell. It
 * resolves from `getQuotedPlan()` now and
 * `tests/marketing/pricing-price-source.test.tsx` scans this file for a typed
 * plan price along with `/pricing` and `/why`.
 */

/** Ours, resolved rather than typed (DREAMCRM-38). Pure config — no database,
 *  no Stripe call — so this costs nothing at render. */
const PLAN = getQuotedPlan()

export function GuideShell({ guide, children }: { guide: ResourceGuide; children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Resources', path: '/resources' },
            { name: guide.title, path: `/resources/${guide.slug}` },
          ]),
          articleLd({
            title: guide.title,
            description: guide.description,
            path: `/resources/${guide.slug}`,
            datePublished: guide.datePublished,
          }),
        ]}
      />
      <PageHero eyebrow="Practice growth library" title={guide.title} sub={guide.description}>
        {/* The guide's own spine, in the hero's `children` slot: the subject
            tile from the registry, the honest read time, and what the reader
            is allowed to do with it. Mono, dot-separated — the home hero's
            trust row arriving on an article. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <ToneTile glyph={guide.glyph} size="sm" />
          <span>{guide.readMinutes}-minute read</span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <span>Free to copy and use in your practice</span>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-10">
          <article className="max-w-2xl lg:col-span-8">{children}</article>
          <GuideRail glyph={guide.glyph}>{children}</GuideRail>
        </div>
      </div>

      {/* ── THE CLOSE — the page's bookend ──────────────────────────────
             The 36px gradient rule that opened the page under the eyebrow,
             closing it. The shape pages 1, 3 and 4 close on; deliberately
             not the old centred `gray-50` slab, which was a centred block
             under what is now a hard-left hero. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Want this to run itself?
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Everything in this guide is a job the software does
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Recall asks that send themselves, a website that books 24/7, reviews that grow
            on their own. {usd(PLAN.price)}/mo, flat. No card to try it.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days</PrimaryCta>
            <GhostCta href="/grade">Grade your practice free</GhostCta>
          </div>
          <p className="mt-8">
            <Link
              href="/resources"
              className={`mkt-nudge-host inline-flex items-center gap-2 text-teal-700 hover:underline ${MONO_LABEL}`}
            >
              <span className="mkt-nudge-back" aria-hidden="true">
                ←
              </span>
              All growth guides
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}

/**
 * THE ANCHOR A CHAPTER IS REACHABLE BY, derived from its own text.
 *
 * ONE HELPER, TWO CALLERS, SO THE TWO CANNOT DISAGREE. `GuideH2` stamps the
 * `id` and `GuideRail` links to it, and they are rendered from opposite ends
 * of the tree — the page renders the heading, the shell renders the rail — so
 * a hand-kept list of anchors would be a second home for the same fact and
 * would break the first time a heading's wording changed. Same input, same
 * pure function, same output: there is nothing to keep in sync.
 *
 * An explicitly passed `id` wins, because `how-to-get-more-dental-patients`
 * already ships stable anchors (`#reviews`, `#website`) that may be linked
 * from outside this repo, and a restyle is not the place to break a URL.
 */
export function guideHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * A CHAPTER. The hairline ABOVE it is the structure — `DAY_WIRE`, the same
 * 1px edge the manifesto's beliefs and the tour's chapters are separated by —
 * so an eight-screen article reads as parts rather than as a wall, without a
 * tone tile on every heading. A tile per `<h2>` would be six to nine identical
 * statements down one page, which is the tone-tile veto in a new costume
 * (Part 3): the guide's subject is stated ONCE, on its tile in the hero.
 */
export function GuideH2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id ?? (typeof children === 'string' ? guideHeadingId(children) : undefined)}
      className="mt-12 scroll-mt-24 border-t pt-8 text-[1.45rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.6rem]"
      style={{ borderColor: DAY_WIRE }}
    >
      {children}
    </h2>
  )
}

/**
 * THE CHAPTER RAIL — what the right half of a 1440 article was doing with
 * itself, and the page-3 move arriving on the page that needed it most.
 *
 * THE PROBLEM IT SOLVES IS VISIBLE IN ONE SCREENSHOT. The reading column is
 * hard left on the hero's own `max-w-6xl` (Part 8 move 6's standing rule:
 * narrow the TEXT, never the CONTAINER), and these are the longest sustained
 * reading columns on the site — eight to ten screens. At 1440 that left the
 * right half of the page empty for the entire article while the reader had no
 * way to see how much was left or jump to the part they came for.
 *
 * IT IS NOT THE MISTAKE PAGE 3 NEARLY SHIPPED, and the difference is which
 * side it is on. The product tour's first draft put a sticky rail in the LEFT
 * margin and moved every heading on the page ~180px right of the hero's — "a
 * structural column is a narrower container by another name". This rail is on
 * the RIGHT, so the article still starts exactly where the `h1` starts; the
 * grid gives it the columns the page was wasting rather than columns the
 * reading column was using.
 *
 * DERIVED FROM THE ARTICLE, NEVER TYPED. It walks the shell's own `children`
 * for `GuideH2` elements and reads their text. A hand-kept chapter list is the
 * stale-number shape this repo has watched twice (`BRAND.md` Part 8 move 3),
 * and here it would go stale INVISIBLY — a rail naming a chapter that was
 * renamed still looks like a rail. The count is computed for the same reason.
 *
 * NO CLIENT JS, so no "you are here". The product tour's rail highlights the
 * chapter you are in and pays for an `IntersectionObserver` to do it; this is
 * a server component on a site that ships no scroll JS outside the spine
 * (Part 6), and *what is in this guide* is most of the value on an article.
 * `scroll-mt-24` on the heading is the CSS half of arriving somewhere — a
 * jump that lands a heading under the sticky header is a jump that missed.
 *
 * `lg:` AND UP ONLY, and that is a decision rather than a breakpoint. Below
 * `lg` there is no empty margin to fill, and stacking the rail above the
 * article would put ten links between the reader and the first sentence —
 * plus ten tab stops, on the width where a keyboard is least likely and a
 * screen reader most likely to have to walk past them. `hidden` keeps it out
 * of the accessibility tree entirely there, rather than merely off-screen.
 *
 * A TONE DASH RATHER THAN A `NN` NUMERAL, WHICH THE FIRST DRAFT HAD, AND THE
 * REASON IS THE PAGE IT LOOKED WRONG ON. `how-to-get-more-dental-patients`
 * numbers its own chapters in the copy — *"1. The Google listing is the front
 * door"* — because that guide's whole argument is the ORDER, so the rail read
 * `01  1. The Google listing…`: the position stated twice, once computed and
 * once typed. Stripping the typed prefix to make room for the computed one
 * was the clever fix and the wrong one; it would have HIDDEN a disagreement
 * between them instead of showing it.
 *
 * So the rail stops claiming a position it does not own. This is Tier B
 * exactly as `BRAND.md` Part 3 defines it — a tile on the GROUP (the guide's
 * subject, on its tile in the hero), a tone dash on each row, where the rows
 * are one kind of thing under a heading that already names the subject — and
 * it is the second list on this move to qualify, alongside the hub's index.
 * The count stays in the header, computed, which is where "how much is left"
 * was actually being answered.
 */
function GuideRail({ glyph, children }: { glyph: ToneTileGlyph; children: ReactNode }) {
  const chapters = Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== GuideH2) return []
    const props = child.props as { children?: ReactNode; id?: string }
    if (typeof props.children !== 'string') return []
    return [{ id: props.id ?? guideHeadingId(props.children), title: props.children }]
  })

  // A guide with no chapters gets no rail rather than an empty box — the same
  // reason the Growth hub's forward report renders only when something is
  // coming. An empty affordance is worse than none.
  if (chapters.length === 0) return null

  return (
    <nav aria-label="In this guide" className="hidden lg:col-span-4 lg:block">
      <div className="sticky top-24">
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
          <p className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>In this guide</p>
          <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
            <span aria-hidden="true">{String(chapters.length).padStart(2, '0')}</span>
            <span className="sr-only">{chapters.length} chapters</span>
          </p>
        </div>
        <ol className="mt-3 space-y-2">
          {chapters.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <ToneDash glyph={glyph} className="mt-[0.6em]" />
              <a
                href={`#${c.id}`}
                className="text-[0.9rem] leading-snug text-gray-600 hover:text-teal-700 hover:underline"
              >
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  )
}

export function GuideP({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[1rem] leading-relaxed text-gray-700">{children}</p>
}

/**
 * A PROSE LIST, and the marker is deliberately NOT a tone dash.
 *
 * `ToneDash` is Part 3's Tier-B row marker and it means something: the rows
 * are one KIND of thing under a heading that already names the subject. These
 * are not that — they are a paragraph broken into lines, under headings that
 * change subject every screen. Borrowing the tone vocabulary for ordinary
 * prose bullets is how a vocabulary stops meaning anything, which is the
 * failure the whole tone system exists to prevent. So this is a quiet
 * `teal-600` rule at reading size: a mark that says "line", nothing more.
 */
export function GuideList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[1rem] leading-relaxed text-gray-700">
          <span className="mt-[0.7em] h-[2px] w-3 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A COPY-READY SCRIPT — the guide's original material, and the thing a reader
 * came for. `lib/marketing/resources.ts` calls it out: the scripts ARE the
 * content, so this is the page's signature element and it is built like one.
 *
 * WHITE ON A HAIRLINE, NOT A TINTED WELL. It was `bg-teal-50/40` with a
 * `teal-200` border — a tint under eight lines of reading text, which is the
 * one thing Part 7 is not advisory about. On white the body is `gray-800` at
 * 12.63 flat and the tint buys nothing the hairline and the shadow do not.
 * Depth is EMISSION rather than stacking (Part 3): one `DAY_WIRE` hairline
 * plus a soft blue glow, never a hard-edged drop shadow.
 *
 * THE LEFT SPINE IS THE BRAND'S ONE HUE, NOT THE THREE. A 3px `teal-600` edge
 * marks "this is the artifact" at a glance. The signature gradient stays on
 * the hero's eyebrow and the page's bookend — Part 2 gives fuchsia exactly two
 * homes, and five gradient spines down one article would dilute the one place
 * it means something.
 *
 * 14px RADIUS — Part 3's cards step, against a page that was uniformly
 * `rounded-xl` (12px, the small-tile step). Nothing in CI grades a radius.
 *
 * THE LABEL IS `MONO_LABEL` AT 0.75rem, and that is a Part 4 defect closing
 * rather than a restyle: it was `text-[0.72rem]` = **11.52px**, under this
 * site's own 12px floor, and it is one of the eight literals the `docs/
 * RELEASE.md` Part 5 entry "nothing grades `app/(marketing)` against Part 4's
 * 12px floor" lists. `app/(marketing)` is in no `SCAN_DIRS` any guard walks,
 * so nothing was ever going to catch it. Fixed here on that entry's own stated
 * rule — the PR rebuilding the element it sits on fixes it — and the entry is
 * updated rather than closed: seven remain, on surfaces this PR never opened.
 *
 * ── TWO KINDS OF ARTIFACT LIVE IN THIS CARD, AND ONE OF THEM WAS BROKEN ───
 *
 * `kind="script"` (the default) is human copy a practice will paste into an
 * email, a text or a phone call. Sans is right for it: it is prose, and it
 * should look like what the patient will receive.
 *
 * `kind="figures"` is the membership guide's worked example, and it is a
 * COLUMN OF ARITHMETIC held together by leader dots —
 * `2 cleanings ........ 2 × $120 = $240`. That only lines up in a monospace
 * face, and it has been shipping in a proportional one, so the numbers the
 * whole guide is about have never actually formed a column. `BRAND.md` Part 4
 * names this case exactly: mono is for "any number the reader is meant to
 * compare". 0.98rem is well clear of the 12px floor, so this is the mono
 * register at READING size rather than a micro-label.
 *
 * It is a named kind rather than a boolean because the name is the rule: a
 * future card is one or the other, and `mono` would invite "this one looks
 * nicer in mono", which is how a typeface stops meaning anything.
 *
 * ONE HONEST LIMIT, MEASURED RATHER THAN GLOSSED. The worked example's widest
 * line is ~66 characters, and at 390 the card's inner box is ~326px — so at
 * any type size above the 12px floor it WRAPS, and a wrapped leader column is
 * not a column. That is not a regression: the sans version wrapped at 390 too
 * AND lined up at no width at all, because `pre-line` was eating its
 * indentation. So this is strictly better everywhere and merely imperfect at
 * one width. The real fix is to stop the block being ASCII art — structured
 * rows that reflow, with the value right-aligned — which is a rebuild of the
 * CONTENT rather than of its presentation, and belongs to its own change
 * rather than being smuggled into a brand move.
 */
export function ScriptCard({
  label,
  kind = 'script',
  children,
}: {
  label: string
  kind?: 'script' | 'figures'
  children: ReactNode
}) {
  return (
    <figure
      className="mt-6 overflow-hidden rounded-[14px] border border-l-[3px] border-l-teal-600 bg-white shadow-[0_2px_14px_-6px_rgb(76_125_240/0.35)]"
      style={{ borderTopColor: DAY_WIRE, borderRightColor: DAY_WIRE, borderBottomColor: DAY_WIRE }}
    >
      <figcaption
        className={`border-b px-4 py-2.5 text-teal-700 ${MONO_LABEL}`}
        style={{ borderColor: DAY_WIRE }}
      >
        {label}
      </figcaption>
      {/* `whitespace-pre-line` KEEPS THE LINE BREAKS AND STILL WRAPS, which
          is what makes the figures block safe without a scroll container. The
          obvious spelling — `overflow-x-auto` so the widest arithmetic line
          never breaks — would re-create the exact pair of defects move 6 page
          2 spent a PR closing on the capability matrix: a horizontal scroll
          region, and `scrollable-region-focusable` because it has no keyboard
          path. A column that wraps at 390 is worse-looking than one that
          scrolls; a scroll region a keyboard cannot reach is worse than both,
          and `BRAND.md` Part 10 makes the first one build-blocking anyway.
          0.85rem (13.6px, clear of the 12px floor) is what keeps the longest
          line unwrapped at 834 and up. */}
      {/* `pre-WRAP` for figures, `pre-LINE` for scripts, and that difference
          is half the fix. `pre-line` COLLAPSES runs of spaces, so the worked
          example's indentation and its leader columns were being thrown away
          before the typeface ever got a chance to line them up. `pre-wrap`
          keeps them and still wraps. A script has no meaningful indentation
          and keeps `pre-line`, which is what stops a stray double space in a
          template from reaching a reader's screen. */}
      <blockquote
        className={`px-4 py-4 leading-relaxed text-gray-800 ${
          kind === 'figures'
            ? 'whitespace-pre-wrap font-mono-num text-[0.85rem]'
            : 'whitespace-pre-line text-[0.98rem]'
        }`}
      >
        {children}
      </blockquote>
    </figure>
  )
}

/**
 * A "WATCH OUT" NOTE — the honest caveat, kept visible rather than dropped to
 * a footnote. The TCPA rules, the state regulation of in-house plans, the
 * vendors promising "#1 on Google": `DESIGN.md`'s honesty tenets are
 * load-bearing brand personality (Part 5), so these get MORE presence, not
 * less.
 *
 * AMBER IS THE RIGHT REGISTER HERE AND IT IS NOT A TONE-TILE VIOLATION. Part 3
 * withholds `amber` from the tone TILES because nothing on a benefit list is
 * urgent; a legal caveat genuinely is a caution, which is what that ramp
 * means. It stays outside `TONE_FILL`'s rule 5 the way the tiles do — this is
 * a 3px EDGE and a mono label, not a solid fill carrying ink.
 *
 * THE GROUND WENT WHITE, WHICH IS THE POINT. It was `gray-700` on
 * `bg-amber-50/60`; on white that run is 10.30 flat and reads straight, which
 * is what Part 5 demands of anything legal — *"no personality, no hedging, no
 * apology theatre"*. A tinted well is a softening, and these are the sentences
 * that must not be softened.
 */
export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 border-l-[3px] border-amber-600 pl-4">
      <p className={`mb-1.5 text-amber-700 ${MONO_LABEL}`}>Watch out</p>
      <p className="text-[0.98rem] leading-relaxed text-gray-700">{children}</p>
    </div>
  )
}
