import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import CinematicSpine, { CHAPTERS } from '@/components/marketing/cinematic-spine'
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

  it('renders all four chapters, in reading order', () => {
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
    expect(container.querySelectorAll('.mkt-spine-card')).toHaveLength(4)
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
    const stage = container.querySelector('.mkt-spine-stage') as HTMLElement
    expect(stage.getAttribute('aria-hidden')).toBe('true')

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

describe('the cinematic spine — the CSS reverts the pin where the pin is illegal', () => {
  /**
   * The component decides when to ADD `is-cinematic`; these three media blocks
   * take the pin back out even when it is present. Both halves are deliberate:
   * the JS half is the one that can be wrong about the environment or fail to
   * hear a change, and the CSS half cannot.
   *
   * Each condition is one of Part 6's / Part 10's own words — reduced motion
   * gets a real layout, the sequence "does not pin on touch", and below `lg`
   * phones and small tablets get the stacked reading order.
   */
  const css = () => {
    const { container } = render(<MarketingMotionStyles />)
    return container.querySelector('style')!.textContent ?? ''
  }

  /**
   * The `@media` block whose condition contains `needle` AND which is the one
   * about the spine.
   *
   * Both halves matter: there are TWO `prefers-reduced-motion` blocks in this
   * stylesheet — the older one that stops the ambient loops, and the spine's,
   * which puts a layout back — and a helper that returned the first match
   * would have this whole describe passing against the wrong block.
   */
  const block = (text: string, needle: string): string => {
    let i = text.indexOf('@media')
    while (i !== -1) {
      const open = text.indexOf('{', i)
      if (text.slice(i, open).includes(needle)) {
        let depth = 0
        for (let j = open; j < text.length; j++) {
          if (text[j] === '{') depth++
          else if (text[j] === '}') {
            depth--
            if (depth === 0) {
              const found = text.slice(i, j + 1)
              if (found.includes('.mkt-spine')) return found
              break
            }
          }
        }
      }
      i = text.indexOf('@media', i + 1)
    }
    return ''
  }

  for (const [label, needle] of [
    ['prefers-reduced-motion', 'prefers-reduced-motion: reduce'],
    ['a coarse pointer (touch)', 'pointer: coarse'],
    ['viewports under lg', 'max-width: 1023px'],
  ] as const) {
    it(`puts the stacked layout back under ${label}`, () => {
      const b = block(css(), needle)
      expect(b, `no @media block for ${needle}`).not.toBe('')
      expect(b).toContain('.mkt-spine.is-cinematic .mkt-spine-pin')
      expect(b).toContain('position: static')
      // The track must stop being five viewports tall, or the section leaves a
      // screenful of blank space behind it.
      expect(b).toContain('.mkt-spine.is-cinematic .mkt-spine-track { height: auto; }')
      // And the chapter cards must come back to opacity 1 — a card left at
      // `opacity: var(--mkt-co, 0)` with nothing writing the property is
      // content that exists and cannot be read.
      expect(b).toContain('opacity: 1')
      expect(b).toContain('transform: none')
    })
  }

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
    const scrollDriven = spine.match(/[a-z-]+:[^;]*var\(--mkt-(?:ss|sy|io|iy|co|cy|ro)[^;]*;/g) ?? []
    expect(scrollDriven.length).toBeGreaterThan(0)
    for (const decl of scrollDriven) {
      expect(decl.split(':')[0].trim()).toMatch(/^(transform|opacity)$/)
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
