import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import CinematicSpine, { CHAPTERS, OPEN, REST_T, frameZoom, pinnedCardFits, sceneAt } from '@/components/marketing/cinematic-spine'
import { CURSOR_STOPS, SCENE_COUNT } from '@/components/marketing/cinema-scenes'
import { BURSTS } from '@/components/marketing/cinema-fx'
import { MarketingMotionStyles } from '@/components/marketing/ui'

/**
 * THE CINEMATIC SPINE'S INVARIANTS — `BRAND.md` Part 6, DREAMCRM-70.
 *
 * Part 6 makes five things build-blocking, and three of them are structural
 * claims about the markup rather than about the animation. Those three are what
 * this file holds, because they are the ones that rot QUIETLY: the sequence
 * breaking is obvious the first time anyone scrolls the page, whereas an
 * invisible focus stop or a missing reduced-motion revert looks exactly like a
 * working homepage to whoever ships it.
 *
 * WHAT IS TESTED ELSEWHERE, so nobody mistakes this for the whole gate. The
 * scroll behaviour itself — one progress value, interruptible, the frame
 * reaching full bleed, one chapter at a time, the rail tracking, the release,
 * no horizontal scroll at 390/834/1440 — needs a real browser with a real
 * scroll position and was verified that way before merge. happy-dom has no
 * layout, so a test here that claimed to check any of it would be measuring
 * zeroes and reporting success.
 *
 * EVERY CASE BELOW WAS WATCHED FAIL against the defect it names (§2d): a link
 * dropped into a chapter card, the `aria-hidden` taken off the rail, a bare
 * `<span>02</span>` numeral added back, `is-cinematic` rendered on the server,
 * and each of the three media blocks deleted in turn.
 */

/** Every element in a subtree that a Tab key can land on. */
const focusables = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    ),
  )

describe('the cinematic spine — the stacked layout is what the server renders', () => {
  it('never ships the cinematic class in the server markup', () => {
    // `is-cinematic` is added by the CLIENT, and only where the pin is legal.
    // If it were ever rendered server-side, every reader whose JS never ran
    // would get a pinned section with nothing driving it: a five-viewport-tall
    // track, three chapter cards stuck at opacity 0, and no way to reach them.
    //
    // This has to read the SERVER output. `render()` from Testing Library runs
    // effects, and happy-dom answers `(hover: hover) and (pointer: fine)` with
    // `true` at its default 1024x768 — so the mounted DOM legitimately carries
    // the class, and asserting against that container would be asserting the
    // opposite of what this case is named for.
    expect(renderToStaticMarkup(<CinematicSpine />)).not.toContain('is-cinematic')
  })

  it('renders every chapter, in reading order', () => {
    const { container } = render(<CinematicSpine />)

    // "No content is reachable only by animating" (Part 6). The four chapters
    // are in the document, in reading order, at every scroll position — which
    // is the same thing as saying they are in the SSR markup.
    CHAPTERS.forEach((c, i) => {
      const heading = screen.getByRole('heading', { level: 3, name: new RegExp(escapeRe(plain(c.title)), 'i') })
      expect(heading).toBeTruthy()
      expect(screen.getByText(new RegExp(`${c.n}\\s*·\\s*${c.eyebrow}`, 'i'))).toBeTruthy()
      expect(screen.getByText(c.body)).toBeTruthy()
      // Reading order, not just presence.
      const cards = container.querySelectorAll('.mkt-spine-card')
      expect(cards[i].textContent).toContain(c.n)
    })
    expect(container.querySelectorAll('.mkt-spine-card')).toHaveLength(CHAPTERS.length)
    // The stage's scene table and the chapter table are two lists that have
    // to agree, and nothing but this asks.
    expect(CHAPTERS).toHaveLength(SCENE_COUNT)
  })

  it('names the section by its own headline', () => {
    const { container } = render(<CinematicSpine />)
    const root = container.querySelector('.mkt-spine')!
    const id = root.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(container.querySelector(`#${id}`)?.tagName).toBe('H2')
  })
})

describe('the cinematic spine — the pin cannot trap a keyboard or screen-reader user', () => {
  /**
   * Part 6: "The pin never traps a keyboard or screen-reader user. Tab order
   * moves through the chapters and out of the bottom... focus moving into a
   * chapter must not fight the scroll position."
   *
   * The implementation owes that structurally rather than by tuning: there is
   * NOTHING FOCUSABLE inside the pinned region, so there is no focus to move
   * in and nothing to fight. This is the assertion that keeps it true.
   *
   * The defect it is watching for is specific and easy to commit: a chapter
   * card spends most of the scroll at `opacity: 0`, so a "Learn more" link
   * added to one would be a focus stop a sighted keyboard user cannot see —
   * the classic invisible-focus bug, and one nothing else in this repo looks
   * for.
   */
  it('has no focus stop anywhere inside the pinned region', () => {
    const { container } = render(<CinematicSpine />)
    const pin = container.querySelector('.mkt-spine-pin') as HTMLElement
    expect(pin).toBeTruthy()
    expect(focusables(pin).map((n) => n.outerHTML.slice(0, 120))).toEqual([])
  })

  it('keeps the section-s one link outside the pin, as ordinary page content', () => {
    const { container } = render(<CinematicSpine />)
    const root = container.querySelector('.mkt-spine') as HTMLElement
    const links = focusables(root)
    // Exactly one, and it is after the track — the release block.
    expect(links).toHaveLength(1)
    expect(container.querySelector('.mkt-spine-track')!.contains(links[0])).toBe(false)
  })

  it('leaves the chapter rail out of the accessibility tree and out of the tab order', () => {
    const { container } = render(<CinematicSpine />)
    const rail = container.querySelector('.mkt-spine-rail') as HTMLElement
    // Every word in the rail is already in the card eyebrow a screen reader
    // just read, so announcing it twice is noise (BRAND.md Part 5). And a
    // CLICKABLE rail would be the one control on the page that fights the
    // reader's own scroll position, which Part 6 names directly.
    expect(rail.getAttribute('aria-hidden')).toBe('true')
    expect(focusables(rail)).toEqual([])
  })

  it('marks the product stage decorative, and does NOT hide it behind the DECORATIVE_MOCKS exemption', () => {
    const { container } = render(<CinematicSpine />)
    const stages = Array.from(container.querySelectorAll('.mkt-spine-stage'))
    // One scene per chapter since DREAMCRM-82, and EVERY one of them has to
    // carry the attribute — the four are written by one `.map`, so a check on
    // the first would pass on a fifth that was added by hand.
    expect(stages).toHaveLength(CHAPTERS.length)
    expect(stages.map((s) => s.getAttribute('aria-hidden'))).toEqual(CHAPTERS.map(() => 'true'))
    const stage = stages[0] as HTMLElement

    // THE LOAD-BEARING HALF. `DECORATIVE_MOCKS` in `e2e/axe.ts` pardons
    // `.mkt-float > [aria-hidden="true"]` under WCAG 1.4.3 — text inside a
    // picture, at the 5.8–8.2pt the hero's miniature mocks measure. This stage
    // is the same product at FULL BLEED, so its type is real reading size, and
    // `exclusionsHidingReadableText` exists to fail a run that pardons that.
    // So the stage is GRADED rather than exempted, and it must stay outside
    // those two selectors — wrapping it in a float wrapper later would silently
    // move a screenful of readable text inside a picture exemption.
    expect(stage.closest('.mkt-float')).toBeNull()
    expect(stage.closest('.mkt-float-slow')).toBeNull()
    expect(container.querySelector('.mkt-spine .mkt-float')).toBeNull()
    expect(container.querySelector('.mkt-spine .mkt-float-slow')).toBeNull()
  })
})

describe('the cinematic spine — the owner-s veto on oversized numerals', () => {
  /**
   * `BRAND.md` Part 4, owner veto on DREAMCRM-67, in his words: *"im not a fan
   * of the big transparent editorial '2' in the mockup."*
   *
   * The chapter number belongs in the eyebrow and the rail, at reading size,
   * where it is real text. The thing that was cut was a 210px outlined ghost of
   * it behind the card — decoration repeating something already legible, and
   * the one element in the set a screen reader had to be told to ignore.
   *
   * A bare number as an element's whole text content is exactly the shape that
   * comes back: nobody re-adds it as `<span>02 · THE TEXT</span>`, they re-add
   * it as `<span className="text-[210px]">02</span>`.
   */
  it('never renders a chapter number as an element of its own', () => {
    const { container } = render(<CinematicSpine />)
    const numbers = new Set(CHAPTERS.map((c) => c.n))
    const bare = Array.from(container.querySelectorAll('*'))
      .filter((el) => numbers.has((el.textContent ?? '').trim()))
      .map((el) => el.outerHTML.slice(0, 160))
    expect(bare).toEqual([])
  })

  it('carries each chapter number exactly twice — the card eyebrow and the rail', () => {
    const { container } = render(<CinematicSpine />)
    for (const c of CHAPTERS) {
      const inCard = container.querySelectorAll('.mkt-spine-card')
      const inRail = container.querySelector('.mkt-spine-rail')!
      expect(Array.from(inCard).filter((n) => (n.textContent ?? '').includes(`${c.n} · `))).toHaveLength(1)
      expect((inRail.textContent ?? '').includes(`${c.n} · `)).toBe(true)
    }
  })
})

describe('the cinematic spine — the pinned sequence exists only where the pin is legal', () => {
  /**
   * The component decides when to ADD `is-cinematic`; this gate decides
   * whether the class means anything. Both halves are deliberate: the JS half
   * is the one that can be wrong about the environment or fail to hear a
   * change, and the CSS half cannot.
   *
   * WHY A GATE AND NOT REVERTS. This shipped as three `@media` blocks that
   * undid `.is-cinematic` under reduced motion, a coarse pointer and anything
   * under `lg`, and this file asserted each of them contained `position:
   * static`, `height: auto`, `opacity: 1` and `transform: none`. All three
   * passed while leaving the layout wrong — the reverts never put back
   * `width`, `margin`, `pointer-events` or the rail's reserved lane — and
   * there was no fourth block for `print`, so printing the homepage produced
   * three pages of pinned section carrying none of its four chapters
   * (Vesper's DREAMCRM-70 review). A revert list is a copy of the thing it
   * reverts, and asserting four of its lines cannot tell you the copy is
   * complete.
   *
   * So there is nothing to revert and nothing to keep in sync: the pinned
   * declarations live inside ONE `@media` gate and do not exist outside it.
   * That is a property this file can actually check, which is the whole
   * reason for the shape.
   */
  const css = () => {
    const { container } = render(<MarketingMotionStyles />)
    return container.querySelector('style')!.textContent ?? ''
  }

  /** Every `@media` block in the stylesheet, prelude and body, brace-matched. */
  const mediaBlocks = (text: string): Array<{ prelude: string; body: string; whole: string }> => {
    const out: Array<{ prelude: string; body: string; whole: string }> = []
    let i = text.indexOf('@media')
    while (i !== -1) {
      const open = text.indexOf('{', i)
      let depth = 0
      for (let j = open; j < text.length; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') {
          depth--
          if (depth === 0) {
            out.push({
              prelude: text.slice(i + '@media'.length, open).trim(),
              body: text.slice(open + 1, j),
              whole: text.slice(i, j + 1),
            })
            break
          }
        }
      }
      i = text.indexOf('@media', i + 1)
    }
    return out
  }

  /** The one block the pinned sequence lives in. */
  const gate = (text: string) => {
    const found = mediaBlocks(text).filter((b) => b.body.includes('.mkt-spine.is-cinematic'))
    expect(found.map((b) => b.prelude), 'the pinned sequence must live in exactly one @media block').toHaveLength(1)
    return found[0]
  }

  it('puts the whole pinned sequence behind one gate, and that gate names every exclusion', () => {
    const { prelude } = gate(css())
    // Part 6: reduced motion gets a real layout. `no-preference` rather than
    // `not reduce`, because it also fails CLOSED on a browser that has never
    // heard of the feature.
    expect(prelude).toContain('prefers-reduced-motion: no-preference')
    // Part 10: "the pinned scroll does not pin on touch" — a pointer test, not
    // a width test, because a large tablet and a small laptop share widths and
    // do not share pointers.
    expect(prelude).toContain('hover: hover')
    expect(prelude).toContain('pointer: fine')
    // Below `lg`, phones and small tablets get the stacked reading order.
    expect(prelude).toContain('min-width: 1024px')
  })

  it('keeps the whole sequence out of print', () => {
    // Printing the homepage used to produce ~3 pages of a pinned section
    // carrying NONE of its four chapters: nothing reverted the effect for
    // print, so the pin stayed, the track stayed five screens tall, and every
    // card kept the `opacity: 0` the last scroll frame wrote. That is Part 6's
    // "no content is reachable only by animating" in a medium nobody thought
    // of. `screen` is what fixes it, and it is one word, so it is the one
    // most likely to be dropped by someone tidying the prelude.
    expect(gate(css()).prelude.startsWith('screen and ')).toBe(true)
  })

  it('leaves no pinned declaration outside that gate', () => {
    // The defect this watches for is the obvious next edit: someone adds "just
    // one more" `.is-cinematic` rule at the bottom of the stylesheet, outside
    // the gate, where it applies to print and to reduced motion and to phones.
    const text = css()
    const outside = text.replace(gate(text).whole, '')
    expect(outside).not.toContain('.mkt-spine.is-cinematic')
  })

  /**
   * THE PREMISE OF THIS SPINE'S ENTRY IN `tests/a11y/css-var-definitions.test.ts`.
   *
   * That guard exists because `var(--token)` on a token nothing defines makes
   * CSS drop the WHOLE declaration — invisibly. The spine's `--mkt-*` tokens are
   * written per frame by the client, so they are legitimately runtime-provided
   * and the guard carries a `--mkt-` exemption for them. But an exemption whose
   * reason nothing checks is the `deadExclusions` lesson pointed at a stylesheet:
   * the sentence would keep claiming these are safe long after someone added the
   * one that is not.
   *
   * So the reason is enforced here. Every reference carries its AT-REST value as
   * a fallback, which means a token nothing ever writes renders the resting frame
   * rather than dropping a transform — the difference between a homepage that
   * looks static and one whose chapter cards are invisible with no way to reach
   * them.
   */
  it('gives every scroll-driven token its at-rest value as a fallback', () => {
    const refs = Array.from(css().matchAll(/var\(\s*(--mkt-[A-Za-z0-9_-]+)([^)]*)\)/g))
    expect(refs.length).toBeGreaterThan(0)
    const withoutFallback = refs.filter(([, , rest]) => !rest.trim().startsWith(',')).map(([, t]) => t)
    expect(withoutFallback).toEqual([])
  })

  it('drives the whole sequence from transform and opacity only', () => {
    // BRAND.md Part 6: "Transform and opacity only." A scroll-linked `top`,
    // `height` or `margin` is a reflow on every frame and will not hold 60fps.
    const text = css()
    const spine = text.slice(text.indexOf('.mkt-spine-intro'))
    // DERIVED, not enumerated (DREAMCRM-82). This used to name the seven
    // tokens that existed when it was written, which is a COPY of the
    // component's token set and drifts the same way the three revert blocks
    // above did: `--mkt-so` arrived with the four-scene stage and the list did
    // not, so the one new scroll-driven declaration in the batch was graded by
    // nothing. Every `--mkt-` reference is now graded, minus the ONE layout
    // token named below with its reason.
    const LAYOUT_TOKENS = [
      // The track's length in viewport heights. Written ONCE, inline on the
      // element in JSX, from a constant — it is a layout dimension, not a
      // value the scroll position moves, so it is legitimately a `height`.
      '--mkt-spine-steps',
      // The frame fit (2026-09-22): the stage's zoom on a large monitor,
      // written by `sizeCanvas` on mount and resize — never by `paint` — so
      // `zoom` and the rail lane's `padding-right` reading it are layout
      // that happens a handful of times, not a reflow per frame.
      '--mkt-zoom',
    ]
    const scrollDriven = (spine.match(/[a-z-]+\s*:[^;{}]*var\(\s*--mkt-[^;{}]*;/g) ?? []).filter(
      (d) => !LAYOUT_TOKENS.some((t) => d.includes(t)),
    )
    expect(scrollDriven.length).toBeGreaterThan(0)
    // …and the exception still describes something, so it cannot quietly
    // become a blanket pardon for a token nobody looks at (§2b).
    expect(text).toContain(LAYOUT_TOKENS[0])
    for (const decl of scrollDriven) {
      // A `--mkt-*` DEFINITION paints nothing: it is how a beat on the stage
      // derives its own eased progress from the scene's `--mkt-t` in CSS
      // (`.mkt-k` in SPINE_CSS, 2026-09-22). What that progress is then SPENT
      // on is the next declaration down, and that one is graded as before.
      expect(decl.split(':')[0].trim()).toMatch(/^(transform|opacity|--mkt-[a-z0-9-]+)$/)
    }
  })
})

describe('the cinematic spine — it un-pins rather than clipping a chapter card', () => {
  /**
   * The pin is `overflow: hidden` and the card is centred in the viewport, so a
   * card taller than the window loses its top and its bottom with no scroll
   * that brings them back. Vesper's DREAMCRM-70 review found it at the
   * browser's own TEXT-SIZE setting — the low-vision one, not zoom: on a
   * 1024x640 window at a 32px base font the card measured 1,049px and lost the
   * chapter label and the last sentence, both unreachable.
   *
   * No media query reports a font size, so the height floor in the component
   * cannot answer this: the same window is fine at 16px and broken at 26px.
   * It has to be measured.
   *
   * THE FIX IS TO UN-PIN, NOT TO SCROLL THE CARD. `overflow-y: auto` on the
   * card would make it a scrollable region, which must be keyboard-operable,
   * which means `tabindex="0"` — putting the one focus stop back inside the
   * pinned region and undoing the clean answer the describe above holds at
   * zero. The stacked layout has no such problem.
   */
  it('refuses the pin when the tallest card cannot fit the window', () => {
    // A card exactly as tall as the window does not fit: it rides CARD_TRAVEL
    // either side of centre on its way in and out, so it needs that headroom
    // at BOTH ends or it is clipped for part of its own arrival.
    expect(pinnedCardFits(640, 640)).toBe(false)
    expect(pinnedCardFits(1049, 640)).toBe(false)
    expect(pinnedCardFits(400, 640)).toBe(true)
    // The headroom is real rather than nominal — a card within a hair of the
    // window height is still refused.
    expect(pinnedCardFits(639, 640)).toBe(false)
  })

  /**
   * WHAT IS MEASURED IS THE GLASS, not the `<li>` (DREAMCRM-82).
   *
   * Since the four-scene rebuild, each `<li>` is a full-viewport LAYER holding
   * a chapter's card and the picture it narrates, so under `.is-cinematic` its
   * own height is the viewport's — and measuring it would hand `pinnedCardFits`
   * `pinnedCardFits(vh, vh)`, which is false at every size. The pin would never
   * come on again, on any machine, and every case above would still be green
   * because happy-dom reports 0 for both.
   *
   * The glass is also the honest subject: it is the element `overflow: hidden`
   * clips when a card outgrows the window, which is the defect the function is
   * named for. This case is what pins the ref to it.
   */
  it('measures the chapter card itself, not the layer it sits in', () => {
    const { container } = render(<CinematicSpine />)
    const root = container.querySelector('.mkt-spine') as HTMLElement
    // A layer that fills the viewport, with a card comfortably inside it. If
    // the measurement moved back to the `<li>`, the pin would go off here.
    for (const li of Array.from(container.querySelectorAll('.mkt-spine-card'))) {
      Object.defineProperty(li, 'offsetHeight', { configurable: true, value: window.innerHeight })
    }
    for (const glass of Array.from(container.querySelectorAll('.mkt-spine-card-glass'))) {
      Object.defineProperty(glass, 'offsetHeight', { configurable: true, value: 300 })
    }
    window.dispatchEvent(new Event('resize'))
    expect(root.classList.contains('is-cinematic')).toBe(true)
  })

  /**
   * THE PREMISE OF THE CARD'S BOTTOM INSET (DREAMCRM-82).
   *
   * The card is anchored to the BOTTOM of the pin now, because centred its top
   * edge landed across the scene panel and cut a sentence in half. Bottom
   * anchoring puts `pinnedCardFits` and the stylesheet in a relationship they
   * did not have before: the function guarantees `height <= viewport - 2 *
   * CARD_TRAVEL`, so an inset of at most `2 * CARD_TRAVEL` cannot clip the
   * ARRIVED card at any window the pin is legal at.
   *
   * That is arithmetic somebody has to keep true, and the way it goes wrong is
   * a designer nudging the card up for air — `8vh` to `12vh`, or the ceiling to
   * `8rem` — with nothing anywhere saying what the ceiling was for. So it is
   * asserted, derived from `CARD_TRAVEL` rather than transcribed beside it.
   */
  it('keeps the card-s bottom inset inside the headroom pinnedCardFits guarantees', () => {
    const { container } = render(<MarketingMotionStyles />)
    const text = container.querySelector('style')!.textContent ?? ''
    const glass = text.slice(text.indexOf('.mkt-spine.is-cinematic .mkt-spine-card-glass'))
    // `CARD_TRAVEL`, read off the stylesheet rather than transcribed: the
    // fallback on `--mkt-cy` IS the at-rest travel, pinned as such by the
    // at-rest-fallback case above.
    const travel = Number(glass.match(/var\(--mkt-cy,\s*(\d+)\)/)![1])
    expect(travel).toBeGreaterThan(0)
    const inset = glass.match(/bottom:\s*clamp\(([^)]*)\)/)
    expect(inset, 'the card must be anchored to the bottom of the pin').toBeTruthy()
    const stops = inset![1].split(',').map((s) => s.trim())
    expect(stops).toHaveLength(3)
    // The ceiling, in px. `rem` is 16px on this site (no root font-size
    // override anywhere under `app/(marketing)`).
    const rem = Number(stops[2].replace('rem', ''))
    expect(Number.isFinite(rem)).toBe(true)
    expect(rem * 16).toBeLessThanOrEqual(travel * 2)
    // …and the floor leaves the card off the very edge of the window.
    expect(Number(stops[0].replace('rem', '')) * 16).toBeGreaterThanOrEqual(travel)
    // The viewport-relative middle stop cannot exceed the ceiling at any height
    // the pin is legal at, which is what makes the clamp's ceiling the bound
    // rather than a suggestion: it only bites above 1100px.
    const vh = Number(stops[1].replace('vh', ''))
    expect((vh / 100) * 1100).toBeGreaterThanOrEqual(rem * 16)
  })

  it('takes the pin back off when the cards outgrow the window', () => {
    const { container } = render(<CinematicSpine />)
    const root = container.querySelector('.mkt-spine') as HTMLElement
    // happy-dom has no layout, so every card measures 0 and the pin is live at
    // its default 1024x768 — see the note on the server-markup case above.
    expect(root.classList.contains('is-cinematic')).toBe(true)

    for (const card of Array.from(container.querySelectorAll('.mkt-spine-card-glass'))) {
      Object.defineProperty(card, 'offsetHeight', { configurable: true, value: window.innerHeight })
    }
    window.dispatchEvent(new Event('resize'))
    expect(root.classList.contains('is-cinematic')).toBe(false)

    // And it comes back when there is room again — the decision is a
    // measurement each time, not a latch that turns the section off for good.
    for (const card of Array.from(container.querySelectorAll('.mkt-spine-card-glass'))) {
      Object.defineProperty(card, 'offsetHeight', { configurable: true, value: 300 })
    }
    window.dispatchEvent(new Event('resize'))
    expect(root.classList.contains('is-cinematic')).toBe(true)
  })
})

describe('the cinematic spine — the background plays the journey the cards narrate', () => {
  /**
   * DREAMCRM-82, the owner on the built section: *"the cards discuss a
   * transition of a patient through the system, but the card in the background
   * should literally show that journey."*
   *
   * The stage used to be ONE illustration, identical at every scroll position,
   * while four cards narrated a patient moving through the product. What this
   * describe holds is the two structural halves of the fix — that there really
   * are four DIFFERENT pictures, and that they are in the stacked markup rather
   * than reachable only by animating.
   *
   * The cross-fade itself is scroll behaviour and is verified in a real browser
   * for the same reason as everything else in this file: happy-dom has no
   * layout, so a test here that claimed to check it would measure zeroes.
   */
  it('renders one scene per chapter, in the server markup, in reading order', () => {
    const html = renderToStaticMarkup(<CinematicSpine />)
    // Part 6's "no content is reachable only by animating", now including the
    // pictures: the stacked page a print / reduced-motion / no-JS reader gets
    // carries all four, not one screenshot repeated.
    expect(html.match(/mkt-spine-stage/g) ?? []).toHaveLength(CHAPTERS.length)

    const { container } = render(<CinematicSpine />)
    const cards = Array.from(container.querySelectorAll('.mkt-spine-card'))
    expect(cards).toHaveLength(CHAPTERS.length)
    for (const card of cards) {
      expect(card.querySelectorAll('.mkt-spine-stage')).toHaveLength(1)
    }
  })

  it('moves the anchor patient through her states, one per chapter', () => {
    const { container } = render(<CinematicSpine />)
    const scenes = Array.from(container.querySelectorAll('.mkt-spine-stage'))
    // Rosa Silva's row is the thread: she is in every scene and her STATUS is
    // the thing that changes. Since the living stage (2026-09-22) a scene in
    // which her pill CHANGES carries both halves of the swap — the old one
    // under `.mkt-out`, which the stacked stylesheet hides and the pinned one
    // fades on its beat — so what is asserted is the pill that is VISIBLE at
    // the scene's finished state, and that the hidden half is the previous
    // chapter's.
    const pills = ['6 mo overdue', 'Confirmed · Thu', 'Confirmed · Thu', 'Balance cleared', 'Review received', 'Review received']
    expect(scenes).toHaveLength(pills.length)
    scenes.forEach((scene, i) => {
      expect(scene.textContent).toContain('Rosa Silva')
      const visible = scene.cloneNode(true) as HTMLElement
      for (const out of Array.from(visible.querySelectorAll('.mkt-out'))) out.remove()
      expect(visible.textContent).toContain(pills[i])
      for (const other of Array.from(new Set(pills.filter((p) => p !== pills[i])))) {
        expect(visible.textContent).not.toContain(other)
      }
      const before = scene.querySelector('.mkt-anchor-row .mkt-out')
      if (before) expect(before.textContent).toBe(pills[i - 1])
    })
    // And it is a journey: at least four distinct states across the six.
    expect(new Set(pills).size).toBeGreaterThanOrEqual(4)
  })

  it('selects the scene from the same scroll position the rail reads', () => {
    // A rail reading "03 · THE BALANCE" over the review scene is the one way
    // this section can lie to a reader, and the way that happens is two
    // expressions computing the same index. There is one, and the component
    // calls it for both.
    const slot = (1 - OPEN) / CHAPTERS.length
    expect(sceneAt(0)).toBe(0)
    expect(sceneAt(-1)).toBe(0)
    expect(sceneAt(OPEN * 0.9)).toBe(0) // still inside the opening move
    expect(sceneAt(OPEN + slot * 0.5)).toBe(0)
    expect(sceneAt(OPEN + slot * 1.5)).toBe(1)
    expect(sceneAt(OPEN + slot * 2.5)).toBe(2)
    expect(sceneAt(OPEN + slot * (CHAPTERS.length - 0.5))).toBe(CHAPTERS.length - 1)
    expect(sceneAt(1)).toBe(CHAPTERS.length - 1)
    expect(sceneAt(9)).toBe(CHAPTERS.length - 1)
    // Monotonic: the picture never goes backwards while the reader goes
    // forwards, which a `%`-style expression would allow.
    let last = 0
    for (let p = 0; p <= 1; p += 0.01) {
      expect(sceneAt(p)).toBeGreaterThanOrEqual(last)
      last = sceneAt(p)
    }
  })

  it('adds no focus stop and no live region inside the scenes', () => {
    const { container } = render(<CinematicSpine />)
    for (const scene of Array.from(container.querySelectorAll('.mkt-spine-stage'))) {
      // The toggle in scene 04 and the button in scene 03 are ILLUSTRATION.
      // Drawn as `<span>`s on purpose: a real control here would be a focus
      // stop inside a layer that spends most of the scroll at opacity 0.
      expect(focusables(scene as HTMLElement)).toEqual([])
      expect(scene.querySelectorAll('button, input, a[href]')).toHaveLength(0)
    }
  })
})

/** A chapter title is JSX; this is its text, the way a reader hears it. */
function plain(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plain).join('')
  if (typeof node === 'object' && 'props' in (node as never)) {
    return plain((node as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('the cinematic spine — the frame fit', () => {
  it('leaves the laptop layout alone and grows with the smaller of width and height, capped', () => {
    expect(frameZoom(1440, 900)).toBe(1)
    expect(frameZoom(1024, 760)).toBe(1) // never shrinks below the design size
    expect(frameZoom(2560, 1440)).toBeCloseTo(1.6, 5) // height-bound, not width-bound
    expect(frameZoom(3440, 1440)).toBeCloseTo(1.6, 5) // an ultrawide is not a taller scene
    expect(frameZoom(3840, 2160)).toBe(1.8)
  })
})

describe('the cinematic spine — the resting frame is a full app', () => {
  /**
   * Pass 2 of the living stage (2026-09-22). The stage is on screen BEFORE
   * the visitor scrolls, under the headline, and with chapter 1's progress at
   * zero that frame showed empty panels and a bare ledger: an app with
   * nothing in it, as the first thing the section says. Chapter 1 now reads a
   * floor (`REST_T`), so its opening beats are simply already there.
   */
  it('finishes chapter 1-s opening beats inside the floor, and starts every event after it', () => {
    expect(REST_T).toBeGreaterThan(0)
    expect(REST_T).toBeLessThan(0.5)
    const { container } = render(<CinematicSpine />)
    const first = container.querySelector('.mkt-spine-stage') as HTMLElement
    const beats = Array.from(first.querySelectorAll('.mkt-k')) as HTMLElement[]
    const done = beats.filter((el) => {
      const b = Number(el.style.getPropertyValue('--mkt-b'))
      const d = Number(el.style.getPropertyValue('--mkt-d') || 0)
      return !el.classList.contains('mkt-out') && b + d <= REST_T
    })
    // The queue rows, the KPI strip and the ledger's first line: a real screen.
    expect(done.length).toBeGreaterThanOrEqual(8)
    // And nothing the visitor should SEE happen is skipped by the pre-roll:
    // every burst and every cursor stop in chapter 1 fires after the floor.
    for (const b of BURSTS.filter((x) => x.scene === 0)) expect(b.at).toBeGreaterThan(REST_T)
    for (const stop of CURSOR_STOPS[0] ?? []) expect(stop.at).toBeGreaterThan(REST_T)
  })
})
