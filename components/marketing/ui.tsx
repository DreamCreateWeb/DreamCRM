import Link from 'next/link'
import { FOOTER_COLUMNS, MARKETING } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { TONE_FILL } from '@/lib/ui/encodings'

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
 * **The BASE rules are the real stacked layout, and `.is-cinematic` is the
 * pinned sequence added on top.** Part 6 requires that
 * `prefers-reduced-motion` gets "a real layout, not a disabled one", and the
 * only way to owe that rather than claim it is for the ordinary reading layout
 * to be what the server renders and what every excluded reader keeps. So the
 * cascade runs in the safe direction: no class, no pin, real page.
 *
 * The three `@media` blocks at the bottom then REVERT `.is-cinematic` under the
 * conditions where the pin is illegal — reduced motion, a coarse pointer
 * (Part 10: "the pinned scroll does not pin on touch"), and any viewport under
 * `lg`. That duplicates a check the component also makes, deliberately: the JS
 * half is the one that can be wrong about the environment or fail to hear a
 * change, and the CSS half cannot. Either alone is sufficient; both is the
 * point.
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

      /* ── THE PINNED SEQUENCE ── */
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
      .mkt-spine-rail-dot { height: 0.5rem; width: 0.5rem; flex: none; border-radius: 999px; background: #c3d0e8; }
      .mkt-spine-rail[data-active="0"] .mkt-spine-rail-item:nth-child(1),
      .mkt-spine-rail[data-active="1"] .mkt-spine-rail-item:nth-child(2),
      .mkt-spine-rail[data-active="2"] .mkt-spine-rail-item:nth-child(3),
      .mkt-spine-rail[data-active="3"] .mkt-spine-rail-item:nth-child(4) { color: #2f52b3; }
      .mkt-spine-rail[data-active="0"] .mkt-spine-rail-item:nth-child(1) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="1"] .mkt-spine-rail-item:nth-child(2) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="2"] .mkt-spine-rail-item:nth-child(3) .mkt-spine-rail-dot,
      .mkt-spine-rail[data-active="3"] .mkt-spine-rail-item:nth-child(4) .mkt-spine-rail-dot { background: #2f52b3; }

      /* ── THE THREE HARD REVERTS. Each one puts the stacked layout back even
            if the class is present — see this constant's header for why the
            component checking the same three conditions is not enough. ── */
      @media (prefers-reduced-motion: reduce) {
        .mkt-spine.is-cinematic .mkt-spine-track { height: auto; }
        .mkt-spine.is-cinematic .mkt-spine-pin { position: static; height: auto; overflow: visible; }
        .mkt-spine.is-cinematic .mkt-spine-intro,
        .mkt-spine.is-cinematic .mkt-spine-stage,
        .mkt-spine.is-cinematic .mkt-spine-cards,
        .mkt-spine.is-cinematic .mkt-spine-card { position: static; opacity: 1; transform: none; }
        .mkt-spine.is-cinematic .mkt-spine-rail { display: none; }
      }
      @media (hover: none), (pointer: coarse) {
        .mkt-spine.is-cinematic .mkt-spine-track { height: auto; }
        .mkt-spine.is-cinematic .mkt-spine-pin { position: static; height: auto; overflow: visible; }
        .mkt-spine.is-cinematic .mkt-spine-intro,
        .mkt-spine.is-cinematic .mkt-spine-stage,
        .mkt-spine.is-cinematic .mkt-spine-cards,
        .mkt-spine.is-cinematic .mkt-spine-card { position: static; opacity: 1; transform: none; }
        .mkt-spine.is-cinematic .mkt-spine-rail { display: none; }
      }
      @media (max-width: 1023px) {
        .mkt-spine.is-cinematic .mkt-spine-track { height: auto; }
        .mkt-spine.is-cinematic .mkt-spine-pin { position: static; height: auto; overflow: visible; }
        .mkt-spine.is-cinematic .mkt-spine-intro,
        .mkt-spine.is-cinematic .mkt-spine-stage,
        .mkt-spine.is-cinematic .mkt-spine-cards,
        .mkt-spine.is-cinematic .mkt-spine-card { position: static; opacity: 1; transform: none; }
        .mkt-spine.is-cinematic .mkt-spine-rail { display: none; }
      }`

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
 */
export function DaylightSky() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="mkt-bloom absolute inset-0" style={DAYLIGHT_BLOOM} />
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
            <p className="text-[0.75rem] font-bold uppercase tracking-wider text-gray-300">{col.title}</p>
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
            has the provenance, and a test fails if this line disappears. */}
        <div className="mx-auto max-w-6xl px-4 pb-5 text-[0.72rem] sm:px-6">
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

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.14em] text-teal-700">{children}</p>
  )
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

/** The DAYLIGHT hero texture — subpage heroes only now.
 *
 *  It used to be shared with the homepage hero, which is the night band since
 *  DREAMCRM-54; the export stays because `PageHero` is about to be reskinned
 *  too (BRAND.md Part 8, move 3) and this is the thing that will be replaced
 *  wholesale rather than edited. Until then every subpage still wears it, so
 *  changing it here changes pricing, compare, docs and the blog at once. */
export const HERO_DOT_GRID = {
  backgroundImage: 'radial-gradient(circle, #c1d6ff 1px, transparent 1px)',
  backgroundSize: '22px 22px',
} as const

/** Shared subpage hero: dot-grid texture + eyebrow + title + sub. */
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
    <section className="relative overflow-hidden border-b border-gray-100">
      <div className="absolute inset-0 opacity-30" style={HERO_DOT_GRID} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <div className="mkt-enter">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        <h1 className="mkt-enter mkt-d1 text-[2.1rem] font-extrabold leading-tight tracking-tight sm:text-[2.7rem]">
          {title}
        </h1>
        {sub && (
          <p className="mkt-enter mkt-d2 mx-auto mt-4 max-w-2xl text-[1rem] leading-relaxed text-gray-600">
            {sub}
          </p>
        )}
        {children && <div className="mkt-enter mkt-d3 mt-7">{children}</div>}
      </div>
    </section>
  )
}

export function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-[0.92rem] font-semibold text-white shadow-sm shadow-teal-200 transition-all hover:-translate-y-px hover:bg-teal-800 hover:shadow-md hover:shadow-teal-200"
    >
      {children}
    </Link>
  )
}

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
    'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-800 transition-all hover:-translate-y-px hover:border-gray-400 hover:shadow-sm'
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

export function CheckIcon({ className = 'h-4 w-4 text-teal-700' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" />
    </svg>
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
      <div className={`ml-8 flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-2.5 ${MOCK_TILE_SHADOW}`}>
        <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
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
