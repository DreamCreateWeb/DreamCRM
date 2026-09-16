import Link from 'next/link'
import { FOOTER_COLUMNS, MARKETING } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { TONE_FILL } from '@/lib/ui/encodings'
import {
  TILE_TONE_CLASSES,
  TONE_TILE_TONE,
  type ToneTileGlyph,
} from '@/lib/marketing/tone-tiles'

/**
 * Server-side primitives for the marketing site: footer, section scaffolds,
 * CTAs, motion styles, and the product mocks.
 *
 * ONE REGISTER LIVES HERE NOW, and `BRAND.md` ("Daylight Dream") is the binding
 * language for it: white and `surface-1` grounds, gray-950 / gray-600 ink,
 * teal-600/700 accents, and the signature gradient `teal-600 → violet-700 →
 * fuchsia-700` whose every stop is legal AS INK on white (Part 7).
 *
 * THE NIGHT BAND IS GONE (DREAMCRM-69, BRAND.md Part 8 move 1). The owner lived
 * with the dark hero and reversed it on DREAMCRM-67, so `NightSky`, the 56px
 * `NIGHT_GRID` he vetoed by name, the star field, the scan sweep and the two
 * night CTAs were deleted rather than lightened. What replaced them is
 * `DaylightSky` below — saturated blooms plus film grain on white.
 *
 * ONE DARK SURFACE REMAINS and it is the footer, which is where `BRAND.md`
 * Part 7's hand-graded discipline still binds: a dark band inside a light-mode
 * page has no `.dark` scope, so `tests/a11y/dark-mode-parity.test.ts`
 * structurally cannot see it, and axe grades ink against `background-color` and
 * so cannot see a decorative layer at all. gray-400 on gray-950 is 6.71;
 * gray-500 is 3.32 and is pinned as a NEGATIVE in `token-contrast.test.ts`
 * because it is the pair that actually shipped live for months.
 *
 * THE DAYLIGHT GROUND INVERTS THE RISK RATHER THAN REMOVING IT. On the night
 * band a bright wash walked pale ink down; on white a saturated bloom walks the
 * GROUND down under dark ink, and axe still cannot see a `background-image`.
 * Every bloom below is therefore centred OUTSIDE the reading column, and the
 * measured run — darkest rendered pixel under each run of glyphs, grain ON — is
 * recorded in `BRAND.md` Part 7.
 *
 * The mocks are deliberately built from real copy — names, times, message
 * text, prices — so they read as screenshots of the actual product, not
 * wireframe placeholders. They're CSS/JSX (retina-crisp, theme-consistent,
 * zero image weight) and aria-hidden (decorative).
 */

/* ── Motion (CSS-only, reduced-motion safe) ─────────────────────────── */

/** Keyframes + utility classes for the marketing pages. Rendered once in the
 *  marketing layout. Everything degrades to static under reduced motion.
 *
 *  `mkt-bloom` and `mkt-live` are the daylight band's two ambient loops and
 *  they obey `BRAND.md` Part 6: ONE ambient loop per band plus the live dot,
 *  compositor-only properties (transform/opacity, never layout), ease-out with
 *  no spring overshoot — `--spring-pop` is the dashboard's cute register and
 *  reads as bounce here.
 *
 *  `mkt-bloom` is the renamed `mkt-aurora` (DREAMCRM-69): same 18s drift, same
 *  compositor-only transform, pointed at the light blooms instead of the night
 *  band's aurora. `mkt-stars` (the star field) and `mkt-scan` (the one-shot
 *  sweep announcing the band's top edge) went with the band — there is no seam
 *  left to announce. */
export function MarketingMotionStyles() {
  return (
    <style>{`
      @keyframes mkt-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes mkt-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      @keyframes mkt-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes mkt-bloom { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(-1.5%, 1.2%, 0) scale(1.04); } }
      @keyframes mkt-live { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.9; transform: scale(2.1); } }
      .mkt-enter { opacity: 0; animation: mkt-fade-up 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .mkt-d1 { animation-delay: 0.08s; } .mkt-d2 { animation-delay: 0.16s; }
      .mkt-d3 { animation-delay: 0.24s; } .mkt-d4 { animation-delay: 0.34s; }
      .mkt-float { animation: mkt-float 7s ease-in-out infinite; }
      .mkt-float-slow { animation: mkt-float 9s ease-in-out 1.2s infinite; }
      .mkt-marquee-track { display: flex; width: max-content; animation: mkt-marquee 36s linear infinite; }
      .mkt-marquee:hover .mkt-marquee-track { animation-play-state: paused; }
      .mkt-bloom { animation: mkt-bloom 18s ease-in-out infinite; will-change: transform; }
      .mkt-live { animation: mkt-live 1.8s ease-in-out infinite; }
      /* The tone tile's hover lift (BRAND.md Part 6: "Hover, pointer-fine
         only", 140ms, ease-out, NO spring overshoot — the overshoot is the
         dashboard's cute register and reads as bounce here). A media query
         rather than a Tailwind \`hover:\` because \`hover:\` also fires on a
         touch-and-hold, which is the case Part 6's rule excludes. The
         transition is declared INSIDE the gate too, so a coarse pointer never
         carries a transition it can never trigger. */
      /* THE ARROW NUDGE, on the same gate and for the same reason. A "→" that
         leans toward where it is going when the cursor arrives is the site's
         one link affordance, and it shipped on DREAMCRM-78 as a Tailwind
         \`group-hover:translate-x-0.5\` — which is the exact spelling the note
         above says is wrong, because \`hover:\` also fires on a touch-and-hold.
         It is here rather than at a call site on the SectionOpener argument
         (move 6 page 2): a private copy of a motion recipe is fine while ONE
         page wants it, and the second page wanting it is the moment that
         flips. \`mkt-nudge-host\` rather than \`group\` so a row can carry both
         this and a tone tile without one hover firing the other. */
      @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
        .mkt-tile { transition: transform 140ms ease-out; }
        .group:hover .mkt-tile { transform: translateY(-1px) scale(1.06); }
        .mkt-nudge, .mkt-nudge-back { transition: transform 140ms ease-out; }
        .mkt-nudge-host:hover .mkt-nudge { transform: translateX(2px); }
        .mkt-nudge-host:hover .mkt-nudge-back { transform: translateX(-2px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .mkt-enter { opacity: 1; animation: none; }
        .mkt-float, .mkt-float-slow { animation: none; }
        .mkt-marquee-track { animation: none; }
        .mkt-bloom, .mkt-live { animation: none; }
      }
${SPINE_CSS}
    `}</style>
  )
}

/* ── The daylight band ──────────────────────────────────────────────── */

/**
 * THE HAIRLINE. `BRAND.md` Part 2 calls this "hairline" on the daylight
 * ground, and it draws every 1px edge the hero owns: the eyebrow pill, the
 * ticker's top and bottom rules, the glass around the product mock. Spelled
 * once here because "which blue is the hairline" drifting by a few percent
 * across six call sites is how a precise surface stops reading as precise.
 *
 * It replaces `NIGHT_WIRE` (`rgb(124 165 255 / 0.13)`), which was the same
 * idea pointed at a dark ground and went with the band.
 */
export const DAY_WIRE = 'rgb(76 125 240 / 0.16)'

/**
 * THE CINEMATIC SPINE'S LAYOUT — `BRAND.md` Part 6, DREAMCRM-70. The behaviour
 * lives in `components/marketing/cinematic-spine.tsx`; this is the half of it
 * that is not JavaScript, and the split matters:
 *
 * **The BASE rules are the real stacked layout, and the pinned sequence is a
 * block of CSS that only EXISTS where the pin is legal.** Part 6 requires that
 * `prefers-reduced-motion` gets "a real layout, not a disabled one", and the
 * only way to owe that rather than claim it is for the ordinary reading layout
 * to be what the server renders and what every excluded reader keeps. So the
 * cascade runs in the safe direction: no gate, no pin, real page.
 *
 * ONE GATE, NOT A PILE OF REVERTS — and that is a correction, not a taste
 * call. This shipped as three `@media` blocks that UNDID `.is-cinematic` under
 * reduced motion, a coarse pointer and anything under `lg`, and the header
 * here claimed "either half alone is sufficient". Vesper's review of
 * DREAMCRM-70 measured that claim and it was false: the reverts put back
 * `position`, `height`, `opacity` and `transform` but not `width`, `margin`,
 * `pointer-events` or the rail's reserved lane, so the CSS half on its own
 * left the chapter cards at 528px jammed against the left edge. Worse, there
 * was no block for `print` at all — printing the homepage produced three pages
 * of a pinned section carrying NONE of its four chapters, which is exactly the
 * "content reachable only by animating" Part 6 forbids, in a medium nobody
 * thought of.
 *
 * A revert list is a copy of the thing it reverts, and a copy drifts. So there
 * is nothing to revert any more: every pinned rule sits inside the one
 * `@media` gate below, and outside it those declarations are not in the
 * stylesheet at all. `screen` is load-bearing — it is what keeps the sequence
 * out of print. `no-preference` fails CLOSED on a browser that does not know
 * the feature, which is the direction to be wrong in.
 *
 * The component ALSO decides, and adds `.is-cinematic` only where it agrees
 * with this gate, plus one question CSS cannot ask: whether the tallest
 * chapter card actually fits the window. The class is how the JavaScript knows
 * to paint; the gate is what makes the layout safe whether or not the class is
 * right. So the CSS half really is sufficient on its own now.
 *
 * Every animated property here is `transform` or `opacity` (Part 6), and none
 * of it is a CSS transition or animation — the values arrive as custom
 * properties recomputed from one scroll position, which is what makes the
 * sequence interruptible with nothing to unwind.
 */
const SPINE_CSS = `
      /* ── BASE: four ordinary stacked sections, top to bottom ── */
      .mkt-spine-intro { max-width: 46rem; margin-inline: auto; padding: 3.5rem 1rem 0; text-align: center; }
      /* NO aspect-ratio here, on purpose. A fixed ratio clipped the last row
         of the schedule at 390 and at 834 — a frame cropping its own content
         mid-row reads as broken rather than as a crop, and Part 10's rule is
         that what changes down the widths is scale and stacking, never
         identity. So the frame's height follows the product it contains. The
         pinned sequence overrides this to the viewport anyway. */
      .mkt-spine-stage {
        position: relative; overflow: hidden; margin: 2.5rem auto 0;
        width: min(100% - 2rem, 72rem);
        border-radius: 1.75rem; border: 1px solid ${DAY_WIRE};
        box-shadow: 0 0 70px -24px rgb(93 71 222 / 0.35), 0 24px 80px -44px rgb(26 36 64 / 0.4);
      }
      .mkt-spine-cards { margin: 2.5rem auto 0; width: min(100% - 2rem, 72rem); display: grid; gap: 0.85rem; }
      .mkt-spine-card-glass {
        border-radius: 1.25rem; border: 1px solid ${DAY_WIRE}; background: #fff; padding: 1.5rem;
        box-shadow: 0 2px 6px rgb(76 125 240 / 0.06), 0 14px 36px rgb(76 125 240 / 0.1);
      }
      .mkt-spine-rail { display: none; }
      @media (min-width: 640px) { .mkt-spine-card-glass { padding: 1.85rem; } }

      /* ── THE PINNED SEQUENCE. Everything in this block exists ONLY under the
            gate: a real pointer, a viewport wide enough, motion not asked
            down, and \`screen\` — so print gets the stacked layout with all
            four chapters on it. See this constant's header for why there is a
            gate here rather than the three revert blocks that used to sit at
            the bottom of this stylesheet. ── */
      @media screen and (min-width: 1024px) and (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) {
      .mkt-spine.is-cinematic .mkt-spine-track { height: calc(var(--mkt-spine-steps, 5) * 100vh); }
      /* \`position: sticky\` is the pin. The DOCUMENT keeps scrolling the whole
         time, which is what makes the section escapable and the sequence
         reversible — nothing here touches the reader's scroll input. */
      .mkt-spine.is-cinematic .mkt-spine-pin { position: sticky; top: 0; height: 100vh; overflow: hidden; }
      /* z-index 0, UNDER the stage: Part 6 step 2 says the headline "fades
         BEHIND it", and the first draft had the intro at z-index 2, where it
         faded ON TOP of the product and went muddy grey over the schedule on
         the way out. Behind is both the spec and the better picture — the
         growing frame occludes the headline while it fades, which is the
         cinematic move rather than a cross-dissolve. At rest the frame sits
         low enough in the viewport that it covers nothing. */
      .mkt-spine.is-cinematic .mkt-spine-intro {
        position: absolute; inset: 0 0 auto 0; z-index: 0; margin: 0; max-width: none;
        padding: clamp(5.5rem, 13vh, 9rem) 1.5rem 0;
        opacity: var(--mkt-io, 1);
        transform: translate3d(0, calc(var(--mkt-iy, 0) * 1px), 0);
        will-change: opacity, transform;
      }
      .mkt-spine.is-cinematic .mkt-spine-intro > * { margin-inline: auto; max-width: 46rem; }
      .mkt-spine.is-cinematic .mkt-spine-stage {
        position: absolute; inset: 0; z-index: 1;
        width: auto; margin: 0; transform-origin: 50% 50%;
        transform: translate3d(0, calc(var(--mkt-sy, 12) * 1vh), 0) scale(var(--mkt-ss, 0.56));
        will-change: transform;
      }
      /* RESERVE THE CHAPTER RAIL'S LANE, and reserve it from the one element
         in the picture that is pure decoration. The rail has to land somewhere,
         and the first draft padded the whole stage to clear it — which read as
         a gap on the right of the frame AT REST, where the rail is not even
         visible yet. So the bar chart gives up its right end instead: the bars
         are the data, they carry no text, and a chart that spans slightly less
         width is not something a reader can notice. Reserved rather than
         parked-where-nothing-is-today, because the stage's column heights move
         with the viewport and "nothing is there" is only true at one size. */
      .mkt-spine.is-cinematic .mkt-stage-chart { padding-right: clamp(15rem, 19vw, 17rem); }
      .mkt-spine.is-cinematic .mkt-spine-cards {
        position: absolute; inset: 0; z-index: 3; display: block;
        width: auto; margin: 0; pointer-events: none;
      }
      .mkt-spine.is-cinematic .mkt-spine-card {
        position: absolute; top: 50%; left: clamp(1.5rem, 6vw, 6.5rem);
        width: min(33rem, 46vw);
        opacity: var(--mkt-co, 0);
        transform: translate3d(0, calc(-50% + var(--mkt-cy, 44) * 1px), 0);
        will-change: opacity, transform;
      }
      /* Part 3: "depth is emission, not stacking" — the card reads as raised
         because coloured light spills out from under it, NOT because the
         product behind it was dimmed. Dimming is what the storyboard showed
         and it is a contrast defect on a light ground. */
      .mkt-spine.is-cinematic .mkt-spine-card-glass {
        padding: clamp(1.85rem, 2.6vw, 2.5rem);
        box-shadow: 0 0 100px -22px rgb(93 71 222 / 0.5), 0 30px 70px -32px rgb(26 36 64 / 0.35);
      }
      .mkt-spine.is-cinematic .mkt-spine-rail {
        display: block; position: absolute; z-index: 4;
        right: clamp(1.5rem, 4vw, 4rem); bottom: clamp(1.75rem, 4vh, 3.25rem);
        opacity: var(--mkt-ro, 0);
        will-change: opacity;
      }
      }
      .mkt-spine-rail-list {
        display: grid; gap: 0.6rem; padding: 0.95rem 1.15rem;
        border-radius: 1.125rem; border-width: 1px; border-style: solid;
        background: rgb(255 255 255 / 0.94); backdrop-filter: blur(8px);
        box-shadow: 0 2px 6px rgb(76 125 240 / 0.06), 0 18px 44px rgb(76 125 240 / 0.16);
      }
      /* Hand-graded, because the rail is \`aria-hidden\` and axe's contrast pass
         does not reach it: #4c5a78 (gray-600) on white is 6.91 and #2f52b3
         (teal-700) is 7.05 — BRAND.md Part 7. The pill's own ground is white at
         0.94, not the product under it, so those are the pairs that render. */
      .mkt-spine-rail-item { display: flex; align-items: center; justify-content: space-between; gap: 1.75rem; color: #4c5a78; }
      /* THE DOT IS THE RAIL'S SECOND CHANNEL, and the channel is SIZE, not hue.
         Vesper's DREAMCRM-70 review graded the active row against the inactive
         ones at 1.02 — the two inks differ in hue at the same lightness, so in
         greyscale, or to most kinds of colour blindness, the rail read as four
         identical lines. The old dot could not carry it either: #c3d0e8 graded
         1.55 on the pill and was barely visible at all. So the dot takes the
         row's own ink (6.91 inactive, 7.05 active — the two pairs already
         graded above, no new colour) and the ACTIVE one is half again as big.
         Size survives greyscale, and 0.7rem still sits inside the 0.9rem line
         box, so nothing reflows when the chapter changes. */
      .mkt-spine-rail-dot { height: 0.45rem; width: 0.45rem; flex: none; border-radius: 999px; background: currentColor; }
      .mkt-spine-rail[data-active="0"] .mkt-spine-rail-item:nth-child(1),
      .mkt-spine-rail[data-active="1"] .mkt-spine-rail-item:nth-child(2),
      .mkt-spine-rail[data-active="2"] .mkt-spine-rail-item:nth-child(3),
      .mkt-spine-rail[data-active="3"] .mkt-spine-rail-item:nth-child(4) { color: #2f52b3; }
      .mkt-spine-rail[data-active="0"] .mkt-spine-rail-item:nth-child(1) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="1"] .mkt-spine-rail-item:nth-child(2) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="2"] .mkt-spine-rail-item:nth-child(3) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="3"] .mkt-spine-rail-item:nth-child(4) .mkt-spine-rail-dot { height: 0.7rem; width: 0.7rem; }`

/**
 * The mono micro-label — `BRAND.md` Part 4 calls it the signature detail.
 * Geist Mono (the `font-mono-num` token, already in the stack for dashboard
 * numerals), uppercase, wide tracking.
 *
 * 0.75rem, NOT 0.72rem. Part 4 originally said 0.72rem was "at the floor" and
 * that is arithmetic rather than taste: 0.72 × 16 = 11.52px, which is UNDER
 * the 12px floor, and `tests/a11y/legibility-floor.test.ts` skips
 * `components/marketing` (the mocks imitate a product at 7px), so nothing
 * would have failed. Corrected in the brand book in the same commit.
 */
export const MONO_LABEL =
  'font-mono-num text-[0.75rem] font-semibold uppercase tracking-[0.14em]'

/**
 * THE BLOOMS — the daylight band's signature, and its one real contrast risk.
 *
 * `BRAND.md` Part 1: "electric" now means **saturated light** rather than glow
 * against dark, and Part 1's third "not us" is *bland* — a pale wash is the
 * specific way this direction fails, and it is what the owner called "only
 * halfway" on DREAMCRM-67. So these are present rather than hinted.
 *
 * EVERY LOBE IS CENTRED OUTSIDE THE BAND, and the two strong ones are centred
 * outside the READING COLUMN as well — teal above the top-left corner, violet
 * above the right (over the product mock, which is a picture), fuchsia below
 * the bottom edge. Only their tails reach text. That is a contrast decision,
 * not a compositional one, and on this ground it runs the opposite way from
 * the night band's: a saturated bloom over white walks the GROUND down under
 * DARK ink. axe reads `background-color` and cannot see a `background-image`
 * at all, so nothing in CI will ever report it.
 *
 * The rendered run — DARKEST pixel under each run of glyphs, grain ON — is in
 * `BRAND.md` Part 7. Re-measure it when you move a lobe; do not reason about
 * it from these alpha values, because the grain and the lobes compound.
 */
const DAYLIGHT_BLOOM = {
  backgroundImage: [
    'radial-gradient(58rem 32rem at 4% -14%, rgb(76 125 240 / 0.62), transparent 70%)',
    'radial-gradient(50rem 30rem at 78% -10%, rgb(117 95 248 / 0.52), transparent 68%)',
    'radial-gradient(54rem 30rem at 22% 116%, rgb(200 0 222 / 0.34), transparent 68%)',
    'radial-gradient(44rem 28rem at 99% 70%, rgb(76 125 240 / 0.34), transparent 68%)',
  ].join(','),
} as const

/**
 * THE FILM GRAIN — `BRAND.md` Part 1, "so the light has a surface".
 *
 * An inline `feTurbulence` desaturated to monochrome, tiled at 140px. No image
 * request, no JS, and it is the thing that keeps four soft radial gradients
 * from reading as a stock SaaS wash.
 *
 * It is a CONTRAST REDUCTION like any other (Part 7, "grain counts"), so the
 * band is graded WITH it on rather than without it. Kept at 4.5% for that
 * reason, and never over a data surface — the product mock paints on top of
 * this layer, not under it.
 */
const DAY_GRAIN = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")",
  backgroundSize: '140px 140px',
  opacity: 0.045,
} as const

/**
 * THE SUBPAGE BLOOM — the same light, tuned for a band a third the height.
 *
 * `PageHero` is ~280px tall against the homepage band's ~700px, and that
 * changes the arithmetic rather than the composition: a lobe with the band's
 * alpha, squeezed into a third of the vertical run, puts its dense middle
 * where the band only ever put a tail. So the lobes here are SMALLER, WEAKER
 * and pushed further outside the reading column, and the run is measured the
 * same way the band's was (`BRAND.md` Part 7, the DREAMCRM-72 table).
 *
 * The reading column on a subpage is hard LEFT (Part 4), so the strong violet
 * lobe sits right and the fuchsia lobe sits bottom-right — the two that never
 * meet a glyph. The teal lobe is centred above the top edge, which is the one
 * whose tail reaches the eyebrow, and the eyebrow is the run with the least
 * headroom on the homepage too. Measure it when you move it.
 */
const PAGE_BLOOM = {
  backgroundImage: [
    'radial-gradient(52vw 22rem at -6% -46%, rgb(76 125 240 / 0.55), transparent 70%)',
    'radial-gradient(54vw 24rem at 94% -6%, rgb(117 95 248 / 0.62), transparent 68%)',
    'radial-gradient(46vw 18rem at 74% 126%, rgb(200 0 222 / 0.34), transparent 68%)',
  ].join(','),
} as const

/**
 * Every decorative layer of the daylight band, in paint order: the blooms,
 * then the grain over them.
 *
 * `BRAND.md` Part 3 — geometry lives in chrome zones only, never behind
 * reading text, never inside a data surface, always `aria-hidden` and
 * `pointer-events: none`.
 *
 * WHAT IS NOT HERE, on purpose. The 56px blueprint grid (`NIGHT_GRID`) is
 * gone: the owner vetoed it by name on DREAMCRM-67 — "i'm not a big fan of
 * thin black lines making up grids" — so it was deleted rather than lightened,
 * and Part 3 now says precision lives in alignment and type. The orbit rings,
 * the orb, the star field and the one-shot scan sweep went with the night
 * band. The page's one deliberate grid-break is the product mock bleeding off
 * the right edge, in `app/(marketing)/page.tsx`.
 *
 * ONE COMPONENT, TWO TUNINGS (DREAMCRM-72). `variant="page"` is the subpage
 * hero's lighter set. The alternative was a second sky component beside this
 * one, and two places that both answer "what does our light look like" is how
 * the marketing site drifts a hue at a time — the same argument `DAY_WIRE`
 * makes one export up. The grain is shared verbatim: the light has one
 * surface.
 */
export function DaylightSky({ variant = 'band' }: { variant?: 'band' | 'page' } = {}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="mkt-bloom absolute inset-0" style={variant === 'page' ? PAGE_BLOOM : DAYLIGHT_BLOOM} />
      <div className="absolute inset-0" style={DAY_GRAIN} />
    </div>
  )
}

/**
 * The daylight band's primary action.
 *
 * `BRAND.md` Part 2: the primary fill is `teal-600 → teal-700` carrying WHITE,
 * and white text starts at `teal-600` — 5.09, the shallowest legal step. Rule 3
 * in `tests/a11y/class-pairs.ts` grades every stop a white-text gradient names,
 * `hover:` included, at zero tolerance and with no exemption list, so both ends
 * here are white-text fills by construction rather than by inspection.
 *
 * This replaces `NightPrimaryCta`, whose whole reason for existing was the
 * inversion — `teal-300/400` were the brightest thing on a dark band, so the
 * LABEL had to be the dark one (`#0C1226`, 7.68). With no dark band there is
 * nothing left to invert.
 *
 * Depth is emission, not stacking (Part 3): the button glows rather than
 * casting a hard shadow, and the glow deepens on hover instead of the fill
 * darkening. Full width at 390 and auto from `sm` up — Part 10.
 */
export function HeroPrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-3 text-[0.95rem] font-semibold text-white shadow-[0_8px_26px_-8px_rgb(58_103_217/0.65)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_10px_32px_-8px_rgb(58_103_217/0.78)] sm:w-auto"
    >
      {children}
    </Link>
  )
}

/**
 * The daylight band's secondary action — a white card on the bloom, one
 * hairline, no fill colour. It reads as a raised surface rather than an
 * outline, which is what keeps it legible sitting on a saturated ground: an
 * outline button lets the bloom through and the bloom is the thing walking the
 * ground down.
 */
export function HeroGhostCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-6 py-3 text-[0.95rem] font-semibold text-gray-950 shadow-[0_2px_10px_-4px_rgb(26_36_64/0.18)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_rgb(26_36_64/0.24)] sm:w-auto"
      style={{ borderColor: DAY_WIRE }}
    >
      {children}
    </Link>
  )
}

/**
 * THE DETACHED PIECES — `BRAND.md` Part 3's grid-break, the half of it that is
 * not the bleed.
 *
 * The product mock crosses the container's right edge, and these two lift OUT
 * of it and float in front: one trend tile and the reply that a confirmation
 * text just got back. The owner approved this exact composition in round B of
 * DREAMCRM-67 ("yeah i think we're there"), and it is what stops product-only
 * imagery (Part 11) reading as a screenshot gallery.
 *
 * THEY ARE PIECES OF THE MOCK AND THEIR CONTENT SAYS SO. `DashboardMock` above
 * carries "Unconfirmed · 3 · Liam · 9:30 tomorrow" and "New patients MTD · 12 ·
 * +3 vs last month"; these are those two rows, pulled forward. That is not
 * decoration for its own sake, and it is also the honest answer to Part 5's
 * "every number is real or visibly an example" — a number inside a product mock
 * is part of the mock, and inventing a bigger one here would have made it a
 * claim in our own voice.
 *
 * EACH ONE MARKS ITSELF `aria-hidden` ON ITS OUTERMOST ELEMENT, and that is
 * load-bearing rather than tidy. `DECORATIVE_MOCKS` in `e2e/axe.ts` is
 * `.mkt-float > [aria-hidden="true"]` — the drift wrapper AND the attribute,
 * both halves — and `marketing: home` holds a ceiling of ZERO on the back of
 * it. Render one of these anywhere but as a DIRECT child of `.mkt-float` /
 * `.mkt-float-slow` and the exclusion goes dead (`deadExclusions` fails the
 * stop by name).
 *
 * Their ink clears AA anyway, which is the belt to that brace: gray-950 on
 * white inside the tile, and white on a `teal-600 → violet-700` fill in the
 * bubble — both stops legal white-text fills, so rule 3 grades this gradient
 * and passes it rather than being dodged by a raw hex.
 */
export function HeroStatTile({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div
      className={`w-[12.5rem] rounded-xl border bg-white px-3.5 py-2.5 text-left ${MOCK_FRAME_SHADOW}`}
      style={{ borderColor: DAY_WIRE }}
      aria-hidden="true"
    >
      <p className="font-mono-num text-[0.62rem] font-bold uppercase tracking-[0.12em] text-gray-600">
        {label}
      </p>
      <p className="font-mono-num text-[1.5rem] font-extrabold leading-tight tracking-tight text-gray-950">
        {value}
      </p>
      <p className="text-[0.7rem] font-semibold text-emerald-700">{sub}</p>
    </div>
  )
}

/** The live reply — a patient answering the confirmation the mock just sent. */
export function HeroReplyBubble() {
  return (
    <div
      className="w-[16rem] rounded-2xl bg-gradient-to-r from-teal-600 to-violet-700 px-4 py-3 text-left text-white shadow-[0_10px_34px_-10px_rgb(93_71_222/0.7)]"
      aria-hidden="true"
    >
      <p className="flex items-center gap-2 font-mono-num text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/85">
        {/* The band's one pulsing thing (BRAND.md Part 6, ~1.8s). What breathes
            is a second, larger dot behind the solid one, so the label's layout
            never moves. */}
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="mkt-live absolute inset-0 rounded-full bg-white" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        Liam Brooks · 4:12 PM
      </p>
      <p className="mt-1.5 text-[0.9rem] font-semibold leading-snug">
        &ldquo;Yes please &mdash; 9:30 tomorrow works.&rdquo;
      </p>
    </div>
  )
}

/**
 * Scrolling strip of everything included — pauses on hover.
 *
 * THE DAYLIGHT TICKER, and it closes the fold (`BRAND.md` Part 8, move 1).
 * The hero and the ticker under it are one surface, so this carries the band's
 * ground and its hairline — which since DREAMCRM-69 means `surface-1`
 * (#F8FAFF) rather than `gray-950`, and `DAY_WIRE` rather than `NIGHT_WIRE`.
 *
 * `gray-600` (#4C5A78), not `gray-400`. The night band could spend gray-400 on
 * a label because it measured 6.71 against `gray-950`; on `surface-1` the same
 * token is **1.72** — a token that inverts from legal to unreadable when the
 * ground flips, which is the whole reason `BRAND.md` Part 7 exists. gray-600
 * is 6.61 here. These are real labels a visitor reads, not part of a picture,
 * so nothing about the mock exclusions applies to them.
 *
 * It still pauses on hover and it still freezes under `prefers-reduced-motion`
 * (Part 6: never animate the ticker's contents on hover — it pauses).
 */
export function MarqueeStrip() {
  const items = [
    'Practice website', 'Edit-in-place studio', 'Online booking', 'Patient portal',
    'Unified messages', 'Digital intake', 'Reviews', 'Google reviews', 'Recall campaigns',
    'Practice analytics', 'Shop & memberships', 'Careers + ATS', 'Open Dental sync',
    'Google Business', 'Social posting', 'SEO dashboard', 'Blog with AI drafts',
    'Family access', 'Online payments',
  ]
  const row = (key: string, hidden: boolean) => (
    <div key={key} className="flex items-center" aria-hidden={hidden || undefined}>
      {items.map((label) => (
        <span key={`${key}-${label}`} className={`flex items-center whitespace-nowrap px-5 text-gray-600 ${MONO_LABEL}`}>
          <span className="mr-5 h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  )
  return (
    <div
      className="mkt-marquee overflow-hidden border-y bg-[#F8FAFF] py-3.5"
      style={{ borderColor: DAY_WIRE }}
      aria-label="Everything included"
    >
      <div className="mkt-marquee-track">
        {row('a', false)}
        {row('b', true)}
      </div>
    </div>
  )
}

/* ── Footer ─────────────────────────────────────────────────────────── */

/**
 * THE ONE DARK SURFACE LEFT, AND IT STAYS DARK (`BRAND.md` Part 2).
 *
 * Daylight Dream turned the whole page light and this did not move: the site
 * has always closed on `bg-gray-950`, and Part 7 is explicit that its
 * hand-graded discipline "does NOT retire" here. So move 4 re-skinned the
 * header and `PageHero` around it and changed nothing about this surface's
 * GROUND or its INKS — `gray-300` headings at 11.33, `gray-400` links and body
 * at 6.71, white wordmark at 17.62, all re-derived from `app/css/style.css` by
 * `tests/a11y/token-contrast.test.ts` on every run, together with the
 * `gray-500` NEGATIVE pin (3.32) that this footer actually shipped live at for
 * months.
 *
 * WHY THERE IS NO BLOOM DOWN HERE, since the rest of the move added light
 * everywhere. A bloom over `gray-950` walks the ground UP, and every ink on
 * this surface is PALER than the ground — so lifting the ground closes the
 * gap on all three pairs at once, and it does it as a `background-image`,
 * which is the one thing no gate in this repo can see (Part 7). The Part 7
 * table would still read green while the footer got quietly less legible.
 * A flat ground is what makes that table a guarantee rather than an estimate.
 *
 * WHAT DID CHANGE, and both are inkless by construction:
 *
 *  1. The signature gradient arrives as the footer's top EDGE — a 3px rule,
 *     `aria-hidden`, carrying no text. It is the page's light ending rather
 *     than a grey slab starting, which is the whole reason the dark band is
 *     allowed to feel deliberate instead of left over.
 *
 *     It uses the LUMINOUS steps (`teal-400` / `violet-500` / `fuchsia-500`)
 *     rather than the signature's ink steps, and that is legal for exactly one
 *     reason: Part 2's "white text starts at `teal-600`" governs FILLS THAT
 *     CARRY WHITE, and rule 3 in `tests/a11y/class-pairs.ts` grades a gradient
 *     only where a `text-white` rides it. Nothing rides this. On a dark ground
 *     the ink steps read as mud; the luminous ones read as light. Put a label
 *     on this bar and it becomes a rule-3 violation the same afternoon.
 *
 *  2. Column headings take `MONO_LABEL` (Part 4's signature micro-label),
 *     same `gray-300`, same 0.75rem. A type change, not a colour change.
 */
export function MarketingFooter() {
  // The Compare column derives from the comparisons config so a new vendor
  // page can never be missing from the footer (the hand-written list already
  // drifted once).
  const columns = FOOTER_COLUMNS.map((col) =>
    col.title === 'Compare'
      ? {
          title: 'Compare',
          links: [
            { label: 'All comparisons', href: '/compare' },
            ...COMPARISONS.map((c) => ({ label: `DreamCRM vs ${c.name}`, href: `/compare/${c.slug}` })),
          ],
        }
      : col,
  )
  return (
    <footer className="bg-gray-950 text-gray-400">
      {/* The page's light, ending. See the component header for why these are
          the luminous steps and why nothing may ever be written on this bar. */}
      <div
        className="h-[3px] w-full bg-gradient-to-r from-teal-400 via-violet-500 to-fuchsia-500"
        aria-hidden="true"
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          {/* Footer sits on gray-950 in both themes — force the wordmark to white ink. */}
          <DreamCreateLogo size={28} wordmarkClassName="text-white [--brand-ink:#fff]" />
          <p className="mt-3 max-w-[16rem] text-[0.82rem] leading-relaxed">
            {MARKETING.tagline}. Website, booking, portal, comms, reviews, and shop — wrapped around
            the PMS you already run.
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            {/* gray-300, not gray-500. This footer is a DARK band inside a
                light-mode page, so no `.dark` scope applies and the light
                value of gray-500 was rendering straight onto gray-950 at
                3.43:1 — and it was quieter than the gray-400 links beneath
                it, i.e. a column heading receding behind its own list. The
                runtime accessibility checks reported this on every marketing
                stop; it is the pair that looked like a dark-mode token bug
                and was not one. */}
            <p className={`text-gray-300 ${MONO_LABEL}`}>{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-[0.85rem] hover:text-white">
                      {l.label} ↗
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[0.85rem] hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[0.78rem] sm:px-6">
          <span>
            © {new Date().getFullYear()} {MARKETING.companyName}. All rights reserved.
          </span>
          <span>Built for dental practices. Your PMS stays yours.</span>
        </div>
        {/* CC BY 4.0 attribution for the animated emoji set — a LICENCE TERM,
            not a nicety, and the reason it sits on every marketing page rather
            than on one credits page. Underlined so it does not depend on colour
            alone; gray-400 on gray-950 is 6.71:1. `public/emoji/LICENSE.md`
            has the provenance, and a test fails if this line disappears.

            0.75rem, NOT 0.72rem. It shipped at 0.72 — 11.52px, under the 12px
            floor `BRAND.md` Part 4 sets for this site — and nothing could have
            caught it: `tests/a11y/legibility-floor.test.ts` skips
            `components/marketing` entirely, because the product mocks in this
            file imitate a real screen at 7px. Corrected on DREAMCRM-72, which
            is also where that blanket skip stopped covering the shared chrome:
            `tests/marketing/chrome-legibility.test.ts` now holds the header,
            the footer and `PageHero` to the floor while leaving the mocks
            alone. Exactly the arithmetic slip Part 4 already records against
            the mono label, found the same way — by multiplying it out. */}
        <div className="mx-auto max-w-6xl px-4 pb-5 text-[0.75rem] sm:px-6">
          <span>
            Animated emoji from{' '}
            <a
              href="https://googlefonts.github.io/noto-emoji-animation/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              Noto Animated Emoji
            </a>{' '}
            by Google, licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              CC BY 4.0
            </a>
            .
          </span>
        </div>
      </div>
    </footer>
  )
}

/* ── Scaffolds ──────────────────────────────────────────────────────── */

/**
 * The site-wide eyebrow. `BRAND.md` Part 4 names eyebrows as one of the runs
 * that carry the MONO micro-label — the signature detail — so this now spells
 * the recipe as `MONO_LABEL` rather than a second, sans copy of its
 * measurements. Same 0.75rem, same `teal-700` (7.05 on white), one home.
 *
 * Changed on DREAMCRM-72 rather than per page, which is the point of move 4:
 * `why` and `product` render this directly, mid-page, and inherit the language
 * without either file being opened.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={`mb-3 text-teal-700 ${MONO_LABEL}`}>{children}</p>
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight text-gray-950 sm:text-[2.1rem]">
        {children}
      </h2>
      {sub && <p className="mt-3 text-[0.98rem] leading-relaxed text-gray-600">{sub}</p>}
    </div>
  )
}

/**
 * THE SECTION OPENER — `SectionTitle`'s hard-left sibling, and the shape every
 * move-6 page body opens its sections with: the mono eyebrow, a hard-left
 * heading, an optional lede held to the reading measure. It is the homepage's
 * "Honest by default" composition rather than a new one (`BRAND.md` Part 4 —
 * a centred subpage section under a hard-left hero is the drift move 6 exists
 * to close).
 *
 * IT ARRIVED HERE ON MOVE 6 PAGE 2 RATHER THAN PAGE 1, deliberately, and the
 * move is worth explaining because page 1 wrote the opposite down. Pricing
 * declared this function locally and said so in a comment: shared chrome
 * re-skins eight pages at once, and a move that owns ONE page has no business
 * doing that. That was right while one page wanted the shape. The second page
 * to want it is the moment the argument flips — two private copies of a
 * heading recipe is how "which size is a section heading" drifts across a site
 * whose Part 1 word for itself is *precise*, and the pages that have not been
 * converted yet do not render this at all, so promoting it re-skins nothing
 * that is not already in the language. `SectionTitle` stays exactly where it
 * is, still centred, still used by the pages move 6 has not reached.
 */
export function SectionOpener({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede?: React.ReactNode
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-[1.7rem] font-bold leading-tight tracking-[-0.02em] text-gray-950 sm:text-[2.1rem]">
        {title}
      </h2>
      {lede && <p className="mt-3 text-[0.98rem] leading-relaxed text-gray-600">{lede}</p>}
    </div>
  )
}

/**
 * THE FAQ DISCLOSURE — the rotating `+` tile, promoted on move 6 page 6.
 *
 * IT ARRIVED HERE THE WAY `SectionOpener` DID, by the same rule and one page
 * later than that rule strictly allows. Page 1 wrote the recipe inline on
 * `/pricing`; page 2 copied it verbatim onto `/compare/[vendor]` with a
 * comment saying "the pricing page's affordance, not a second recipe" — which
 * is the right instinct written down in the one place that cannot enforce it.
 * Page 6 wants it on `/partner-program` and `/blog/[slug]`, so the count was
 * about to be four private copies of a 12px tile, a 200ms turn and a
 * `DAY_WIRE` card. Two copies is a coincidence; four is a dialect.
 *
 * Promoting it re-skins nothing that is not already in the language: the only
 * two existing call sites render this exact markup today, which is what makes
 * this safe to do in a page's own PR rather than a chrome move.
 *
 * WHY `<details>` AND NOT A CONTROLLED PANEL. It is server-rendered, it works
 * with JavaScript off, the browser owns the expanded/collapsed announcement,
 * and search engines read the answer whether or not anybody opened it — which
 * matters on the three pages that also emit `FAQPage` structured data. The
 * tile is `aria-hidden`: `<summary>` already announces its own state, and a
 * `+` read aloud is noise.
 *
 * The turn is 200ms ease-out with NO spring overshoot — Part 6's interaction
 * band. Overshoot is the dashboard's register and reads as bounce here.
 */
export function FaqList({
  items,
  className = '',
}: {
  items: ReadonlyArray<{ q: string; a: React.ReactNode }>
  className?: string
}) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {items.map((f) => (
        <details
          key={f.q}
          className="group rounded-[14px] border bg-white px-5 py-4 transition-shadow duration-150 ease-out open:shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
          style={{ borderColor: DAY_WIRE }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold text-gray-950 [&::-webkit-details-marker]:hidden">
            {f.q}
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
  )
}

/**
 * THE SHARED SUBPAGE HERO — `BRAND.md` Part 8 move 4 (DREAMCRM-72).
 *
 * Eight pages open with this component, so it is the single largest lever on
 * whether the site reads as Daylight Dream: pricing, compare, product, why,
 * resources, docs, blog and changelog all inherit whatever it says. Move 6
 * then tunes each page's BODY, rather than re-skinning eight heroes by hand
 * and ending up with eight dialects of the same idea.
 *
 * THE DOT GRID IS DELETED, NOT LIGHTENED — and it is the owner's first veto
 * from DREAMCRM-67 arriving somewhere nobody had looked. `HERO_DOT_GRID` was
 * a `radial-gradient` dot tiled every 22px: a lattice drawn on the page, which
 * is precisely *"i'm not a big fan of thin black lines making up grids"*. Move
 * 1 deleted `NIGHT_GRID` and closed the veto on the homepage; this one was a
 * second drawn grid on the other eight pages, and it survived four months and
 * three moves because it lived under a different name in a different
 * component. That is the tone-tile census lesson in a new costume — **a veto
 * closed at one call site is not a veto closed** — so it leaves behind
 * `tests/marketing/no-drawn-grid.test.ts`, which asks the tree instead of
 * trusting this paragraph, and knows the difference between a lattice and the
 * film grain.
 *
 * WHAT REPLACES IT: the same daylight the homepage band is made of, at
 * subpage weight (`DaylightSky variant="page"`), plus Part 4's alignment.
 *
 *  - **Hard left, not centred.** The homepage headline is hard left and round
 *    B's *"only halfway"* was as much about alignment as about colour. A
 *    centred subpage hero under a hard-left home page is exactly the drift
 *    this move exists to stop.
 *  - **Display type, stepped down** (Part 10): 3.6rem at 1440 against the
 *    homepage's 5.375rem, through 3rem at 834 to 2.35rem at 390. Subordinate
 *    to the home hero, still unmistakably display, and it steps rather than
 *    reflowing into a different design.
 *  - **The signature gradient arrives as a MARK, not as type.** A 36px rule in
 *    `teal-600 → violet-700 → fuchsia-700` leads the eyebrow, so every subpage
 *    opens with the brand's three hues. It is deliberately not the HEADLINE
 *    treatment: Part 2 gives fuchsia exactly two homes and one of them is *the*
 *    signature headline gradient, singular. Eight subpage titles wearing it
 *    would dilute the one place it means something.
 *  - **No bottom border.** The old `border-b border-gray-100` drew the seam;
 *    the light fades into the page instead. Part 0 decision 5, superseded —
 *    there is no seam left to explain.
 *
 * The fade sits between the sky and the content on purpose: it has to paint
 * over the bloom and under the words, and DOM order is what does that. Keep
 * the content wrapper `relative` or the fade washes the buttons.
 */
export function PageHero({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden bg-white">
      <DaylightSky variant="page" />
      {/* THE LIGHT RISES OUT OF THE PAGE AND SETTLES BACK INTO IT. The blooms
          are clipped by the section box, so without these two the hero would
          announce its own top and bottom edges as ruled lines — the seam this
          move exists to remove, redrawn in colour instead of in grey. The top
          fade matters more than it looks: the header sits directly above in
          normal flow, so that edge is the one a reader sees first. */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 text-left sm:px-6 lg:pb-16 lg:pt-16">
        <div className={`mkt-enter mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
          <span
            className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
            aria-hidden="true"
          />
          {eyebrow}
        </div>
        <h1 className="mkt-enter mkt-d1 max-w-4xl text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-gray-950 sm:text-[3rem] lg:text-[3.6rem]">
          {title}
        </h1>
        {sub && (
          <p className="mkt-enter mkt-d2 mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-gray-600">
            {sub}
          </p>
        )}
        {children && <div className="mkt-enter mkt-d3 mt-8">{children}</div>}
      </div>
    </section>
  )
}

/**
 * THE SUBPAGE ACTIONS — the hero CTAs' vocabulary, one size down.
 *
 * `HeroPrimaryCta` / `HeroGhostCta` are the homepage band's pair; these are
 * the same two recipes at subpage scale, and they are re-skinned here on
 * DREAMCRM-72 for the same reason `PageHero` is: they are what `PageHero`
 * renders as children, and a Daylight hero with a flat `bg-teal-700`
 * square-shouldered button inside it is drift visible in one screenshot.
 * Fifteen call sites across eight pages inherit this without being opened.
 *
 *  - `teal-600 → teal-700` carrying white (Part 2's primary action). Rule 3 in
 *    `tests/a11y/class-pairs.ts` grades every stop a white-text gradient names
 *    — 5.09 and 7.05 — so both ends are legal by construction.
 *  - 10px radius: Part 3's controls-and-buttons step. `rounded-lg` is 8px and
 *    belongs to the dashboard.
 *  - Depth is emission, not stacking (Part 3). The glow deepens on hover
 *    instead of the fill darkening, which is also what keeps the label's
 *    contrast fixed across the interaction rather than drifting with it.
 *  - Full width at 390, auto from `sm` up — Part 10, in the component rather
 *    than at fifteen call sites.
 */
export function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-2.5 text-[0.92rem] font-semibold text-white shadow-[0_6px_20px_-8px_rgb(58_103_217/0.6)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_9px_26px_-8px_rgb(58_103_217/0.78)] sm:w-auto"
    >
      {children}
    </Link>
  )
}

/**
 * The secondary action — a white CARD on the light, one `DAY_WIRE` hairline,
 * no fill colour. An outline button lets a bloom through and the bloom is the
 * thing walking the ground down (Part 7), so this reads as a raised surface
 * instead: `gray-950` on white, 17.62, whatever the light behind it is doing.
 */
export function GhostCta({
  href,
  children,
  external = false,
}: {
  href: string
  children: React.ReactNode
  external?: boolean
}) {
  const cls =
    'inline-flex w-full items-center justify-center rounded-[10px] border bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-950 shadow-[0_2px_10px_-4px_rgb(26_36_64/0.18)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_rgb(26_36_64/0.24)] sm:w-auto'
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cls}
        style={{ borderColor: DAY_WIRE }}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} style={{ borderColor: DAY_WIRE }}>
      {children}
    </Link>
  )
}

/* ── The tone tiles — BRAND.md Part 3, the owner's second veto ───────── */

/**
 * WHAT REPLACED `CheckIcon`, AND WHY IT IS A VOCABULARY RATHER THAN AN ICON.
 *
 * The owner's words on DREAMCRM-67 were *"bland check marks as icons"*, and
 * the blandness was never the tick's draughtsmanship — it was that nine
 * identical ticks down a feature list say the same nothing nine times. The
 * replacement therefore cannot be a nicer tick. It is a filled squircle
 * carrying a glyph that says what the line is ABOUT: a calendar for the
 * schedule, a speech bubble for messaging, a banknote for payments. Every
 * tick becomes a statement (`BRAND.md` Part 3, Part 8 move 3).
 *
 * THE SUBJECT LIST, THE TONE FAMILIES AND THE GRADED TINT/INK RECIPES LIVE IN
 * `lib/marketing/tone-tiles.ts` — read that file for the reasoning, including
 * the measured ratios and why `rose`, `amber` and `fuchsia` are deliberately
 * not available here. What lives on THIS side is only the drawings, because
 * marketing content files name a subject on the line it belongs to
 * (`lib/marketing/comparisons.ts` does) and must not have to import the
 * component that renders it.
 *
 * NOTHING CAN DRIFT ACROSS THAT SPLIT: both halves are keyed
 * `Record<ToneTileGlyph, …>`, so a subject with no drawing — or a drawing for
 * a subject with no tone — does not compile.
 *
 * THE TILES ARE DECORATIVE AND `aria-hidden`, deliberately. The line of text
 * beside every one of them already says what it is about; a tile that
 * announced itself would read the subject twice to a screen reader and add
 * nothing. The glyph is a second channel for the EYE, not a second channel for
 * the meaning — which is also why no page on this site depends on one.
 */
export type { ToneTileGlyph }

/**
 * THE DRAWINGS. Every `d` sits on a 16×16 grid and is stroked in
 * `currentColor`, so one definition renders at all three tile sizes without a
 * second copy at a second weight — and so `ReviewsMock` can borrow `star` at
 * product-mock scale instead of keeping its own.
 */
export const TONE_TILE_PATH: Record<ToneTileGlyph, React.ReactNode> = {
  /* ── brand: what the product is ── */
  calendar: (<><rect x="2.2" y="3.4" width="11.6" height="10.4" rx="1.6" /><path d="M2.2 6.6h11.6M5.4 2.2v2.6M10.6 2.2v2.6" /></>),
  chat: <path d="M2 4.6A2.2 2.2 0 0 1 4.2 2.4h7.6A2.2 2.2 0 0 1 14 4.6v4.6a2.2 2.2 0 0 1-2.2 2.2H6.8L3.4 14v-2.6h-.2" />,
  globe: (<><circle cx="8" cy="8" r="5.9" /><path d="M2.1 8h11.8M8 2.1c2.2 1.9 2.2 10 0 11.8M8 2.1C5.8 4 5.8 12 8 13.9" /></>),
  people: (<><circle cx="6.1" cy="5.3" r="2.3" /><path d="M1.9 13.6c0-2.4 1.9-3.8 4.2-3.8s4.2 1.4 4.2 3.8M10.8 3.3a2.3 2.3 0 0 1 0 4M11.5 10.2c1.7.4 2.7 1.6 2.7 3.4" /></>),
  form: (<><path d="M4 1.9h5.1l3.4 3.4v8.9a.9.9 0 0 1-.9.9H4a.9.9 0 0 1-.9-.9V2.8a.9.9 0 0 1 .9-.9Z" /><path d="M9.1 1.9v3.4h3.4M5.7 8.6h4.6M5.7 11.1h3.2" /></>),
  layers: (<><path d="M8 1.8 14.2 5 8 8.2 1.8 5Z" /><path d="M2.4 7.9 8 10.7l5.6-2.8M2.4 10.9 8 13.7l5.6-2.8" /></>),
  clock: (<><circle cx="8" cy="8" r="5.9" /><path d="M8 4.6v3.7l2.4 1.5" /></>),
  key: (<><circle cx="10.4" cy="5.6" r="2.8" /><path d="M8.4 7.6 2.2 13.8M4.3 11.7l1.5 1.5M6 10l1.5 1.5" /></>),
  shield: (<><path d="M8 1.8 13.3 3.7v4c0 3.3-2.2 5.5-5.3 6.5-3.1-1-5.3-3.2-5.3-6.5v-4Z" /><path d="M8 6.2v3.2" /></>),
  door: (<><path d="M8.8 2.2H3.9a.9.9 0 0 0-.9.9v9.8a.9.9 0 0 0 .9.9h4.9" /><path d="M9.4 8h4.6M11.9 5.8 14.1 8l-2.2 2.2" /></>),
  flag: <path d="M3.7 14.1V2.3m0 .9h8.4l-1.7 2.7 1.7 2.7H3.7" />,
  tag: (<><path d="M2.6 7.7V3.5a.9.9 0 0 1 .9-.9h4.2l5.8 5.8a.9.9 0 0 1 0 1.3l-3.9 3.9a.9.9 0 0 1-1.3 0L2.6 7.7Z" /><circle cx="5.6" cy="5.6" r="1" /></>),
  sliders: (<><path d="M2.4 4.2h11.2M2.4 8h11.2M2.4 11.8h11.2" /><circle cx="5.4" cy="4.2" r="1.5" /><circle cx="10.2" cy="8" r="1.5" /><circle cx="6.6" cy="11.8" r="1.5" /></>),
  eye: (<><path d="M1.5 8S4.2 3.5 8 3.5 14.5 8 14.5 8 11.8 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2.1" /></>),
  pencil: (<><path d="M11.1 2.3 13.7 4.9 5.6 13H3v-2.6Z" /><path d="M9.6 3.8l2.6 2.6" /></>),
  /* The one glyph on this site that could only belong to this product, and the
     tile that earns the set its keep: a practice reading "dentistry-native,
     not generic" beside a literal tooth is the difference between a claim and
     a demonstration. */
  tooth: <path d="M4.6 2.2c1 0 1.6.6 3.4.6s2.4-.6 3.4-.6c1.5 0 2 1.3 2 3.2 0 2-.8 3.1-1.2 5-.3 1.5-.4 3.6-1.5 3.6s-1.1-2-1.5-3.4c-.2-.8-.5-1.2-1.2-1.2s-1 .4-1.2 1.2c-.4 1.4-.4 3.4-1.5 3.4s-1.2-2.1-1.5-3.6c-.4-1.9-1.2-3-1.2-5 0-1.9.5-3.2 2-3.2Z" />,

  /* ── auto: what it does without you ── */
  sync: (<><path d="M2.9 7.3a5.2 5.2 0 0 1 8.8-3.2l1.6 1.5" /><path d="M13.3 2.3v3.4H9.9" /><path d="M13.1 8.7a5.2 5.2 0 0 1-8.8 3.2l-1.6-1.5" /><path d="M2.7 13.7v-3.4h3.4" /></>),
  bolt: <path d="M8.9 1.7 3.5 9.1h3.7l-.7 5.2 5.6-7.6H8.2Z" />,
  megaphone: (<><path d="M3.3 6.2h2.4l5.6-3.1v9.8L5.7 9.8H3.3a1.3 1.3 0 0 1-1.3-1.3V7.5a1.3 1.3 0 0 1 1.3-1.3Z" /><path d="M5.7 9.9v2.8a1.1 1.1 0 0 0 1.1 1.1h.6a1.1 1.1 0 0 0 1.1-1.1v-1.9M13.2 6.4a2.5 2.5 0 0 1 0 3.2" /></>),

  /* ── growth: what it earns you ── */
  money: (<><rect x="1.4" y="4" width="13.2" height="8" rx="1.4" /><circle cx="8" cy="8" r="1.9" /><path d="M3.9 6.3v3.4M12.1 6.3v3.4" /></>),
  chart: <path d="M2.4 13.6h11.2M4.8 13.6V8.9M8 13.6V4.8M11.2 13.6V7.1" />,
  cart: (<><path d="M1.7 2.5h1.9l1.9 7.6h6.5l1.6-5.3H4.4" /><circle cx="6.2" cy="13" r="1.1" /><circle cx="11.5" cy="13" r="1.1" /></>),
  gift: (<><path d="M2.5 7.6h11v5.5a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9Z" /><rect x="1.7" y="5" width="12.6" height="2.6" rx=".8" /><path d="M8 5v9" /><path d="M8 5C8 3.3 7.1 2.1 5.9 2.1a1.5 1.5 0 0 0 0 2.9M8 5c0-1.7.9-2.9 2.1-2.9a1.5 1.5 0 0 1 0 2.9" /></>),
  star: <path d="m8 1.9 1.95 4.05L14.4 6.6l-3.2 3.15.75 4.45L8 12.1l-3.95 2.1.75-4.45L1.6 6.6l4.45-.65Z" />,
}

const TILE_SIZE = {
  sm: { box: 'h-5 w-5 rounded-lg', glyph: 'h-3 w-3', stroke: 1.7 },
  md: { box: 'h-7 w-7 rounded-[10px]', glyph: 'h-4 w-4', stroke: 1.55 },
  lg: { box: 'h-9 w-9 rounded-xl', glyph: 'h-[1.1rem] w-[1.1rem]', stroke: 1.5 },
} as const

/**
 * A tone tile. Decorative — the text beside it carries the meaning.
 *
 * The radii track `BRAND.md` Part 3's existing ladder (10px controls · 12px
 * small tiles) as the tile grows — 8 / 10 / 12px — rather than inventing a
 * fourth. Holding that ratio is what keeps a 20px tile reading as the same
 * SHAPE as a 36px one instead of collapsing into a circle. Nothing here is a
 * pill: Part 3 reserves `999px` for eyebrow badges and status chips, and a
 * tone tile is neither.
 *
 * `mkt-tile` is the hover lift, and it lives in `MarketingMotionStyles` rather
 * than in a `hover:` utility for one reason — Part 6 makes hover motion
 * pointer-fine only, and a Tailwind `hover:` also fires on a touch-and-hold.
 * The media gate is the only way to owe that rather than claim it.
 *
 * THE LIFT IS OPT-IN, AND THE TILES THAT DECLINE IT DO SO ON PURPOSE. It fires
 * only under a `group` ancestor, so a tile inside a CARD rises with its card
 * and a tile sitting in a dense list row stays put — the homepage pricing
 * teaser, the partner terms and the compare "Choose DreamCRM if" list are all
 * the second kind. That is a taste rule, not an oversight: those rows are not
 * interactive, and Part 6's motion is meant to answer a gesture rather than
 * twitch under the cursor. Raised in Sentinel's review of #617; recorded here
 * so the next reader does not have to guess which it was.
 */
export function ToneTile({
  glyph,
  size = 'sm',
  className = '',
}: {
  glyph: ToneTileGlyph
  size?: keyof typeof TILE_SIZE
  className?: string
}) {
  const s = TILE_SIZE[size]
  return (
    <span
      className={`mkt-tile inline-flex shrink-0 items-center justify-center ${s.box} ${TILE_TONE_CLASSES[TONE_TILE_TONE[glyph]].tile} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        className={s.glyph}
        fill="none"
        stroke="currentColor"
        strokeWidth={s.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TONE_TILE_PATH[glyph]}
      </svg>
    </span>
  )
}

/**
 * THE TIER-B ROW MARKER, and the rule that decides which tier a list is.
 *
 * A tile is a statement, and a statement repeated down twenty-six rows is
 * wallpaper — which is precisely how the tick became bland in the first place.
 * Replacing one uniform mark with a second uniform mark would satisfy the
 * letter of the veto and miss all of it. So the tiles come in two tiers, and
 * `BRAND.md` Part 3 carries the rule:
 *
 *   - **Tier A — a tile per LINE**, where every line is a different KIND of
 *     thing: the honesty tenets, the partner terms, a vendor's strengths.
 *   - **Tier B — a tile on the GROUP, a dash on each row**, where the rows are
 *     one kind of thing under a heading that already names the subject. The
 *     pricing module inventory and the product tour's bullets are that shape:
 *     eight ways of saying "website" do not need eight globes, they need one
 *     globe and eight legible lines.
 *
 * The dash takes the group's tone at `-500`, so the colour still says which
 * domain the reader is in while the glyph is stated once, where it means
 * something. It carries no `text-*` of its own, which is also what keeps it
 * clear of rule 5's (ink, surface) pairing.
 */
export function ToneDash({ glyph, className = '' }: { glyph: ToneTileGlyph; className?: string }) {
  return (
    <span
      className={`h-[3px] w-2.5 shrink-0 rounded-full ${TILE_TONE_CLASSES[TONE_TILE_TONE[glyph]].dash} ${className}`}
      aria-hidden="true"
    />
  )
}

export function MatrixMark({ value }: { value: 'yes' | 'no' | 'partial' }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6.5 4.5 9 10 3" />
        </svg>
        <span className="sr-only">Yes</span>
      </span>
    )
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
          <rect x="2" y="5" width="8" height="2" rx="1" />
        </svg>
        <span className="sr-only">Partial</span>
      </span>
    )
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
      <span className="sr-only">No</span>
    </span>
  )
}

/* ── Product mocks (real content, not wireframes) ───────────────────── */

/* v3 "Cute Dream" chrome recipes (DESIGN-SYSTEM.md 2.1/2.3/2.4 + Part 4):
   sky canvas #F3F7FE, borderless white cards floating on a soft dream-blue
   shadow, and blue gradient pills for primary actions + the active nav item.
   The BookingMock (public-site booking) keeps the fictional clinic's
   sage/cream palette; the PortalMock wears DreamCRM blue on the warm cream
   canvas (owner call 2026-07-19). */
const MOCK_FRAME_SHADOW =
  'shadow-[0_4px_10px_rgba(76,125,240,.10),0_18px_44px_rgba(76,125,240,.16)]'
const MOCK_CARD_SHADOW =
  'shadow-[0_2px_6px_rgba(76,125,240,.06),0_10px_28px_rgba(76,125,240,.11)]'
const MOCK_TILE_SHADOW = 'shadow-[0_1px_3px_rgba(76,125,240,.07)]'
const MOCK_PILL = 'bg-gradient-to-r from-[#7CA5FF] to-[#3A67D9] text-white'

function StatusPill({ tone, children }: { tone: 'amber' | 'emerald' | 'rose' | 'teal'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    teal: 'bg-teal-50 text-teal-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${tones[tone]}`}>{children}</span>
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.58rem] font-bold text-white ${color}`}>
      {initials}
    </span>
  )
}

/** Browser-framed morning-huddle dashboard — a faithful miniature of the
 *  real v3 Overview (attention CARDS with action links, chair card with the
 *  confirmed ring, trend tiles with the booking pulse), populated like a
 *  healthy Tuesday. Sidebar mirrors the real IA: pinned cockpit + Daily +
 *  workspace entries. */
export function DashboardMock() {
  const daily = ['My Day', 'Patients', 'Follow-ups', 'Leads', 'Intake Forms']
  const chair: Array<{ t: string; n: string; v: string; s: 'Confirmed' | 'Unconfirmed'; i: string; c: string; g?: string }> = [
    { t: '8:00', n: 'Mia Hayes', v: 'Cleaning · 60 min', s: 'Confirmed', i: 'MH', c: 'bg-[#7CA5FF]', g: '🎂' },
    { t: '9:30', n: 'Liam Brooks', v: 'Checkup · 30 min', s: 'Unconfirmed', i: 'LB', c: 'bg-[#4C7DF0]', g: '$' },
    { t: '10:00', n: 'Lily Lopez', v: 'Cleaning · 60 min', s: 'Confirmed', i: 'LL', c: 'bg-emerald-400', g: '★' },
    { t: '11:30', n: 'Marcus Johnson', v: 'Consultation', s: 'Unconfirmed', i: 'MJ', c: 'bg-amber-400' },
  ]
  return (
    <div className={`overflow-hidden rounded-2xl bg-[#F3F7FE] text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center gap-1.5 bg-[#E9F0FC] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[0.62rem] font-medium text-gray-400">
          www.dreamcreatestudio.com
        </span>
      </div>
      <div className="flex">
        {/* ── Sidebar (real IA: lockup → org → pinned cockpit → groups) ── */}
        <div className="hidden w-[8.6rem] shrink-0 flex-col p-2.5 sm:flex">
          <div className="mb-2 flex items-center gap-[3px] px-1">
            <span className="flex h-[15px] w-[15px] items-center justify-center rounded-[5px] bg-gradient-to-br from-[#7CA5FF] to-[#3A67D9] text-[0.54rem] font-extrabold leading-none text-white">
              D
            </span>
            <span className="text-[0.68rem] font-extrabold leading-none tracking-tight text-gray-900">
              ream<span className="text-[#4C7DF0]">CRM</span>
            </span>
          </div>
          <div className={`mb-2.5 rounded-lg bg-white px-1.5 py-1 ${MOCK_TILE_SHADOW}`}>
            <p className="truncate text-[0.58rem] font-bold text-gray-800">Dream Dental</p>
            <p className="text-[0.48rem] font-semibold text-gray-400">Premium plan</p>
          </div>
          <div className="mb-2 space-y-0.5 rounded-lg bg-[#E9F0FC]/60 p-1">
            <div className={`flex items-center justify-between rounded-full px-2 py-1 text-[0.6rem] font-bold ${MOCK_PILL} shadow-[0_2px_8px_rgba(76,125,240,.35)]`}>
              Overview <span className="text-[0.44rem] font-semibold opacity-80">⌘1</span>
            </div>
            <div className="flex items-center justify-between rounded-full px-2 py-1 text-[0.6rem] font-semibold text-gray-500">
              Messages
              <span className={`flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[0.46rem] font-bold ${TONE_FILL.warn}`}>3</span>
            </div>
            <div className="rounded-full px-2 py-1 text-[0.6rem] font-semibold text-gray-500">Appointments</div>
          </div>
          <p className="px-1 pb-0.5 text-[0.48rem] font-bold uppercase tracking-wider text-gray-400">Daily</p>
          <div className="space-y-0.5">
            {daily.map((item) => (
              <div key={item} className="rounded-full px-2 py-[3px] text-[0.6rem] font-semibold text-gray-500">
                {item}
              </div>
            ))}
          </div>
          {[
            ['Growth', 'Growth'],
            ['Website', 'Website'],
            ['Business', 'Payments · Shop'],
          ].map(([label, item]) => (
            <div key={label} className="mt-1.5">
              <p className="px-1 pb-0.5 text-[0.48rem] font-bold uppercase tracking-wider text-gray-400">{label}</p>
              <div className="rounded-full px-2 py-[3px] text-[0.6rem] font-semibold text-gray-500">{item}</div>
            </div>
          ))}
        </div>

        {/* ── Main ── */}
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono-num text-[0.56rem] font-bold uppercase tracking-wider text-[#2F52B3]">Morning huddle · Tue, Jun 16</p>
              <p className="text-[1rem] font-extrabold tracking-tight text-gray-900">Dream Dental</p>
              <p className="text-[0.56rem] font-medium text-gray-400">
                The six things worth your attention this morning — every number opens the list behind it.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded-full bg-white px-2 py-1 text-[0.58rem] font-bold text-gray-600 ${MOCK_TILE_SHADOW}`}>Open agenda</span>
              <span className={`rounded-full ${MOCK_PILL} px-2 py-1 text-[0.58rem] font-bold shadow-[0_2px_8px_rgba(76,125,240,.35)]`}>+ New booking</span>
            </div>
          </div>

          {/* Attention cards — white, big number, action link (the real thing) */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Unconfirmed', n: '3', sub: 'visits in the next 48h', rows: ['Liam · 9:30 tomorrow', 'Marcus · 11:30'], link: 'Send confirmations →' },
              { label: 'New leads', n: '2', sub: 'untouched inquiries', rows: ['Olivia Chen · implants', 'Noah Reed · whitening'], link: 'See new leads →' },
              { label: 'Balances', n: '$523', sub: '3 patients owe', rows: ['Liam Brooks · $214', 'Ava Morgan · $180'], link: 'See who owes →' },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl bg-white p-2 ${MOCK_CARD_SHADOW}`}>
                <p className="font-mono-num text-[0.5rem] font-bold uppercase tracking-wider text-gray-400">{c.label}</p>
                <p className="font-mono-num text-[0.92rem] font-extrabold leading-tight tracking-tight text-gray-900">
                  {c.n} <span className="font-sans text-[0.5rem] font-semibold text-gray-400">{c.sub}</span>
                </p>
                <div className="mt-1 space-y-0.5">
                  {c.rows.map((r) => (
                    <p key={r} className="truncate rounded bg-[#F8FAFF] px-1.5 py-0.5 text-[0.52rem] font-medium text-gray-500">{r}</p>
                  ))}
                </div>
                <p className="mt-1 text-[0.54rem] font-bold text-[#2F52B3]">{c.link}</p>
              </div>
            ))}
          </div>

          {/* Today's chair — plain rows, dividers, ring in the header */}
          <div className={`rounded-xl bg-white ${MOCK_CARD_SHADOW}`}>
            <div className="flex items-center justify-between rounded-t-xl bg-[#E9F0FC]/50 px-2.5 py-1.5">
              <p className="text-[0.62rem] font-bold text-gray-800">Today&apos;s chair</p>
              <span className="flex items-center gap-1.5">
                <span className="font-mono-num text-[0.5rem] font-semibold text-gray-400">8 booked · 5 confirmed</span>
                <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90">
                  <circle cx="10" cy="10" r="7.5" fill="none" stroke="#4C7DF0" strokeOpacity=".18" strokeWidth="2.6" />
                  <circle cx="10" cy="10" r="7.5" fill="none" stroke="#4C7DF0" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="47.1" strokeDashoffset="17.7" />
                </svg>
              </span>
            </div>
            <div className="divide-y divide-[#E9F0FC] px-2.5">
              {chair.map((r) => (
                <div key={r.t} className="flex items-center gap-2 py-1">
                  <span className="w-7 font-mono-num text-[0.56rem] font-bold text-gray-400">{r.t}</span>
                  <Avatar initials={r.i} color={r.c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-[0.64rem] font-bold text-gray-800">{r.n}</span>
                      {r.g && <span className="shrink-0 text-[0.52rem] leading-none">{r.g}</span>}
                    </span>
                    <span className="block text-[0.52rem] text-gray-400">{r.v}</span>
                  </span>
                  <StatusPill tone={r.s === 'Confirmed' ? 'emerald' : 'amber'}>{r.s}</StatusPill>
                </div>
              ))}
            </div>
          </div>

          {/* Trend tiles — mono numbers + the booking pulse */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Bookings today', n: '6', sub: 'across all channels', tone: 'text-gray-400', spark: true },
              { label: 'New patients MTD', n: '12', sub: '+3 vs last month', tone: 'text-emerald-600' },
              { label: 'Recall booked', n: '9', sub: 'this week', tone: 'text-gray-400' },
              { label: 'Website visits', n: '214', sub: '+18% vs prior wk', tone: 'text-emerald-600' },
            ].map((t) => (
              <div key={t.label} className={`relative rounded-xl bg-white px-2 py-1.5 ${MOCK_TILE_SHADOW}`}>
                <p className="truncate font-mono-num text-[0.48rem] font-bold uppercase tracking-wide text-gray-400">{t.label}</p>
                <p className="font-mono-num text-[0.86rem] font-extrabold text-gray-900">{t.n}</p>
                <p className={`truncate text-[0.48rem] font-semibold ${t.tone}`}>{t.sub}</p>
                {/* The booking pulse EMITS rather than sits flat — BRAND.md
                    Part 3, and the one lit thing inside the instrument glass.
                    A drop-shadow rather than a glow layer, so it costs one
                    filter and reads the same on the daylight /product page. */}
                {t.spark && (
                  <svg
                    viewBox="0 0 60 16"
                    className="absolute bottom-1.5 right-1.5 h-3 w-12 text-[#4C7DF0]"
                    preserveAspectRatio="none"
                    style={{ filter: 'drop-shadow(0 0 2.5px rgb(76 125 240 / 0.65))' }}
                  >
                    <polyline points="0,13 9,11 18,12 27,8 36,9 45,5 52,7 60,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="60" cy="2" r="1.8" fill="currentColor" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Phone-framed patient portal at the real portal's polish — floating cards
 *  on warm shadows, serif greeting, membership progress, honest tab bar.
 *  Accents wear the DreamCRM blue (owner call 2026-07-19; the warm cream
 *  canvas stays). */
export function PortalMock() {
  return (
    <div className="mx-auto w-[236px] overflow-hidden rounded-[2.6rem] border-[8px] border-gray-900 bg-[#FAF7F2] text-left shadow-2xl shadow-gray-500/30 ring-1 ring-black/5" aria-hidden="true">
      {/* status bar + notch */}
      <div className="relative flex items-center justify-between bg-[#FAF7F2] px-4 pt-2 pb-1 text-[#1C1A17]">
        <span className="text-[0.5rem] font-bold tabular-nums">9:41</span>
        <span className="absolute left-1/2 top-1.5 h-3 w-14 -translate-x-1/2 rounded-full bg-gray-900" />
        <span className="flex items-center gap-1">
          <span className="flex items-end gap-[1.5px]">
            <span className="h-1 w-[2px] rounded-sm bg-current" />
            <span className="h-[6px] w-[2px] rounded-sm bg-current" />
            <span className="h-2 w-[2px] rounded-sm bg-current" />
            <span className="h-2.5 w-[2px] rounded-sm bg-current opacity-30" />
          </span>
          <svg viewBox="0 0 16 11" className="h-2 w-2.5 fill-current" aria-hidden="true">
            <path d="M8 10.5 .4 3A10.7 10.7 0 0 1 15.6 3L8 10.5Z" />
          </svg>
          <span className="relative inline-flex h-2 w-3.5 items-center rounded-[2px] border border-current px-[1px]">
            <span className="h-1 w-2/3 rounded-[1px] bg-current" />
            <span className="absolute -right-[2.5px] top-1/2 h-[5px] w-[1.5px] -translate-y-1/2 rounded-r-sm bg-current" />
          </span>
        </span>
      </div>
      {/* clinic-branded header */}
      <div className="flex items-center gap-2 px-3.5 pb-1 pt-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C7DF0] text-[0.55rem] font-bold text-white shadow-[0_3px_8px_rgba(76,125,240,.4)]">D</span>
        <span className="whitespace-nowrap text-[0.72rem] font-bold tracking-tight text-[#1C1A17]">Dream Dental</span>
        <span className="ml-auto shrink-0 rounded-full bg-[#4C7DF0] px-2.5 py-1 text-[0.52rem] font-bold text-white shadow-[0_3px_8px_rgba(76,125,240,.35)]">Book</span>
      </div>
      <div className="space-y-2.5 px-3.5 pb-3 pt-1.5">
        <div>
          <p className="font-serif text-[1.05rem] font-semibold leading-tight text-[#1C1A17]">Good morning, Mia</p>
          <p className="text-[0.54rem] font-medium text-[#6B635A]">Here&apos;s what&apos;s coming up for your family.</p>
        </div>

        {/* Next visit — the hero card */}
        <div className="rounded-2xl bg-white p-3 shadow-[0_3px_8px_rgba(107,99,90,.06),0_12px_28px_rgba(107,99,90,.12)]">
          <div className="flex items-center justify-between">
            <p className="text-[0.5rem] font-bold uppercase tracking-wider text-[#6B635A]">Next visit</p>
            <span className="rounded-full bg-[#EEF4FF] px-1.5 py-0.5 text-[0.48rem] font-bold text-[#2F52B3]">Tomorrow</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-col items-center justify-center rounded-xl bg-[#EEF4FF] leading-none">
              <span className="text-[0.44rem] font-bold uppercase text-[#2F52B3]">Jun</span>
              <span className="font-serif text-[0.8rem] font-bold text-[#1C1A17]">17</span>
            </span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold text-[#1C1A17]">Cleaning · 9:30 AM</p>
              <p className="text-[0.54rem] font-medium text-[#6B635A]">Maria Vega · 45 min</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <span className="flex-1 rounded-full bg-[#4C7DF0] px-2.5 py-1.5 text-center text-[0.56rem] font-bold text-white shadow-[0_3px_8px_rgba(76,125,240,.35)]">
              Confirm visit
            </span>
            <span className="flex-1 rounded-full bg-[#F3EFE8] px-2.5 py-1.5 text-center text-[0.56rem] font-bold text-[#1C1A17]">
              Reschedule
            </span>
          </div>
        </div>

        {/* Forms nudge */}
        <div className="flex items-center gap-2 rounded-2xl bg-white p-2.5 shadow-[0_2px_6px_rgba(107,99,90,.05),0_8px_20px_rgba(107,99,90,.08)]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FBF3E4] text-[0.62rem]">📝</span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.58rem] font-bold leading-tight text-[#1C1A17]">2 quick forms before your visit</p>
            <p className="text-[0.5rem] font-medium text-[#6B635A]">Saves you the clipboard at the desk.</p>
          </div>
          <span className="shrink-0 text-[0.62rem] font-bold text-[#4C7DF0]">→</span>
        </div>

        {/* Membership */}
        <div className="rounded-2xl bg-gradient-to-br from-[#6C9CFF] to-[#2F52B3] p-3 text-white shadow-[0_6px_18px_rgba(47,82,179,.35)]">
          <div className="flex items-center justify-between">
            <p className="text-[0.5rem] font-bold uppercase tracking-wider opacity-90">Smile Club</p>
            <span className="text-[0.62rem]" aria-hidden="true">✨</span>
          </div>
          <p className="mt-1 font-serif text-[0.76rem] font-semibold">2 of 3 cleanings left</p>
          <div className="mt-1.5 flex gap-1">
            <span className="h-1 flex-1 rounded-full bg-white/90" />
            <span className="h-1 flex-1 rounded-full bg-white/90" />
            <span className="h-1 flex-1 rounded-full bg-white/30" />
          </div>
          <p className="mt-1 text-[0.48rem] font-medium opacity-80">Renews Jan 2027 · Family plan</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['📅', 'Book'],
            ['💬', 'Message'],
            ['💳', 'Billing'],
          ].map(([icon, label]) => (
            <div key={label} className="rounded-2xl bg-white px-1.5 py-2 text-center shadow-[0_2px_6px_rgba(107,99,90,.05),0_8px_20px_rgba(107,99,90,.08)]">
              <p className="text-[0.66rem] leading-none">{icon}</p>
              <p className="mt-1 text-[0.52rem] font-bold text-[#1C1A17]">{label}</p>
            </div>
          ))}
        </div>
      </div>
      {/* bottom tab bar */}
      <div className="flex justify-around border-t border-[#EFE9DF] bg-white px-2 pb-1 pt-1.5 text-center text-[0.48rem] font-bold text-[#B4AB9E]">
        {[
          ['Home', true],
          ['Visits', false],
          ['Messages', false],
          ['More', false],
        ].map(([label, active]) => (
          <span key={label as string} className={active ? 'text-[#4C7DF0]' : undefined}>
            <span className="mx-auto mb-0.5 block h-1 w-1 rounded-full" style={{ background: active ? '#4C7DF0' : 'transparent' }} />
            {label}
          </span>
        ))}
      </div>
      {/* home indicator */}
      <div className="flex justify-center bg-white pb-1.5 pt-0.5">
        <span className="h-1 w-20 rounded-full bg-gray-900/70" />
      </div>
    </div>
  )
}

/** Edit-in-place website studio over the warm clinic site. */
export function EditorMock() {
  return (
    <div className={`overflow-hidden rounded-2xl bg-[#F3F7FE] text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center gap-1.5 bg-[#E9F0FC] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[0.62rem] font-medium text-gray-400">
          acme-dental.dreamcreatestudio.com
        </span>
        <span className={`ml-auto rounded-full ${MOCK_PILL} px-2 py-0.5 text-[0.6rem] font-bold`}>Editing</span>
      </div>
      <div className="bg-[#FAF7F2] p-4">
        <div className="relative rounded-lg border-2 border-dashed border-teal-400 bg-white/70 p-3.5">
          <span className={`absolute -top-2.5 right-3 rounded-full ${MOCK_PILL} px-2 py-0.5 text-[0.58rem] font-bold`}>
            ✎ Edit headline
          </span>
          <p className="font-serif text-[1.05rem] font-semibold leading-snug text-[#7E957F]">
            Dental care that finally feels human.
          </p>
          <p className="mt-1 text-[0.62rem] text-[#6B635A]">Same-week visits · No judgment, ever · Most PPO plans</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[['01', 'Cleanings'], ['02', 'Whitening'], ['03', 'Invisalign']].map(([n, label]) => (
            <div key={n} className="rounded-lg bg-white p-2">
              <p className="text-[0.6rem] font-bold text-[#7E957F]">{n}</p>
              <p className="text-[0.62rem] font-semibold text-[#1C1A17]">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7E957F] text-[0.6rem] font-bold text-white">
            DR
          </span>
          <div>
            <p className="text-[0.66rem] font-bold text-[#1C1A17]">Dr. Elena Reyes</p>
            <p className="text-[0.56rem] text-[#6B635A]">Lead dentist · 12 years</p>
          </div>
          <span className="ml-auto rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[0.56rem] font-bold text-teal-700">
            📷 Replace
          </span>
        </div>
      </div>
    </div>
  )
}

/** Live slot grid, one taken slot struck through, one selected. */
export function BookingMock() {
  const days: Array<[string, string, boolean]> = [['Mon', '15', false], ['Tue', '16', true], ['Wed', '17', false], ['Thu', '18', false]]
  const slots: Array<[string, 'open' | 'taken' | 'selected']> = [
    ['8:00 AM', 'open'], ['8:30 AM', 'open'], ['9:00 AM', 'taken'],
    ['9:30 AM', 'open'], ['10:00 AM', 'selected'], ['10:30 AM', 'open'],
  ]
  return (
    <div className={`rounded-2xl bg-white p-5 text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <p className="font-serif text-[0.85rem] font-bold text-[#1C1A17]">Book a visit — Cleaning</p>
      <p className="mt-0.5 text-[0.66rem] text-[#6B635A]">Real openings from Dream Dental&apos;s calendar</p>
      <div className="mt-3 flex gap-2">
        {days.map(([dow, d, active]) => (
          <div
            key={d}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-center ${active ? 'border-[#7E957F] bg-[#7E957F] text-white' : 'border-[#E8E2D9] text-[#6B635A]'}`}
          >
            <p className="text-[0.56rem] font-semibold opacity-80">{dow}</p>
            <p className="text-[0.8rem] font-extrabold leading-tight">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {slots.map(([t, state]) => (
          <div
            key={t}
            className={`rounded-lg border px-2 py-1.5 text-center text-[0.66rem] font-semibold ${
              state === 'taken'
                ? 'border-[#F0EBE2] bg-[#FAF7F2] text-[#C9C2B6] line-through'
                : state === 'selected'
                  ? 'border-[#7E957F] bg-[#FAF7F2] text-[#5f7561]'
                  : 'border-[#E8E2D9] text-[#1C1A17]'
            }`}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-full bg-[#7E957F] py-2 text-center text-[0.7rem] font-bold text-white">
        Book Tuesday · 10:00 AM
      </div>
      <p className="mt-2 text-center text-[0.58rem] text-[#6B635A]">Confirmation + intake form sent automatically</p>
    </div>
  )
}

/** One patient thread across portal + email. */
export function MessagesMock() {
  return (
    <div className={`rounded-2xl bg-white p-5 text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
        <Avatar initials="SI" color="bg-teal-400" />
        <div>
          <p className="text-[0.78rem] font-bold text-gray-900">Sophia Iverson</p>
          <p className="text-[0.6rem] text-gray-400">Next visit: Jun 24 · Cleaning</p>
        </div>
        <span className="ml-auto"><StatusPill tone="amber">Waiting 2h</StatusPill></span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex justify-start">
          <p className="max-w-[75%] rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-[0.7rem] leading-snug text-gray-800">
            Hi! Any chance I can move Friday&apos;s cleaning to next week? Work got crazy 😅
          </p>
        </div>
        <p className="pl-1 text-[0.54rem] font-bold uppercase tracking-wide text-gray-400">via portal · 8:14 AM</p>
        <div className="flex justify-end">
          <p className="max-w-[75%] rounded-2xl rounded-br-md bg-teal-600 px-3 py-2 text-[0.7rem] leading-snug text-white">
            Of course! Tuesday 2:30 or Wednesday 9:00 — which works better?
          </p>
        </div>
        <div className="flex justify-start">
          <p className="max-w-[60%] rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-[0.7rem] leading-snug text-gray-800">
            Tuesday 2:30, perfect. Thank you!!
          </p>
        </div>
        <p className="pl-1 text-[0.54rem] font-bold uppercase tracking-wide text-gray-400">via email — same thread</p>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-lg bg-[#E9F0FC] px-3 py-1.5 text-[0.66rem] text-gray-500">
          Reply… <span className="text-gray-400">(templates ⌄)</span>
        </div>
        <span className={`rounded-full ${MOCK_PILL} px-3 py-1.5 text-[0.66rem] font-bold`}>Send</span>
      </div>
    </div>
  )
}

/** Patient review → featured testimonial flow. */
export function ReviewsMock() {
  return (
    <div className="space-y-3 text-left" aria-hidden="true">
      <div className={`rounded-2xl bg-white p-4 ${MOCK_FRAME_SHADOW}`}>
        <div className="flex items-center gap-2">
          <Avatar initials="NM" color="bg-emerald-500" />
          <p className="text-[0.72rem] font-bold text-gray-900">Noah Mitchell</p>
          <div className="ml-auto flex text-amber-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.9L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
              </svg>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] italic leading-relaxed text-gray-700">
          “Booked online at 11pm on a Sunday, sat in the chair Tuesday morning. They explained
          every step before any work — no surprises, no upsells.”
        </p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[0.6rem] text-gray-400">Completed visit · Jun 9</p>
          <span className={`rounded-full ${MOCK_PILL} px-3 py-1 text-[0.62rem] font-bold`}>
            Feature on website →
          </span>
        </div>
      </div>
      {/* THE NINTH CALL SITE, and the one that is not a marketing list.
          It sits INSIDE a product mock, so it does NOT take a `ToneTile` — the
          mocks wear the dashboard's v3 language, and dropping a marketing tile
          in here would make the picture an unfaithful one, which is the
          argument `BRAND.md` Part 0 item 4 already settled for the emoji ban.
          What it takes instead is the registry's `star` PATH at mock scale:
          the veto is satisfied, the glyph finally says what the strip is about
          (a review went live), and it rhymes with the five amber stars a few
          pixels above it rather than with a form field. */}
      <div className={`ml-8 flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-2.5 ${MOCK_TILE_SHADOW}`}>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current text-emerald-600" aria-hidden="true">
          {TONE_TILE_PATH.star}
        </svg>
        <p className="text-[0.64rem] font-bold text-emerald-800">
          Live on your testimonials as “Noah M. · Cedar Park” — and invited onward to Google.
        </p>
      </div>
    </div>
  )
}

/** Sent → Opened → Clicked → Booked funnel with real numbers. */
export function RecallFunnelMock() {
  const stages: Array<[string, number, string, string]> = [
    ['Sent', 142, 'w-full', 'bg-teal-200 text-teal-900'],
    ['Opened', 96, 'w-[72%]', 'bg-teal-300 text-teal-900'],
    ['Clicked', 41, 'w-[42%]', 'bg-teal-400 text-white'],
    ['Booked', 18, 'w-[26%]', 'bg-teal-600 text-white'],
  ]
  return (
    <div className={`rounded-2xl bg-white p-5 text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-[0.85rem] font-bold text-gray-900">“Time for your next cleaning”</p>
        <StatusPill tone="emerald">Sent Jun 2</StatusPill>
      </div>
      <p className="mt-0.5 text-[0.66rem] text-gray-400">Audience: due or overdue · builds itself from patient data</p>
      <div className="mt-4 space-y-2">
        {stages.map(([label, n, width, tone]) => (
          <div key={label} className={`flex items-center justify-between rounded-full px-3 py-1.5 ${width} ${tone}`}>
            <span className="text-[0.66rem] font-bold">{label}</span>
            <span className="text-[0.72rem] font-extrabold">{n}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.64rem] font-bold text-emerald-700">
        ↳ 18 real visits on the books — none of them from a phone call
      </p>
    </div>
  )
}

/** Storefront with named products and prices. */
export function ShopMock() {
  const products: Array<[string, string, string, string]> = [
    ['Whitening kit', '$49', 'bg-teal-50', '😁'],
    ['Sonic brush', '$89', 'bg-sky-50', '🪥'],
    ['Smile Club · yearly', '$399', 'bg-emerald-50', '✨'],
    ['Retainer cleaner', '$14', 'bg-amber-50', '🫧'],
  ]
  return (
    <div className={`rounded-2xl bg-white p-5 text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-[0.85rem] font-bold text-gray-900">Dream Dental Shop</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.6rem] font-bold text-emerald-700">
          Payouts → your bank
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {products.map(([name, price, tone, emoji]) => (
          <div key={name} className="rounded-xl bg-[#F8FAFF] p-2.5">
            <div className={`mb-2 flex h-12 items-center justify-center rounded-lg text-base ${tone}`}>{emoji}</div>
            <p className="truncate text-[0.66rem] font-bold text-gray-800">{name}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[0.7rem] font-extrabold text-gray-900">{price}</p>
              <span className={`rounded-full ${MOCK_PILL} px-2 py-0.5 text-[0.56rem] font-bold`}>Add</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[0.58rem] text-gray-400">
        Membership billing + birthday coupons included
      </p>
    </div>
  )
}

/** Google Business connection (synced reviews) + one composer publishing to
 *  Google and the socials. */
export function GoogleSocialMock() {
  const channels: Array<[string, string]> = [
    ['Google', 'bg-[#4285F4]'],
    ['Instagram', 'bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]'],
    ['Facebook', 'bg-[#1877F2]'],
    ['TikTok', 'bg-gray-900'],
  ]
  return (
    <div className={`rounded-2xl bg-white p-5 text-left ${MOCK_FRAME_SHADOW}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4285F4] text-[0.66rem] font-bold text-white">G</span>
          <div>
            <p className="text-[0.78rem] font-bold text-gray-900">Google Business</p>
            <p className="text-[0.58rem] text-gray-400">Dream Dental · connected</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">
          <span className="flex text-amber-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
                <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.9L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
              </svg>
            ))}
          </span>
          4.9 · 128
        </span>
      </div>
      <div className="mt-3 rounded-xl bg-[#F8FAFF] p-2.5">
        <p className="text-[0.64rem] leading-snug text-gray-700">
          &ldquo;Got me in same week and explained every step. Painless.&rdquo;
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`rounded-full ${MOCK_PILL} px-2 py-0.5 text-[0.56rem] font-bold`}>Reply</span>
          <span className="text-[0.56rem] text-gray-400">synced from Google — reply in one place</span>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-[#F8FAFF] p-2.5">
        <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-gray-400">New post · publish to</p>
        <div className="flex flex-wrap gap-1.5">
          {channels.map(([label, tone]) => (
            <span key={label} className={`flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.58rem] font-semibold text-gray-700 ${MOCK_TILE_SHADOW}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
              {label}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[0.62rem] text-gray-500">&ldquo;Now welcoming new patients ✨&rdquo;</p>
          <span className={`rounded-full ${MOCK_PILL} px-2.5 py-1 text-[0.58rem] font-bold`}>Schedule</span>
        </div>
      </div>
    </div>
  )
}
