/**
 * Grade every run of reading text that sits on a DECORATIVE LAYER, against the
 * ground that layer actually paints — and take the screenshots.
 *
 * Was `scripts/night-band-grade.mjs`. The night band is retired (Daylight
 * Dream, `BRAND.md` Part 8 move 1) and five of this script's six samples were
 * anchored to `section.bg-gray-950`, which no longer exists on the homepage —
 * so they matched nothing and the run reported zero rects rather than a wrong
 * number. The sixth still resolved and was actively wrong. Move 5 re-anchors it
 * at the surfaces that are actually there.
 *
 * WHY THIS EXISTS RATHER THAN A UNIT TEST, which has not changed and is the
 * whole reason it earns its keep. axe grades ink against `background-color`;
 * the source rules in `tests/a11y/class-pairs.ts` read class strings. A
 * `background-image` — a bloom, a grain, a radial wash — is invisible to both.
 * The only way to know a decorative layer has not walked a pair under 4.5:1 is
 * to render the page, hide the CONTENT, screenshot the decorative layers alone
 * and measure the pixels under each run of glyphs.
 *
 * THE EXTREMUM FOLLOWS THE INK; IT IS NOT A CONSTANT. This is the part the
 * rename is easy to get wrong.
 *
 *   - Dark ink on a LIGHT ground (the daylight hero, the ticker) — the worst
 *     case is the ground going DARK under the glyphs, so take the DARKEST pixel.
 *   - Pale ink on a DARK ground (the final CTA panel) — the worst case is the
 *     ground going BRIGHT, so take the BRIGHTEST pixel.
 *
 * Flipping the whole script to "darkest" — which is what the daylight ground
 * asks for on its own — and then adding any dark surface to the list would
 * grade that surface by its BEST case and report a false pass. So each sample
 * carries its own flat ground and the extremum is DERIVED from the ink's
 * polarity against it: one fewer thing a future editor can set wrong, and the
 * chosen extremum is printed in the report so a mis-set ground is visible.
 *
 * Three more choices, all of which move the number:
 *
 *   - EXTREMUM, never average. An average hides a lobe crossing one corner of a
 *     caption, which is exactly the failure this is looking for.
 *   - TEXT RECTS, not element boxes. The first draft sampled the `<p>`'s box
 *     and reported the night band's caption at 3.40 — but the caption was
 *     `text-center` in a full-width block, and the extreme pixel was 400px away
 *     from the nearest letter. Ground with no ink on it is not a contrast pair;
 *     this is what axe measures too. It is NOT a softening: the same change
 *     left a real 4.18 standing until the design moved.
 *   - A PHASE SWEEP, not one instant. `mkt-bloom` drifts the lobes on an 18s
 *     loop (-1.5% / +1.2% / scale 1.04), so "wait 3.5s and screenshot" grades
 *     whichever phase the wait happened to land on. Every region is measured at
 *     six frozen phases across the loop and the worst is kept. Phase 0 is the
 *     identity transform, which is also what `prefers-reduced-motion` pins the
 *     bloom to, so the reduced-motion ground is inside the sweep by
 *     construction. If the sweep ever stops moving — no sample's extremum
 *     changes at any phase — the run FAILS: a measurement that has quietly
 *     stopped measuring looks exactly like a clean one.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 *   - `MarketingFooter`. It is flat `bg-gray-950` with no wash under its text —
 *     the 3px gradient bar at its top edge carries no text, by rule. A flat
 *     ground is exactly what `tests/a11y/token-contrast.test.ts` and Part 7's
 *     hand table already grade correctly, so adding it here would duplicate a
 *     guard that works. The CTA selector below is a `div`, and the footer is a
 *     `<footer>`, so that boundary is structural rather than a comment.
 *   - The final CTA's primary button. Its fill is opaque `teal-700` painted
 *     OVER the wash, so the wash is not its ground; rule 3 in `class-pairs.ts`
 *     grades white-text fills from the class string and is right about it.
 *
 * ONE HONEST LIMIT, stated so nobody reads a number here as the last word.
 * Hiding a sample's content hides that element's OWN background too, so where a
 * run rides an opaque surface of its own the ground reported here is the
 * decorative layer BEHIND that surface rather than the surface. The hero
 * eyebrow is the live case: it is a `bg-white` pill, so its real ground is
 * white (7.05) and this script reports the bloom under the pill. That error is
 * always in the CONSERVATIVE direction — it can cost a passing pair a red run,
 * it can never pass a failing one — which is the only direction an instrument
 * like this is allowed to be wrong in.
 *
 * RUN IT AGAINST ANYTHING THAT SERVES THE PAGE:
 *
 *   BASE_URL=https://www.dreamcreatestudio.com node scripts/decorative-layer-grade.mjs
 *   BETTER_AUTH_SECRET=anything npx next dev -p 3112   # then BASE_URL=http://127.0.0.1:3112
 *
 * The local case needs only that one env var — it is what the homepage's
 * signed-in redirect checks reach for before they ever touch the database, so
 * without it every page is a 500 error shell. It does NOT need a database, and
 * it does not need the page edited: an earlier version of this harness stubbed
 * the auth guard out of `app/(marketing)/page.tsx` and put it back afterwards,
 * which was a scary amount of machinery for a missing environment variable.
 *
 * A sample that does not resolve FAILS the run rather than being skipped — the
 * `deadExclusions` lesson, pointed at this. That is precisely what would have
 * caught the five dead selectors this rewrite found by hand.
 *
 * IT GRADES MORE THAN ONE PAGE (DREAMCRM-75, move 6). A sample carries an
 * optional `path`, defaulting to `/`, and the run walks each page at each
 * width. Move 4 put `PageHero`'s bloom under reading text on eight subpages,
 * so "the homepage is where the decorative layers are" stopped being true
 * three moves before this script could say so — and Part 7's own repeated
 * lesson is that an instrument nobody can re-run is a number nobody re-checks.
 * The homepage's samples, filenames and numbers are untouched by the change,
 * which is what makes the homepage half of any run a regression check on the
 * change itself.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100'
const OUT = process.env.OUT_DIR ?? '.'
const WIDTHS = (process.env.WIDTHS ?? '1440,834,390').split(',').map((w) => Number(w.trim()))
/** `mkt-bloom` is an 18s loop; six phases across it, phase 0 included. */
const PHASES = [0, 3, 6, 9, 12, 15]
const FLOOR = 4.5

const lin = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))

/**
 * The hero is anchored on the layer this script is ABOUT rather than on its
 * ground colour: `.mkt-bloom` is the decorative wash, so the selector says "the
 * section that paints one". A future move that changes the band's ground keeps
 * this pointed at the right section; a move that deletes the wash turns every
 * hero sample NOT MEASURED, which is the correct loud failure.
 */
const HERO = 'section:has(.mkt-bloom)'
const TICKER = '[aria-label="Everything included"]'
/** The final CTA panel — a `div`, which is what keeps the `<footer>` out. */
const CTA = 'div.bg-gray-950'

/**
 * Every run of reading text that sits on a decorative layer, with the ink it is
 * written in and the flat ground it would ride with the layer removed — both
 * read off the element's own className and `app/css/style.css`, rather than
 * kept in a second list that can disagree.
 *
 * `region` groups samples into one screenshot each; `exclude` drops text nodes
 * under a descendant that is its own sample (the headline's two halves are two
 * different inks inside one `<h1>`).
 */
const SAMPLES = [
  {
    label: 'hero eyebrow badge (teal-700)',
    region: 'hero',
    selector: `${HERO} p.mkt-enter.mb-6`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    // The flat half: "Your whole front office." The gradient half is excluded
    // and graded below in its own ink — grading it as `gray-950` would report
    // a ratio the gradient's lighter stops do not have.
    label: 'hero headline, flat half (gray-950)',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    exclude: '.bg-clip-text',
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    // THE GRADIENT HALF, IN TWO RUNS, BECAUSE THE INK MOVES ACROSS IT.
    // `from-teal-600 via-violet-700 to-fuchsia-700` puts its stops at 0 / 50 /
    // 100% of the element's background box, and the three are 5.09 / 6.14 /
    // 6.27 flat on white — a 1.2-point spread. Grading the whole run against
    // the shallowest stop pairs `teal-600` with a dark pixel that may be 500px
    // away under the fuchsia end, which reported 4.58 at 834 and is not a
    // number about anything. So each half is clipped to its own span of the
    // box and graded against the SHALLOWER of its two endpoints.
    //
    // Still conservative in one small way, stated rather than hidden: Tailwind
    // v4 interpolates in oklab, so a midpoint could in principle sit under both
    // endpoints. Rule 4 in `class-pairs.ts` grades every named stop flat on
    // white and is the instrument for the stops themselves; what this adds is
    // the bloom's COST, which nothing else in the repo can see.
    label: 'hero headline, gradient left half (graded at teal-600)',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1 .bg-clip-text`,
    xSpan: [0, 0.5],
    ink: '#3a67d9',
    ground: '#ffffff',
  },
  {
    label: 'hero headline, gradient right half (graded at violet-700)',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1 .bg-clip-text`,
    xSpan: [0.5, 1],
    ink: '#5d47de',
    ground: '#ffffff',
  },
  {
    label: 'hero body copy (gray-600)',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'hero trust row (gray-600)',
    region: 'hero',
    selector: `${HERO} div.mkt-d4.mt-8`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    // Its own region: it sits BELOW the hero section on `surface-1`, so its
    // ground is not a bloom at all, and grading it with the hero is what
    // catches a lobe that has grown far enough down to reach it.
    label: 'ticker labels (gray-600)',
    region: 'ticker',
    selector: `${TICKER} span.flex`,
    ink: '#4c5a78',
    ground: '#f8faff',
  },
  {
    // THE DARK SURFACE NOTHING HAS EVER GRADED. `bg-gray-950` carrying white
    // and `gray-400`, with two `aria-hidden` radial gradients painted over it
    // as a `background-image` at 15% opacity — a decorative wash axe cannot
    // see, under reading text, on a surface no source rule grades. Pale ink on
    // a dark ground, so the extremum derives to BRIGHTEST here while every
    // sample above derives to darkest. That is the whole reason the extremum is
    // per-sample.
    label: 'final CTA headline (white)',
    region: 'cta',
    selector: `${CTA} h2`,
    ink: '#ffffff',
    ground: '#10182e',
  },
  {
    // The palest ink on that panel, and so the one with the least headroom:
    // 6.71 flat, and Part 7 records a single teal lobe at 16% alpha costing the
    // palest night ink 1.7 points.
    label: 'final CTA body copy (gray-400)',
    region: 'cta',
    selector: `${CTA} p`,
    ink: '#93a0bc',
    ground: '#10182e',
  },
  {
    // The ghost button's label rides the wash directly — its own fill is
    // transparent and only its border is drawn.
    label: 'final CTA ghost button (white)',
    region: 'cta',
    selector: `${CTA} a[target="_blank"]`,
    ink: '#ffffff',
    ground: '#10182e',
  },

  /* ── THE SUBPAGES (`BRAND.md` Part 8 move 6) ───────────────────────────
     `PageHero` paints `DaylightSky variant="page"` on all eight of them, so
     every subpage has ink on a decorative layer whether or not its body has
     been touched yet. The DREAMCRM-72 table measured that component; these
     measure it on the PAGE, which is a different claim: the bloom is sized in
     `vw` and the reading column's LENGTH is the page's own, so a longer
     headline wraps to a line the lobe reaches and the component's numbers do
     not know that. Move 6 adds one page's runs as it lands.

     WHAT IS DELIBERATELY NOT SAMPLED ON PRICING: the price panel, the module
     inventory and the FAQ. Every one of them is an OPAQUE surface painted over
     the ground — `bg-white` or `#F8FAFF` — so no wash reaches their ink, and
     the script's own honest limit at the top of this file says what would
     happen if they were listed anyway: hiding a sample's content hides its own
     background too, so it would report the bloom BEHIND the panel and could
     fail a pair that really rides white at 17.62. Conservative is the right
     direction for an instrument to be wrong in; it is not a reason to point it
     at something it cannot see. */
  {
    label: 'pricing hero eyebrow (teal-700)',
    path: '/pricing',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'pricing hero headline (gray-950)',
    path: '/pricing',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'pricing hero sub (gray-600)',
    path: '/pricing',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6 PAGE 2 — THE COMPARISON PAGES (DREAMCRM-76) ───────────────
     Two pages rather than one, because they are two different reading
     columns under the same component. `/compare/[vendor]` is the one that
     matters: its sub is `c.summary`, the longest run of body copy `PageHero`
     renders anywhere on the site — ten lines at 390 — so it reaches further
     down into the band than any sub the component's own table measured, and
     "the reading column's LENGTH is each page's own" (Part 7, the move-6
     rule) is exactly the case it is. `/compare` has a two-line sub and is
     here as the control.

     The vendor page also gained a hero CHILD on this move — the two-price
     panel. It is NOT sampled, for the reason the pricing page's panel is
     not: it is an opaque `bg-white` card, so no wash reaches its ink, and
     hiding a sample's content hides its own background too — the script
     would report the bloom BEHIND the panel and could fail a pair that
     really rides white. Conservative is the right direction for an
     instrument to be wrong in; it is not a reason to point it at something
     it cannot see.

     `weave` is the slug measured because it is the one both ledger entries
     were reproduced on. Every vendor page is the same template and the same
     `PageHero`; what differs between them is the LENGTH of the summary, and
     `patientpop` is checked by hand against this run when the copy moves. */
  {
    label: 'compare index hero eyebrow (teal-700)',
    path: '/compare',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'compare index hero headline (gray-950)',
    path: '/compare',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'compare index hero sub (gray-600)',
    path: '/compare',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'compare vendor hero eyebrow (teal-700)',
    path: '/compare/weave',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'compare vendor hero headline (gray-950)',
    path: '/compare/weave',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    // The longest `PageHero` sub on the site — see the note above.
    label: 'compare vendor hero sub (gray-600)',
    path: '/compare/weave',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6 PAGE 3 — THE PRODUCT TOUR (DREAMCRM-77) ───────────────────
     The page with the LONGEST HEADLINE on the site: "One system for the
     whole front office, zero copy-paste between the parts" wraps to three
     display lines at 1440 and to six at 390, so it reaches further down the
     band than any headline `PageHero` has been measured with — and the
     headline is the run the violet lobe passes behind (the DREAMCRM-72
     table: the lobe costs it up to 7.24, which it can afford at 10.37).
     This is the case that says whether "can afford" survives three more
     lines of it.

     WHAT IS DELIBERATELY NOT SAMPLED, and on this page the list is the
     whole body. The ten chapters, the "everything else" band and the close
     are all painted over the page's own ground — plain white, or the
     ticker's opaque `#F8FAFF` for the band — with no wash reaching any of
     them, exactly as on pricing and compare. The CHAPTER RAIL is the one
     that changed to make that true: it shipped `bg-white/90 backdrop-blur`,
     a translucent sticky bar with reading ink on it, and move 6 made it
     opaque rather than adding a second surface no instrument can see (see
     `app/(marketing)/product/chapter-rail.tsx`). Sampling any of these
     anyway would make the run WORSE rather than more thorough — hiding a
     sample's content hides its own background, so the script would report
     the bloom BEHIND an opaque surface and could fail a pair that really
     rides white at 17.62. */
  {
    label: 'product hero eyebrow (teal-700)',
    path: '/product',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    // The longest headline `PageHero` renders anywhere — see the note above.
    label: 'product hero headline (gray-950)',
    path: '/product',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'product hero sub (gray-600)',
    path: '/product',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6 PAGE 4 — THE MANIFESTO (DREAMCRM-78) ──────────────────────
     The page `BRAND.md` Part 7's bloom rule was written for. It is almost
     entirely prose — a long reading measure under a decorative band is the
     exact combination that produced the 4.18 this Part keeps quoting — so
     it is sampled for the same reason the others are, not as a formality.
     Its hero is the SHORTEST of the four move-6 subs (two lines at 1440),
     which makes it the control at the opposite end from `/compare/weave`'s
     ten: if the sub is the run with the least headroom because of where it
     crosses the violet lobe rather than because of its length, a two-line
     sub on this page should read close to the product tour's one-paragraph
     6.67 rather than close to pricing's 5.28.

     WHAT IS DELIBERATELY NOT SAMPLED: everything below the hero, because
     there is nothing to sample. The thesis, the six numbered beliefs and
     the close all ride the page's own white with no decorative layer of any
     kind — the same composition answer pages 1, 2 and 3 reached, and the
     one Part 7 asks for on a reading page. Sampling them anyway would make
     the run worse rather than more thorough: hiding a sample's content
     hides its own background, so the script would report whatever is behind
     an opaque surface and could fail a pair that really rides white. */
  {
    label: 'why hero eyebrow (teal-700)',
    path: '/why',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'why hero headline (gray-950)',
    path: '/why',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    // The shortest move-6 sub — the control at the other end from
    // `/compare/weave`'s ten lines. See the note above.
    label: 'why hero sub (gray-600)',
    path: '/why',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6 PAGE 5 — THE RESOURCE LIBRARY (DREAMCRM-79) ───────────────
     TWO PAGES, AND THE SECOND ONE IS THE POINT. The hub is an index; the
     ARTICLE is the longest sustained reading column on this site, and it
     is the surface `BRAND.md` Part 7's bloom rule is ultimately about.

     THE ARTICLE HERO GAINED A FOURTH RUN, which no other move-6 page has:
     `PageHero`'s `children` slot carries the read-time spine, and it sits
     LOWER in the band than the sub does — the one place on this site where
     a run of reading text is deliberately pushed further down into the
     blooms. The bottom fade is over it, which helps; nothing measured that
     before, so it is sampled rather than reasoned about.

     THE SLUG IS `dental-recall-scripts` because it has the LONGEST title
     of the three, which is what decides where the `h1` wraps and therefore
     which lobes each run crosses. `PageHero`'s title is `guide.title` on
     these pages, so the headline is content rather than a fixed string —
     the same property that made `/compare/weave`'s sub worth measuring.
     The other two slugs are checked by hand against this run when a title
     moves.

     WHAT IS DELIBERATELY NOT SAMPLED: everything below either hero, for
     pages 1–4's reason. The shelf, the article body, the script cards, the
     notes and both closes ride the page's own white with no decorative
     layer — and the script cards in particular went from a `teal-50/40`
     tint to white ON this move, precisely so no run of eight-line reading
     text sits on a wash. There is nothing left down there to point an
     instrument at, and pointing one anyway would report the ground behind
     an opaque card and could fail a pair that really rides white. */
  {
    label: 'resources hub hero eyebrow (teal-700)',
    path: '/resources',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'resources hub hero headline (gray-950)',
    path: '/resources',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'resources hub hero sub (gray-600)',
    path: '/resources',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'guide hero eyebrow (teal-700)',
    path: '/resources/dental-recall-scripts',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'guide hero headline (gray-950)',
    path: '/resources/dental-recall-scripts',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'guide hero sub (gray-600)',
    path: '/resources/dental-recall-scripts',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    // THE LOWEST RUN OF READING TEXT IN ANY HERO ON THIS SITE. See the note
    // above — it is `PageHero`'s `children`, below the sub, and no other
    // move-6 page puts text there.
    label: 'guide hero read-time spine (gray-600)',
    path: '/resources/dental-recall-scripts',
    region: 'hero',
    selector: `${HERO} div.mkt-d3 > div`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6 PAGE 6 — THE TOOLS (DREAMCRM-80) ───────────────────────────
     Three pages, nine runs. All three carried a BESPOKE hero before this
     move — `/grade` had no hero component at all and `/roi` and
     `/partner-program` each wore the `from-teal-50/60` band
     `compare/[vendor]` and `GuideShell` were found in — so none of them had
     a decorative layer for this script to point at, and none of them was in
     the sample set. They render `PageHero` now, which means they have one.

     `/partner-program` PUTS BUTTONS IN `PageHero`'s `children` SLOT, which
     is the same fourth-run position page 5 measured on the guide hero. It is
     deliberately NOT sampled: `PrimaryCta` carries white on a graded
     gradient FILL and `GhostCta` is an opaque white card carrying `gray-950`
     — neither is ink on the page's ground, so the darkest pixel under them
     is not the pair that decides anything. Page 5's read-time spine WAS
     reading text on the ground, which is why that one is in.

     WHAT IS DELIBERATELY NOT SAMPLED beyond that: everything below all three
     heroes, for pages 1–5's reason. The checks list, the calculator, the
     formula panels, the step rows, the terms, the FAQ and all three closes
     ride the page's own white with no decorative layer — the ROI headline
     card and the privacy note in particular went from `teal-50/50` and
     `gray-50` tints to white on this move, precisely so no run of reading
     text sits on a wash. */
  {
    label: 'grade hero eyebrow (teal-700)',
    path: '/grade',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'grade hero headline (gray-950)',
    path: '/grade',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'grade hero sub (gray-600)',
    path: '/grade',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'roi hero eyebrow (teal-700)',
    path: '/roi',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'roi hero headline (gray-950)',
    path: '/roi',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'roi hero sub (gray-600)',
    path: '/roi',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'partner hero eyebrow (teal-700)',
    path: '/partner-program',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'partner hero headline (gray-950)',
    path: '/partner-program',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'partner hero sub (gray-600)',
    path: '/partner-program',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },

  /* ── MOVE 6, PAGE 6b — `/changelog` and the help docs ─────────────────
     The last three heroes on the site to gain a decorative layer. All three
     already rendered `PageHero` on the INDEX routes and one of them did not
     on its article route (`/docs/[slug]` carried a hand-rolled `h1` with no
     bloom behind it at all), so `/docs/<slug>` is in this set for the first
     time rather than being re-measured.

     WHY `/blog` AND `/blog/[slug]` ARE NOT HERE, and it is the same boundary
     `e2e/marketing-viewport.spec.ts` draws for the same reason: their bodies
     come out of the DATABASE. This script drives a real browser against a
     built app, so on a freshly migrated database `/blog` renders its empty
     state and `/blog/<slug>` does not resolve at all — a decorative-layer
     grade that depends on fixture data is a grade that goes red for fixture
     reasons. Their heroes are `PageHero` verbatim with no page-specific
     runs, so the three `/docs` samples below measure the identical
     composition. When the blog gets a seeded stop, add it in both files.

     NOTHING BELOW ANY OF THESE HEROES IS SAMPLED, for pages 1–5's reason:
     the shelves, the chapter heads, the changelog items, the rails and all
     three closes ride the page's own white with no decorative layer, so the
     darkest pixel under them is the page's ground and the flat ratio is the
     rendered one. ── */
  {
    label: 'changelog hero eyebrow (teal-700)',
    path: '/changelog',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'changelog hero headline (gray-950)',
    path: '/changelog',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'changelog hero sub (gray-600)',
    path: '/changelog',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  {
    label: 'docs hero eyebrow (teal-700)',
    path: '/docs',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'docs hero headline (gray-950)',
    path: '/docs',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'docs hero sub (gray-600)',
    path: '/docs',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
  /* THE ARTICLE HERO, which is a DIFFERENT composition from the index's and
     the reason this route is sampled separately: its eyebrow is the doc's
     CATEGORY and its `h1` is the doc's title, so the runs are page-specific
     lengths over the same bloom. The `children` spine (tile, read time, the
     way back) is deliberately not sampled — `ToneTile` is a graded tint
     carrying its own ink, not text on the page's ground. */
  {
    label: 'doc article hero eyebrow (teal-700)',
    path: '/docs/create-your-practice-account',
    region: 'hero',
    selector: `${HERO} div.mkt-enter.mb-5`,
    ink: '#2f52b3',
    ground: '#ffffff',
  },
  {
    label: 'doc article hero headline (gray-950)',
    path: '/docs/create-your-practice-account',
    region: 'hero',
    selector: `${HERO} h1.mkt-d1`,
    ink: '#10182e',
    ground: '#ffffff',
  },
  {
    label: 'doc article hero sub (gray-600)',
    path: '/docs/create-your-practice-account',
    region: 'hero',
    selector: `${HERO} p.mkt-d2`,
    ink: '#4c5a78',
    ground: '#ffffff',
  },
]

/**
 * WHICH PAGE EACH SAMPLE LIVES ON — `path`, defaulting to the homepage.
 *
 * Added for move 6 (DREAMCRM-75). Before it this script hard-coded `/`, which
 * was right while the only decorative layers on the site were the homepage's;
 * `PageHero`'s bloom put a wash under reading text on eight more pages on
 * DREAMCRM-72, and an instrument that cannot be pointed at them is an
 * instrument nobody re-runs — which is the failure mode Part 7 records this
 * script as the answer to.
 *
 * The homepage's own samples and filenames are UNCHANGED, on purpose: Part 7's
 * table is what this run re-derives, and a rename would have made "did the
 * numbers move?" unanswerable in the same commit that widened the field of
 * view.
 */
const pathOf = (s) => s.path ?? '/'
const PAGES = [...new Set(SAMPLES.map(pathOf))]
/** `/` keeps the bare filenames Part 7's evidence shots already use. */
const slugOf = (path) => (path === '/' ? '' : `${path.replace(/^\/|\/$/g, '').replace(/\W+/g, '-')}-`)

/** Derived, never declared: the ink's polarity against its own flat ground. */
const extremumFor = (s) => (luminance(hex(s.ink)) < luminance(hex(s.ground)) ? 'darkest' : 'brightest')

// Samples are keyed by `label`, not by selector: the headline's gradient is one
// element graded as two runs, so a selector is no longer a unique name.
//
// Built per PAGE rather than once. Two pages share the `section:has(.mkt-bloom)`
// anchor with different descendants, so a global hide list would reach across
// them — harmless today, and exactly the kind of "it happened to still work"
// that goes wrong the first time two pages share a class.
const hideContentFor = (list) =>
  [...new Set(list.map((s) => s.selector))]
    .map((selector) => `${selector} { visibility: hidden !important; }`)
    .join('\n')
/**
 * Freeze every animation, then put the bloom at one chosen phase of its loop.
 * A negative `animation-delay` on a paused animation is how you address a
 * specific frame of it without a video capture.
 */
const freezeAt = (phase) => `
  *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
  .mkt-bloom { animation-delay: -${phase}s !important; }
`

/**
 * SETTLE THE SCROLL REVEALS — and it must run after EVERY load, not once.
 *
 * Found on DREAMCRM-75, reproduced against the committed script before this
 * was written: `components/clinic-site/scroll-reveal.tsx` renders every
 * below-the-fold section at `opacity: 0` until an IntersectionObserver fires,
 * and this script never scrolled. So whether the final CTA panel had been
 * PAINTED AT ALL when it was graded came down to whether one of the `fullPage`
 * screenshots happened to trip the observer first — and when it did not, all
 * three CTA samples graded the WHITE PAGE behind an invisible panel and
 * reported 1.00 / 2.63 / 1.00.
 *
 * That is a FALSE RED, which is the only direction an instrument like this is
 * allowed to be wrong in — it can never pass a failing pair. It is still a
 * defect, because a script whose whole argument is "an instrument nobody
 * re-runs is a number nobody re-checks" cannot afford a run people learn to
 * discount. Walking the page the way a reader does makes it deterministic.
 *
 * WHY IT IS A FUNCTION RATHER THAN A LINE AFTER `goto`. The run reloads twice
 * between the first load and the measurement — once for the reduced-motion
 * evidence shot and once to come back — and a reload resets every reveal to
 * `pre`. The first version of this fix settled only after `goto`, and the CTA
 * samples still reported 1.00: the whole point was two reloads downstream of
 * it. Both call sites are load-bearing, so both are named.
 *
 * Rects are recorded in PAGE coordinates (`+ window.scrollY`) and every clip is
 * `fullPage`, so returning to the top leaves every later step unchanged. The
 * cinematic spine is safe to walk through: Part 6 derives it from one scroll
 * position with nothing queued, so scrolling back to 0 returns it to rest —
 * which is the state the hero samples are measured in, and the homepage's
 * numbers re-deriving to Part 7's table is the evidence that it does.
 */
const settleReveals = async (page) => {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.75)
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
  })
  // The reveal's own transition is 700ms; measuring mid-fade measures a blend,
  // which is the thing this step exists to stop doing.
  await page.waitForTimeout(900)
}

const regionsOf = (list) => [...new Set(list.map((s) => s.region))]

const browser = await chromium.launch()
const report = []
let worst = Infinity
let failed = false
let anyPhaseMoved = false

// The page loop wraps the width loop at ONE space of indent rather than
// re-indenting the 180 lines inside it. That is deliberate: this file's value
// is that its every choice is readable and argued, and a whole-body reindent
// would have hidden a four-line change inside a diff nobody could review.
for (const pagePath of PAGES) {
 const PAGE_SAMPLES = SAMPLES.filter((s) => pathOf(s) === pagePath)
 const slug = slugOf(pagePath)
 const HIDE_CONTENT = hideContentFor(PAGE_SAMPLES)
 for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle' })
  // Entrance animations are opacity fades; measuring mid-fade measures a blend
  // (the lesson `e2e/axe.ts`'s settleAnimations note records).
  await page.waitForTimeout(3500)

  await settleReveals(page)

  /* ── 1. the screenshots a person looks at ─────────────────────────────── */
  await page.screenshot({ path: `${OUT}/${slug}hero-${width}.png`, clip: { x: 0, y: 0, width, height: 1000 } })
  // `.boundingBox()` AUTO-WAITS, so a dead selector here hangs 30s and throws
  // a Playwright stack trace BEFORE the report is written — you learn that
  // something broke and not which samples went dark. That is the wrong failure
  // for the one defect this script exists to survive, so the evidence shot asks
  // whether the element is there and lets the grade below do the reporting.
  const wantsCta = PAGE_SAMPLES.some((s) => s.region === 'cta')
  const ctaBox = wantsCta && (await page.$(CTA)) ? await page.locator(CTA).first().boundingBox() : null
  if (ctaBox) {
    await page.screenshot({
      path: `${OUT}/${slug}cta-panel-${width}.png`,
      fullPage: true,
      clip: { x: 0, y: Math.max(0, ctaBox.y - 16), width, height: ctaBox.height + 32 },
    })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.screenshot({
    path: `${OUT}/${slug}hero-${width}-reduced-motion.png`,
    clip: { x: 0, y: 0, width, height: 1000 },
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  // The reload above reset every `ScrollReveal` to `opacity: 0`, and THIS is
  // the load every number below is measured from. See `settleReveals`.
  await settleReveals(page)

  /* ── 2. where the ink actually is ─────────────────────────────────────── */
  // One rect per LINE of text, not the block's box, and every element the
  // selector matches rather than only the first — the ticker is 19 labels.
  const rects = await page.evaluate((specs) => {
    const out = {}
    for (const { key, selector, exclude, xSpan } of specs) {
      const found = []
      for (const el of document.querySelectorAll(selector)) {
        // `xSpan` is a fraction of the ELEMENT's box, not of each line's box:
        // a `bg-clip-text` gradient is laid out across the background box, so
        // that is the frame its stops are positioned in.
        const box = el.getBoundingClientRect()
        const lo = xSpan ? box.x + xSpan[0] * box.width : -Infinity
        const hi = xSpan ? box.x + xSpan[1] * box.width : Infinity
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          if (!node.nodeValue || !node.nodeValue.trim()) continue
          if (exclude && node.parentElement?.closest(exclude)) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const r of range.getClientRects()) {
            const x0 = Math.max(r.x, lo)
            const x1 = Math.min(r.x + r.width, hi)
            if (x1 - x0 > 0 && r.height > 0) {
              found.push({ x: x0 + window.scrollX, y: r.y + window.scrollY, width: x1 - x0, height: r.height })
            }
          }
        }
      }
      if (found.length) out[key] = found
    }
    return out
  }, PAGE_SAMPLES.map(({ label, selector, exclude, xSpan }) => ({ key: label, selector, exclude: exclude ?? null, xSpan: xSpan ?? null })))

  /* ── 3. hide the content, sweep the bloom's loop ──────────────────────── */
  // Everything below the fold is measured with a `fullPage` clip per region:
  // a viewport-clipped shot silently drops the ticker and the CTA panel, which
  // reads as "selector not found" — the exact shape of a measurement that has
  // quietly stopped measuring.
  await page.addStyleTag({ content: HIDE_CONTENT })
  await page.waitForTimeout(150)

  const probe = await browser.newPage()
  await probe.setContent('<canvas id="c"></canvas>')

  /** Region clip = the union of that region's own text rects, padded. */
  const clips = {}
  for (const region of regionsOf(PAGE_SAMPLES)) {
    const list = PAGE_SAMPLES.filter((s) => s.region === region).flatMap((s) => rects[s.label] ?? [])
    if (!list.length) continue
    const x0 = Math.max(0, Math.floor(Math.min(...list.map((r) => r.x)) - 4))
    const y0 = Math.max(0, Math.floor(Math.min(...list.map((r) => r.y)) - 4))
    const x1 = Math.ceil(Math.max(...list.map((r) => r.x + r.width)) + 4)
    const y1 = Math.ceil(Math.max(...list.map((r) => r.y + r.height)) + 4)
    clips[region] = { x: x0, y: y0, width: Math.min(width - x0, x1 - x0), height: y1 - y0 }
  }

  /** selector → { rgb, phase } for the worst pixel seen at any phase. */
  const found = {}
  const moved = {}
  for (const phase of PHASES) {
    const freeze = await page.addStyleTag({ content: freezeAt(phase) })
    await page.waitForTimeout(120)
    for (const [region, clip] of Object.entries(clips)) {
      const shot = await page.screenshot({ fullPage: true, clip })
      if (phase === PHASES[0]) {
        await page.screenshot({ path: `${OUT}/${slug}decorative-layers-${region}-${width}.png`, fullPage: true, clip })
      }
      const members = PAGE_SAMPLES.filter((s) => s.region === region && rects[s.label])
      const boxes = Object.fromEntries(members.map((s) => [s.label, rects[s.label]]))
      const modes = Object.fromEntries(members.map((s) => [s.label, extremumFor(s)]))
      const hits = await probe.evaluate(
        async ([dataUrl, boxSet, modeSet, origin]) => {
          const img = new Image()
          await new Promise((res) => {
            img.onload = res
            img.src = dataUrl
          })
          const c = document.getElementById('c')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const scale = img.width / origin.width
          const out = {}
          for (const [key, list] of Object.entries(boxSet)) {
            const wantDark = modeSet[key] === 'darkest'
            let best = null
            let bestSum = wantDark ? Infinity : -1
            for (const b of list) {
              const x = Math.max(0, Math.round((b.x - origin.x) * scale))
              const y = Math.max(0, Math.round((b.y - origin.y) * scale))
              const w = Math.min(img.width - x, Math.round(b.width * scale))
              const h = Math.min(img.height - y, Math.round(b.height * scale))
              if (w <= 0 || h <= 0) continue
              const d = ctx.getImageData(x, y, w, h).data
              for (let i = 0; i < d.length; i += 4) {
                const sum = d[i] + d[i + 1] + d[i + 2]
                if (wantDark ? sum < bestSum : sum > bestSum) {
                  bestSum = sum
                  best = [d[i], d[i + 1], d[i + 2]]
                }
              }
            }
            if (best) out[key] = best
          }
          return out
        },
        [`data:image/png;base64,${shot.toString('base64')}`, boxes, modes, clip],
      )
      for (const s of members) {
        const rgb = hits[s.label]
        if (!rgb) continue
        const ratio = contrast(hex(s.ink), rgb)
        const prev = found[s.label]
        if (prev && prev.rgb.join() !== rgb.join()) moved[s.label] = true
        if (!prev || ratio < prev.ratio) found[s.label] = { rgb, ratio, phase }
      }
    }
    await freeze.evaluate((el) => el.remove())
  }
  await probe.close()

  // The sweep is an instrument too. If NOT ONE sample's extremum changed at any
  // phase, the freeze is not addressing the loop and every number above is a
  // single instant wearing a sweep's clothes.
  if (Object.keys(moved).length) anyPhaseMoved = true

  /* ── 4. the grade ─────────────────────────────────────────────────────── */
  const heading = `${pagePath}  ${width}px`
  report.push('', `── ${heading} ${'─'.repeat(Math.max(0, 62 - heading.length))}`)
  for (const s of PAGE_SAMPLES) {
    const hit = found[s.label]
    // A sample that did not resolve is a FAILURE of the instrument, not a pass.
    if (!hit) {
      report.push(`NOT MEASURED  ${s.label}  (${s.selector})`)
      failed = true
      continue
    }
    const flat = contrast(hex(s.ink), hex(s.ground))
    worst = Math.min(worst, hit.ratio)
    report.push(
      `${hit.ratio >= FLOOR ? 'PASS' : 'FAIL'}  ${s.label}`,
      `        ink ${s.ink} · ${extremumFor(s)} ground under it rgb(${hit.rgb.join(' ')}) at phase ${hit.phase}s`,
      `        ${hit.ratio.toFixed(2)} rendered   (${flat.toFixed(2)} flat on ${s.ground}, cost ${(flat - hit.ratio).toFixed(2)})`,
    )
  }
  await page.close()
 }
}

report.push('')
if (!anyPhaseMoved) {
  report.push('PHASE SWEEP NOT MOVING — no sample changed at any phase of `mkt-bloom`.')
  report.push('The freeze is not addressing the loop; these numbers are one instant, not a sweep.')
  failed = true
}
report.push(
  failed
    ? 'THE INSTRUMENT DID NOT FULLY MEASURE — the grade above is incomplete.'
    : `worst rendered pair on a decorative layer: ${worst.toFixed(2)} against a ${FLOOR} floor`,
)
const text = report.join('\n')
console.log(text)
writeFileSync(`${OUT}/decorative-layer-grade.txt`, text + '\n')

await browser.close()
process.exit(!failed && worst >= FLOOR ? 0 : 1)
