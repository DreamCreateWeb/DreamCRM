'use client'

import { useCallback, useEffect, useRef } from 'react'
import { MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'
import { CinemaStage } from '@/components/marketing/cinema-scenes'

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
 *    cannot see. `CinemaStage` (`components/marketing/cinema-scenes.tsx`) is a
 *    product illustration at REAL product scale, and every ink/surface pair in
 *    it is legal on its own ground — deliberately, because it is NOT in
 *    `DECORATIVE_MOCKS` (`e2e/axe.ts`) and must pass the homepage's ceiling of
 *    zero on its own merits. See its own note for why it is not dimmed.
 *
 * 5. THE PICTURE PLAYS THE JOURNEY THE CARDS NARRATE (DREAMCRM-82). The stage
 *    is a FOUR-STATE illustration selected by `sceneAt(p)` — the same single
 *    normalised scroll position that drives every transform above, so there is
 *    still no second listener, no timer and no state to unwind. One patient,
 *    Rosa Silva, carried through four scenes with her queue row as the anchor.
 *
 *    THE STACKED LAYOUT GETS ALL FOUR AS STATIC PICTURES, in reading order,
 *    because each scene lives inside its own chapter's `<li>` rather than in a
 *    separate stage element. That is why this is a structural change and not a
 *    class toggle: reduced-motion, narrow, no-JS and PRINT readers get the four
 *    pictures the sighted sequence gets, each beneath the chapter it belongs
 *    to, instead of one generic screenshot repeated. Under `.is-cinematic` the
 *    four `<li>`s become four full-viewport layers stacked in chapter order.
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

/**
 * WHICH SCENE THE STAGE PLAYS at normalised scroll position `p`.
 *
 * The same expression the chapter rail uses for its active index, extracted so
 * the picture and the indicator cannot drift apart: a rail reading "03 · THE
 * BALANCE" over the review scene is the one way this section can lie. Pure, so
 * the scene is a function of the one scroll position rather than a fifth piece
 * of state (Part 6 forbids "a chain of listeners" and "a queue").
 */
export function sceneAt(p: number): number {
  const slot = (1 - OPEN) / CHAPTERS.length
  return Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor((p - OPEN) / slot)))
}

export default function CinematicSpine() {
  const rootRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const introRef = useRef<HTMLDivElement | null>(null)
  /** The `<ol>`. It carries the opening move's scale and shift as INHERITED
   *  custom properties, so all four scene layers grow together off one write
   *  per frame rather than four. */
  const stagesRef = useRef<HTMLOListElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  /** The four scene layers, and the four glass cards. `cardRefs` points at the
   *  GLASS rather than at the `<li>`, because under `.is-cinematic` the `<li>`
   *  is a full-viewport layer and the glass is the thing `pinnedCardFits` is
   *  about — the element that gets clipped when it outgrows the window. */
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([])
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
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
    const stages = stagesRef.current
    if (stages) {
      stages.style.setProperty('--mkt-ss', String(REST_SCALE + (1 - REST_SCALE) * open))
      stages.style.setProperty('--mkt-sy', String(REST_SHIFT_VH * (1 - open)))
    }
    const intro = introRef.current
    if (intro) {
      intro.style.setProperty('--mkt-io', String(1 - clamp01(p / (OPEN * 0.85))))
      intro.style.setProperty('--mkt-iy', String(-18 * open))
    }

    // ── The chapters: one screen each, over the pinned product.
    const slot = (1 - OPEN) / CHAPTERS.length
    for (let i = 0; i < CHAPTERS.length; i++) {
      // Local progress through THIS chapter's slot: <0 before it, >1 after.
      const t = (p - OPEN - i * slot) / slot

      // ── THE SCENE BEHIND THIS CHAPTER. It rises to 1 on the chapter's own
      //    arrival and STAYS there: every scene paints its own opaque canvas,
      //    so the next one fades in ON TOP rather than the two cross-fading
      //    into the ground beneath them — which is what a symmetric fade would
      //    do, washing both pictures out for a quarter of every chapter.
      //    Monotonic and still a pure function of `p`, so reversing the wheel
      //    walks it back down the same curve with nothing to unwind.
      //
      //    Scene 0 is the base and never fades: it is the picture the opening
      //    move grows to full bleed, before any chapter has arrived.
      const scene = sceneRefs.current[i]
      if (scene) {
        scene.style.setProperty(
          '--mkt-so',
          String(i === 0 ? 1 : t <= 0 ? 0 : t < 0.26 ? easeOut(t / 0.26) : 1),
        )
      }

      const card = cardRefs.current[i]
      if (!card) continue
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
      const at = sceneAt(p)
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
     *
     * IT WENT 620 → 760 ON DREAMCRM-82, and that sentence above is why rather
     * than a second opinion. The floor was set when the stage was one frozen
     * screenshot whose queue panel stretched to full height, so the card
     * covered blank white and nothing was lost at 620. The four-scene stage
     * sizes every panel to its content and puts the chapter's own picture in
     * the upper band, and the card now sits under it — so the number this
     * judgement is about has an arithmetic answer: header and padding (~70px)
     * plus the tallest scene's panels (~355px) plus the card (~285px at the
     * default font size) plus its bottom inset. Under ~760 the card's top edge
     * lands back across the scene panel and cuts a sentence, which is the
     * exact failure "reads as broken rather than cinematic" names.
     *
     * The cost is stated rather than glossed: a 1366x768 laptop is now on the
     * stacked layout. That layout is four chapters each with its own picture in
     * reading order — since DREAMCRM-82 a genuinely good page rather than a
     * consolation, which is what makes raising the floor the cheap answer here
     * instead of trimming panels at short heights.
     */
    const legal = () =>
      !reduced.matches && fine.matches && window.innerWidth >= 1024 && window.innerHeight >= 760

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
        for (const el of [
          introRef.current,
          stagesRef.current,
          railRef.current,
          ...sceneRefs.current,
          ...cardRefs.current,
        ]) {
          if (!el) continue
          for (const prop of ['--mkt-ss', '--mkt-sy', '--mkt-io', '--mkt-iy', '--mkt-so', '--mkt-co', '--mkt-cy', '--mkt-ro']) {
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

          {/* ── Step 3: the chapters, each one a card AND the picture it
                 narrates. An ordered list because they are one.

                 Stacked (the base): four sections top to bottom, each a card
                 followed by its own scene — so the reduced-motion, narrow,
                 no-JS and print readers get FOUR pictures in reading order
                 rather than one screenshot repeated, which is a content
                 improvement for them and not a fallback.

                 Pinned: each `<li>` becomes a full-viewport layer holding its
                 scene and its card, stacked in chapter order. That is what
                 lets one DOM serve both without a second copy of the stage.

                 Each scene is `aria-hidden` because it is an illustration and
                 the card above it carries every word of the meaning — and NOT
                 in `DECORATIVE_MOCKS`, so axe grades every pair inside it. ── */}
          <ol ref={stagesRef} className="mkt-spine-cards">
            {CHAPTERS.map((c, i) => (
              <li key={c.n} className="mkt-spine-card">
                <div
                  ref={(el) => {
                    cardRefs.current[i] = el
                  }}
                  className="mkt-spine-card-glass"
                >
                  <p className={`text-violet-700 ${MONO_LABEL}`}>
                    {c.n} · {c.eyebrow}
                  </p>
                  <h3 className="mt-4 text-[1.5rem] font-bold leading-[1.12] tracking-[-0.02em] text-gray-950 sm:text-[1.9rem]">
                    {c.title}
                  </h3>
                  <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">{c.body}</p>
                </div>
                <div
                  ref={(el) => {
                    sceneRefs.current[i] = el
                  }}
                  className="mkt-spine-stage"
                  aria-hidden="true"
                >
                  <CinemaStage scene={i} />
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
