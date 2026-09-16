'use client'

import { useCallback, useEffect, useRef } from 'react'
import { MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'

/**
 * THE CINEMATIC SPINE — `BRAND.md` Part 6, built on Part 8 move 2
 * (DREAMCRM-70). The owner asked for it in his own words on DREAMCRM-67:
 *
 *   "i know i like cool effects and animations, like when a picture zooms to
 *    fill the full viewport on scroll, and then it switches from scrolling the
 *    page to scrolling popups over the picture"
 *
 * The sequence, per Part 6: the product sits in its frame under the headline →
 * the frame grows toward full bleed while the headline fades behind it → the
 * page pins and the chapter cards scroll OVER the product one at a time, with a
 * chapter rail tracking position → after the last chapter the section unpins.
 *
 * ── THE FOUR THINGS THAT MAKE THIS SHIPPABLE RATHER THAN A DEMO ──────────
 *
 * 1. THE STACKED LAYOUT IS THE DEFAULT, not the fallback.
 *
 *    Part 6: "`prefers-reduced-motion` gets a real layout, not a disabled
 *    one." The way to owe that rather than promise it is to make the ordinary
 *    reading layout the BASE — headline, then the product in a contained
 *    frame, then four chapter sections top to bottom — and treat the pin as
 *    something added on top by `.is-cinematic`. So the server HTML is the
 *    stacked layout, every reader who never gets the class gets a real page,
 *    and "no content is reachable only by animating" is true by construction
 *    rather than by inspection. JS failing, hydration failing, or the class
 *    never arriving all land on the same correct page.
 *
 *    It is belt AND braces, and the CSS is the belt: `SPINE_CSS` in
 *    `MarketingMotionStyles` puts the ENTIRE pinned sequence behind one
 *    `@media screen and (min-width: 1024px) and (prefers-reduced-motion:
 *    no-preference) and (hover: hover) and (pointer: fine)` gate, so outside
 *    those conditions — print included — the pinned declarations are not in
 *    the stylesheet at all and the class does nothing. That half alone is
 *    sufficient. (It did not used to be: this shipped as three revert blocks
 *    that put back four properties and missed four more, and had no print
 *    case; Vesper's DREAMCRM-70 review measured it. See the `SPINE_CSS`
 *    header.)
 *
 *    This JS half adds the class where it agrees with that gate, plus the one
 *    question a media query cannot ask: whether the tallest chapter card FITS
 *    the window at the reader's own font size — see `pinnedCardFits`.
 *
 * 2. ONE SCROLL POSITION DRIVES EVERYTHING.
 *
 *    Part 6 forbids "a chain of listeners" and "a queue". There is exactly one
 *    `scroll` listener, it does exactly one `getBoundingClientRect()` read per
 *    frame, and every transform on screen is a pure function of the single
 *    normalised `p` it produces. Nothing here is a CSS transition or a CSS
 *    animation, which is what makes it INTERRUPTIBLE for free: reversing the
 *    wheel does not reverse an animation, it evaluates the same function at
 *    the new scroll position on the next frame. There is no state to unwind,
 *    so nothing can finish an animation the reader already scrolled away from.
 *
 * 3. THE PIN CANNOT TRAP A KEYBOARD OR SCREEN-READER USER.
 *
 *    Two decisions carry this, and both are structural:
 *
 *    · The pin is `position: sticky`, so the DOCUMENT never stops scrolling.
 *      Nothing here calls `preventDefault` on a wheel event, `scrollTo`, or
 *      `scrollIntoView` — the reader's scroll input always does what they
 *      expect, and the section is escapable at any point in either direction.
 *    · **Nothing inside the pinned region is focusable.** The chapter cards
 *      are text, the chapter rail is a non-interactive indicator, and the
 *      section's one link sits in the RELEASE block after the pin, as ordinary
 *      page content. That is what makes Part 6's "focus moving into a chapter
 *      must not fight the scroll position" unfalsifiable rather than tuned:
 *      there is no focus to move in. `tests/marketing/cinematic-spine.test.tsx`
 *      holds that at zero, because the natural way to break it later is to
 *      drop a "learn more" link into a card that spends most of the scroll at
 *      opacity 0 — an invisible focus stop.
 *
 *    All four chapters are in the DOM, in reading order, in the accessibility
 *    tree, at every scroll position. A screen reader reads the section as four
 *    ordered sections regardless of what the sighted sequence is doing.
 *
 * 4. TRANSFORM AND OPACITY ONLY, and nothing on the compositor that a guard
 *    cannot see. `CinemaStage` below is a product illustration at REAL product
 *    scale, and every ink/surface pair in it is legal on its own ground —
 *    deliberately, because it is NOT in `DECORATIVE_MOCKS` (`e2e/axe.ts`) and
 *    must pass the homepage's ceiling of zero on its own merits. See its own
 *    note for why it is not dimmed.
 */

/** How much of the scroll the opening move (frame grows, headline fades) gets.
 *  Everything after it belongs to the chapters. */
const OPEN = 0.16

/** Rest scale of the stage — the "frame under the headline" of Part 6 step 1.
 *  Reaches 1 (full bleed) at `OPEN`. */
const REST_SCALE = 0.56

/** How far down the viewport the resting frame sits, in vh, so the headline
 *  above it has a column of its own. Reaches 0 at `OPEN`. */
const REST_SHIFT_VH = 15

/** How far a chapter card travels on its way in and out, in px. Part 6's
 *  "springy but subtle" — this is a rise, not a flight. */
const CARD_TRAVEL = 44

/**
 * The four chapters. `rail` is the short form the indicator carries; `eyebrow`
 * is the card's own, which is the one a screen reader reads.
 *
 * `BRAND.md` Part 4, owner veto on DREAMCRM-67: **there is no oversized
 * outlined numeral.** The number lives here twice at reading size — in the
 * card eyebrow and in the rail — and the 210px ghost of it behind the card was
 * decoration repeating something already legible, plus the one element in the
 * set a screen reader had to be told to ignore.
 *
 * Copy voice is Part 5: plain, declarative, a time of day instead of an
 * adjective, and the scene narrated rather than the benefit asserted. No emoji
 * — the spine sits over a product mock, which is one of the surfaces Part 5
 * bans them on, and the copy is doing the work here anyway.
 */
export const CHAPTERS: ReadonlyArray<{
  n: string
  rail: string
  eyebrow: string
  title: React.ReactNode
  body: string
}> = [
  {
    n: '01',
    rail: 'THE QUEUE',
    eyebrow: 'THE MORNING QUEUE',
    title: (
      <>
        Four patients still need a text.{' '}
        <span className="text-violet-700">Nobody had to go looking.</span>
      </>
    ),
    body: '7:45am. One screen opens on who is in the chair, who has not confirmed, and which review landed overnight. Your front desk reads the morning in one breath.',
  },
  {
    n: '02',
    rail: 'THE TEXT',
    eyebrow: 'THE TEXT THAT BOOKS',
    title: (
      <>
        She replies <span className="text-violet-700">&ldquo;yes&rdquo;</span> and the chair fills
        itself.
      </>
    ),
    body: '4:12pm. Nobody at the desk picked up a phone, opened a spreadsheet, or remembered anything. The confirmation went out, came back, and landed in your PMS under its own audit trail.',
  },
  {
    n: '03',
    rail: 'THE BALANCE',
    eyebrow: 'THE BALANCE THAT CLEARS',
    title: (
      <>
        The balance is paid <span className="text-violet-700">before she reaches the car.</span>
      </>
    ),
    body: 'Her portal already knew what she owed, in her own branding, on her own phone. The money moves into your bank account — not ours, and not next month.',
  },
  {
    n: '04',
    rail: 'THE REVIEW',
    eyebrow: 'THE REVIEW THAT ARRIVES',
    title: (
      <>
        The visit asks for <span className="text-violet-700">its own review.</span>
      </>
    ),
    body: 'She writes it in her own words, two days later, without anyone chasing her. You put the best ones on your website by clicking them.',
  },
]

/** Total scroll length of the pinned track, in viewport heights: the opening
 *  move plus one screen per chapter. */
const TRACK_STEPS = 1 + CHAPTERS.length

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Ease-out, the only curve `BRAND.md` Part 6 allows on marketing — no spring
 *  overshoot, which is the dashboard's register and reads as bounce here. */
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/**
 * WHETHER THE PINNED LAYOUT HAS ROOM FOR ITS TALLEST CHAPTER CARD.
 *
 * The pin is `overflow: hidden` and the card is centred in the viewport, so a
 * card taller than the window is not merely cramped — the top and the bottom
 * of it are unreachable, with no scroll that brings them back. Vesper's
 * DREAMCRM-70 review found it at the browser's own TEXT-SIZE setting (the
 * low-vision one, not zoom): on a 1024x640 window at a 32px base font the card
 * measured 1,049px and lost the chapter label off the top and the last
 * sentence off the bottom.
 *
 * So the question is MEASURED rather than assumed. The height floor in
 * `legal()` below is a viewport judgement and cannot answer this one, because
 * the thing that overflows is set by the reader's font size, which no media
 * query reports: the same 1024x640 window is fine at 16px and broken at 26px.
 *
 * The room a card needs is its own height plus `CARD_TRAVEL` at each end,
 * since it rides that far either side of centre on its way in and out.
 *
 * The fix for not fitting is to UN-PIN, never to make the card scrollable: a
 * scrollable region has to be keyboard-operable, which means `tabindex="0"`,
 * which would put the one focus stop back inside the pin and undo note 3
 * above. The stacked layout has no such problem — it is just a tall page.
 */
export function pinnedCardFits(tallestCard: number, viewportHeight: number): boolean {
  return tallestCard + CARD_TRAVEL * 2 <= viewportHeight
}

export default function CinematicSpine() {
  const rootRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const introRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Array<HTMLLIElement | null>>([])
  /** The last rail index written, so a `data-` attribute write (a style
   *  recalculation) happens on the ~4 frames it changes rather than all of
   *  them. Pure book-keeping — the value it guards is still derived from `p`. */
  const railAt = useRef(-1)
  const frame = useRef(0)

  /**
   * ONE FRAME. One scroll read, one normalised progress value, every transform
   * on screen derived from it. This is Part 6's "one scroll position drives
   * everything" as the only writer in the component.
   */
  const paint = useCallback(() => {
    frame.current = 0
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return
    // The class is the single source of truth for "is the pin live". When the
    // CSS has reverted us to the stacked layout (reduced motion, touch, narrow)
    // there is nothing to drive, and leaving stale custom properties behind
    // would be a transform applied to an ordinary stacked section.
    if (!root.classList.contains('is-cinematic')) return

    const rect = track.getBoundingClientRect()
    const travel = rect.height - window.innerHeight
    const p = travel > 0 ? clamp01(-rect.top / travel) : 0

    // ── The opening move: the frame grows, the headline fades behind it.
    const open = easeOut(clamp01(p / OPEN))
    const stage = stageRef.current
    if (stage) {
      stage.style.setProperty('--mkt-ss', String(REST_SCALE + (1 - REST_SCALE) * open))
      stage.style.setProperty('--mkt-sy', String(REST_SHIFT_VH * (1 - open)))
    }
    const intro = introRef.current
    if (intro) {
      intro.style.setProperty('--mkt-io', String(1 - clamp01(p / (OPEN * 0.85))))
      intro.style.setProperty('--mkt-iy', String(-18 * open))
    }

    // ── The chapters: one screen each, over the pinned product.
    const slot = (1 - OPEN) / CHAPTERS.length
    for (let i = 0; i < CHAPTERS.length; i++) {
      const card = cardRefs.current[i]
      if (!card) continue
      // Local progress through THIS chapter's slot: <0 before it, >1 after.
      const t = (p - OPEN - i * slot) / slot
      let o: number
      let y: number
      if (t <= 0) {
        // Waiting below, out of sight.
        o = 0
        y = CARD_TRAVEL
      } else if (t < 0.26) {
        // Rising in.
        const e = easeOut(t / 0.26)
        o = e
        y = CARD_TRAVEL * (1 - e)
      } else if (t < 0.74 || i === CHAPTERS.length - 1) {
        // ARRIVED, and dead still: Part 6's "a chapter card's copy is static
        // once the card has arrived" — the never-animate-text rule is not
        // suspended inside the spine. The last chapter holds to the end of the
        // track so the release happens on a settled screen, not mid-fade.
        o = 1
        y = 0
      } else if (t < 1) {
        // Leaving upward, making room for the next one.
        const e = easeOut((t - 0.74) / 0.26)
        o = 1 - e
        y = -CARD_TRAVEL * e
      } else {
        o = 0
        y = -CARD_TRAVEL
      }
      card.style.setProperty('--mkt-co', String(o))
      card.style.setProperty('--mkt-cy', String(y))
    }

    // ── The rail: which chapter the reader is in.
    const rail = railRef.current
    if (rail) {
      rail.style.setProperty('--mkt-ro', String(easeOut(clamp01((p - OPEN * 0.6) / (OPEN * 0.4)))))
      const at = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor((p - OPEN) / slot)))
      if (at !== railAt.current) {
        railAt.current = at
        rail.dataset.active = String(at)
      }
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')

    /**
     * Whether the pin is legal here, per `BRAND.md` Parts 6 and 10.
     *
     * `(pointer: fine)` is the touch test rather than a width test or a user-
     * agent sniff: Part 10 says the pinned scroll "does not pin on touch", and
     * a touch device is one whose primary pointer is coarse. A large tablet
     * and a small laptop can share a width; they do not share a pointer.
     *
     * The height floor is not in the brand book and is a judgement call: the
     * sequence needs a viewport tall enough for a chapter card to sit over the
     * product without covering it, and a short window (a half-height browser
     * on a laptop) is the case where the effect reads as broken rather than
     * cinematic. Below it, the stacked layout is simply better.
     */
    const legal = () =>
      !reduced.matches && fine.matches && window.innerWidth >= 1024 && window.innerHeight >= 620

    /**
     * The second half of that question, and the half only a measurement can
     * answer: does the tallest chapter card FIT? See `pinnedCardFits`.
     *
     * Measured with `.is-cinematic` already applied, which is why `sync` puts
     * the class on before asking — the pinned card is a different width from
     * the stacked one, so the stacked height is the wrong number. Both writes
     * happen in one synchronous block, so nothing is ever painted in between.
     */
    const fits = () => {
      let tallest = 0
      for (const card of cardRefs.current) {
        if (card && card.offsetHeight > tallest) tallest = card.offsetHeight
      }
      return pinnedCardFits(tallest, window.innerHeight)
    }

    /** What the class currently says, tracked here rather than read back off
     *  the element, because `sync` toggles the class mid-measurement. */
    let live = false

    const sync = () => {
      const eligible = legal()
      root.classList.toggle('is-cinematic', eligible)
      const on = eligible && fits()
      if (on !== eligible) root.classList.toggle('is-cinematic', on)

      if (on === live) {
        if (on) paint()
        return
      }
      live = on
      if (on) {
        paint()
      } else {
        // Back to the stacked layout: drop every custom property this
        // component wrote, so the ordinary sections are not left wearing a
        // transform from a mode that is no longer running.
        for (const el of [introRef.current, stageRef.current, railRef.current, ...cardRefs.current]) {
          if (!el) continue
          for (const prop of ['--mkt-ss', '--mkt-sy', '--mkt-io', '--mkt-iy', '--mkt-co', '--mkt-cy', '--mkt-ro']) {
            el.style.removeProperty(prop)
          }
        }
        railAt.current = -1
        delete root.dataset.active
      }
    }

    // rAF-coalesced: a scroll burst paints once per frame, never once per
    // event. `paint` is also the only writer, so there is no second path that
    // could disagree with it about where the reader is.
    const onScroll = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(paint)
    }

    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', sync)
    reduced.addEventListener('change', sync)
    fine.addEventListener('change', sync)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', sync)
      reduced.removeEventListener('change', sync)
      fine.removeEventListener('change', sync)
      root.classList.remove('is-cinematic')
    }
  }, [paint])

  return (
    <section ref={rootRef} className="mkt-spine relative" aria-labelledby="spine-title">
      <div ref={trackRef} className="mkt-spine-track" style={{ '--mkt-spine-steps': TRACK_STEPS } as React.CSSProperties}>
        <div className="mkt-spine-pin">
          {/* ── Step 1: the headline the product sits under. It has no link in
                 it on purpose — see note 3 at the top of this file. ── */}
          <div ref={introRef} className="mkt-spine-intro">
            <p className={`mb-3 text-teal-700 ${MONO_LABEL}`}>What it feels like</p>
            <h2
              id="spine-title"
              className="text-[1.85rem] font-bold leading-[1.08] tracking-[-0.02em] text-gray-950 sm:text-[2.4rem] lg:text-[3.1rem]"
            >
              A Tuesday that runs itself
              <br />
              is the whole product.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1rem] leading-relaxed text-gray-600">
              Keep scrolling. The screen below is the real thing, and four moments of an
              ordinary Tuesday happen on top of it.
            </p>
          </div>

          {/* ── The product. `aria-hidden` because it is an illustration and
                 the chapters carry every word of the meaning — and NOT in
                 `DECORATIVE_MOCKS`, so axe grades every pair inside it. ── */}
          <div ref={stageRef} className="mkt-spine-stage" aria-hidden="true">
            <CinemaStage />
          </div>

          {/* ── Step 3: the chapters. An ordered list because they are one,
                 and four stacked sections when the pin is off. ── */}
          <ol className="mkt-spine-cards">
            {CHAPTERS.map((c, i) => (
              <li
                key={c.n}
                ref={(el) => {
                  cardRefs.current[i] = el
                }}
                className="mkt-spine-card"
              >
                <div className="mkt-spine-card-glass">
                  <p className={`text-violet-700 ${MONO_LABEL}`}>
                    {c.n} · {c.eyebrow}
                  </p>
                  <h3 className="mt-4 text-[1.5rem] font-bold leading-[1.12] tracking-[-0.02em] text-gray-950 sm:text-[1.9rem]">
                    {c.title}
                  </h3>
                  <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* ── The chapter rail. A position indicator, not navigation: making
                 it clickable would be the one control on the page that fights
                 the reader's scroll position, which Part 6 names directly. It
                 is `aria-hidden` because every word in it is already in the
                 card eyebrow a screen reader just read — Part 5's "pass a
                 label ONLY when the glyph carries meaning the copy next to it
                 does not already say", pointed at an indicator.

                 Hand-graded because `aria-hidden` puts it outside axe's
                 contrast pass: gray-600 on white is 6.91 and teal-700 is 7.05
                 (`BRAND.md` Part 7), and the pill's own ground is white at
                 0.94 over the product rather than the product itself. ── */}
          <div ref={railRef} className="mkt-spine-rail" data-active="0" aria-hidden="true">
            <ol className="mkt-spine-rail-list" style={{ borderColor: DAY_WIRE }}>
              {CHAPTERS.map((c) => (
                <li key={c.n} className={`mkt-spine-rail-item ${MONO_LABEL}`}>
                  <span className="mkt-spine-rail-label">
                    {c.n} · {c.rail}
                  </span>
                  <span className="mkt-spine-rail-dot" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* ── Step 4: release. Ordinary page content again, and the only
             focusable thing the section owns. ── */}
      <div className="mx-auto max-w-6xl px-4 pb-4 pt-12 text-center sm:px-6 lg:pt-16">
        <a
          href="/why"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-800 transition-all hover:-translate-y-px hover:border-gray-400 hover:shadow-sm"
        >
          What this platform believes
        </a>
      </div>
    </section>
  )
}

/* ── The stage ───────────────────────────────────────────────────────────── */

const STAGE_CANVAS = '#F3F7FE'

/** The day, as the product actually shows it. Every number here is part of the
 *  mock rather than a claim in our own voice (`BRAND.md` Part 5), and
 *  `Riverbend`-style names are placeholders. */
const QUEUE: Array<{
  t: string
  name: string
  visit: string
  status: string
  tone: 'warn' | 'ok' | 'special'
  initials: string
}> = [
  { t: '09:30', name: 'Liam Brooks', visit: 'Checkup · 30 min', status: 'Needs a text', tone: 'warn', initials: 'LB' },
  { t: '10:00', name: 'Ana Reyes', visit: 'Hygiene · 45 min', status: 'Confirmed', tone: 'ok', initials: 'AR' },
  { t: '10:45', name: 'Jordan Tate', visit: 'New patient · 60 min', status: 'First visit', tone: 'special', initials: 'JT' },
  { t: '11:30', name: 'Mara Kline', visit: 'Crown seat · 60 min', status: 'Confirmed', tone: 'ok', initials: 'MK' },
  { t: '13:15', name: 'Priya Raman', visit: 'Whitening · 30 min', status: 'Needs a text', tone: 'warn', initials: 'PR' },
  { t: '14:15', name: 'Tom Okafor', visit: 'Filling · 45 min', status: 'Confirmed', tone: 'ok', initials: 'TO' },
]

/** Tone TINT plus that tone's DEEP ink — the shape `BRAND.md` Part 7 calls
 *  "Rule 5 and the tone tiles", which sits outside `TONE_FILL` by
 *  construction. Every pair measured against its own tint: amber 6.84,
 *  emerald 7.23, fuchsia 7.79. The one-step-shallower ink (`-700`) grades
 *  4.85 / 5.09 / 5.84 and would also pass — `-800` is the choice that keeps
 *  headroom on a surface no automated gate re-grades if the tint moves. */
const STAGE_TONE = {
  warn: 'bg-amber-50 text-amber-800',
  ok: 'bg-emerald-50 text-emerald-800',
  special: 'bg-fuchsia-50 text-fuchsia-800',
} as const

const KPIS: Array<{ label: string; value: string; delta: string }> = [
  { label: 'Chairs filled', value: '94%', delta: '+11 pts this month' },
  { label: 'Recalls recovered', value: '38', delta: '+$14,200 booked' },
  { label: 'Reviews this week', value: '4.9', delta: '+27 new' },
]

/** Eight weeks of chairs filled. Decorative bars, no text — heights are the
 *  data, so nothing in here needs grading. */
const BARS = [38, 44, 41, 58, 63, 57, 82, 94]

/**
 * THE CINEMA STAGE — the picture the chapters scroll over.
 *
 * WHY IT IS NOT DIMMED, which is the one place this build departs from the
 * approved storyboard. The storyboard shows the product washed pale behind the
 * glass, and that is a contrast crime on a light ground: veil a white surface
 * at 55% and `gray-950` ink lands near 3.1:1 at real product size. `BRAND.md`
 * Part 3 already has the right answer and it is better design anyway — "depth
 * is emission, not stacking": the card reads as raised because coloured light
 * spills out from under it, not because the layer below was damaged. So the
 * product stays crisp and legible and the glass does the work.
 *
 * WHY IT IS NOT IN `DECORATIVE_MOCKS` (`e2e/axe.ts`), which is the decision
 * that shaped every colour below. The two existing entries pardon the hero's
 * miniature mocks under WCAG 1.4.3 — text inside a picture, measured at 5.8 to
 * 8.2pt. This stage is the same product at FULL BLEED, so its type is real
 * reading size, and `exclusionsHidingReadableText` exists precisely to fail a
 * run that pardons that. Adding a third selector here would have been widening
 * the one mechanism in the harness that makes the gate looser, in order to
 * excuse text a person can read. So the stage is graded instead: every pair in
 * it is legal on its own ground, and `marketing: home` keeps its ceiling of
 * zero on the merits.
 *
 * It stays `aria-hidden` — it is an illustration, and the chapter cards carry
 * every word of the meaning. `aria-hidden` is not a contrast exemption and
 * never was: the hero's 41 pardoned findings are all inside `aria-hidden`
 * subtrees, which is the whole reason `DECORATIVE_MOCKS` had to name them.
 */
export function CinemaStage() {
  return (
    <div
      className="flex h-full w-full flex-col gap-3 overflow-hidden p-5 text-left sm:gap-4 sm:p-7 lg:p-9"
      style={{ backgroundColor: STAGE_CANVAS }}
    >
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className={`text-gray-600 ${MONO_LABEL}`}>DreamCRM · Today · Tuesday 15 September</p>
        <p className={`text-teal-700 ${MONO_LABEL}`}>Dream Dental · Premium</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
        {/* ── The queue ── */}
        <div
          className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-white p-4 shadow-[0_2px_6px_rgba(76,125,240,.06),0_14px_36px_rgba(76,125,240,.10)] lg:p-5"
          style={{ borderColor: DAY_WIRE }}
        >
          <p className="shrink-0 text-[1.05rem] font-bold tracking-[-0.01em] text-gray-950 lg:text-[1.2rem]">
            4 patients still need a text
          </p>
          <ul className="mt-3 min-h-0 flex-1 divide-y" style={{ borderColor: DAY_WIRE }}>
            {QUEUE.map((r, i) => (
              <li
                key={r.name}
                /* The tail of the day, and the time column, are hidden at 390:
                   with both in, the patient names truncated to "Liam Br..." and
                   the stacked frame ran past a screen. Part 10 — scale and
                   stacking change down the widths, identity does not. */
                className={`items-center gap-3 py-2.5 lg:gap-4 lg:py-3 ${i < 4 ? 'flex' : 'hidden sm:flex'}`}
              >
                <span className={`hidden w-12 shrink-0 text-gray-600 sm:block lg:w-14 ${MONO_LABEL}`}>
                  {r.t}
                </span>
                {/* Tint + deep ink again, rather than white on the brand blue:
                    white on `#4C7DF0` is 3.82 and would fail here at real
                    size. `#1F3D8F` on `#DCE7FD` is 7.96. */}
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold lg:h-9 lg:w-9"
                  style={{ backgroundColor: '#DCE7FD', color: '#1F3D8F' }}
                >
                  {r.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-semibold text-gray-950">
                    {r.name}
                  </span>
                  <span className="block truncate text-[0.82rem] text-gray-600">{r.visit}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-bold ${STAGE_TONE[r.tone]}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── The trend column ── */}
        <div className="hidden w-[15rem] shrink-0 flex-col gap-3 lg:flex xl:w-[17rem]">
          {KPIS.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border bg-white p-4 shadow-[0_2px_6px_rgba(76,125,240,.06)]"
              style={{ borderColor: DAY_WIRE }}
            >
              <p className={`text-gray-600 ${MONO_LABEL}`}>{k.label}</p>
              <p className="mt-1.5 text-[1.9rem] font-extrabold leading-none tracking-[-0.03em] text-gray-950">
                {k.value}
              </p>
              <p className="mt-1.5 text-[0.8rem] font-semibold text-emerald-800">{k.delta}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Eight weeks of chairs filled ── */}
      {/* `mkt-stage-chart` is load-bearing, not cosmetic: it is how the pinned
          sequence reserves the chapter rail's lane (see `SPINE_CSS` in
          `ui.tsx`). The bars give up their right end because they are the one
          part of this picture carrying no text. */}
      <div
        className="mkt-stage-chart hidden shrink-0 rounded-2xl border bg-white p-4 sm:block lg:p-5"
        style={{ borderColor: DAY_WIRE }}
      >
        <p className={`text-gray-600 ${MONO_LABEL}`}>Chairs filled · last 8 weeks</p>
        <div className="mt-3 flex h-16 items-end gap-2 lg:h-24 lg:gap-3">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-lg bg-gradient-to-t from-[#A8C0FF] to-[#6E5BF2]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
