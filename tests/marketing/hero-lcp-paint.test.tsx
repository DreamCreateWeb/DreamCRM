import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * THE HERO'S LCP TEXT IS PAINTED FROM THE FIRST FRAME — `BRAND.md` Part 6.
 *
 * THE DEFECT THIS EXISTS FOR, measured rather than suspected. DREAMCRM-101's
 * mobile-weight run (`docs/MOBILE-WEIGHT.md`, production, 412x823 / DPR 1.75 /
 * CPU 4x / Slow 4G) put the homepage's Largest Contentful Paint at **3,424ms**
 * against **2,472ms** on the identical page under `prefers-reduced-motion:
 * reduce`. The whole ~950ms was one CSS declaration: `.mkt-enter { opacity: 0 }`
 * plus `.mkt-d2`'s 0.16s delay and a 0.65s fade held the hero sentence
 * unpaintable for ~0.81s. Worse, the metric was not even measuring the copy on
 * every run — a decorative `background-image` IS an LCP candidate, so with the
 * real text at `opacity: 0` the winner sometimes flipped to `DaylightSky`'s
 * aria-hidden film-grain layer.
 *
 * WHY IT IS THIS SHAPE AND NOT A GREP. `expect(source).not.toContain('mkt-enter')`
 * would pass the day someone writes a THIRD entrance class that also starts at
 * zero, and it cannot see which element the class lands on — the eyebrow, the
 * buttons and the mock are all still supposed to fade. So this derives the
 * banned set from the CSS itself: render `MarketingMotionStyles`, read every
 * rule that puts an element at `opacity: 0`, and check the rendered hero's LCP
 * candidates against it. A future class named anything at all is covered on the
 * day it is written, and renaming `mkt-rise` breaks nothing.
 *
 * WHAT COUNTS AS AN LCP CANDIDATE HERE: the hero `<h1>` and the paragraph that
 * follows it. Those are the two largest text blocks in the viewport on a phone
 * and they are what the measurement identified. Deliberately NOT every element
 * in the hero — a guard that demanded the whole stagger paint at frame 0 would
 * be asking for the entrance animation to be deleted, which is not the finding.
 *
 * ── WATCHED TO FAIL (§2d) ────────────────────────────────────────────────
 *
 * Against the real defect in its real spelling, not a synthetic one: putting
 * `mkt-enter` back on `app/(marketing)/page.tsx`'s `<h1>` and `<p>` (the bytes
 * that shipped) reddens `the homepage hero's LCP text is not held at opacity
 * 0` naming `mkt-enter`; the same edit to `PageHero` reddens the subpage test.
 * The READER was mutated too, because a guard whose eyes are empty passes
 * everything: forcing `classesHeldInvisible` to return an empty Set reddens
 * `the motion sheet still holds something invisible` below rather than passing
 * silently, and that test is the reason a future rewrite of the stylesheet
 * cannot quietly blind this file.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE: an `opacity: 0` arriving from a Tailwind
 * utility (`opacity-0`) or an inline `style`. The defect lives in this one
 * hand-written `<style>` block — the site ships no other entrance CSS — and a
 * resolver for the whole utility layer is the "208 places to catch 8" trade.
 */

vi.mock('@/lib/auth/context', () => ({ getTenantContext: vi.fn(async () => null) }))
vi.mock('@/lib/session', () => ({ getServerSession: vi.fn(async () => null) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import MarketingHome from '@/app/(marketing)/page'
import { MarketingMotionStyles, PageHero } from '@/components/marketing/ui'

/** The stylesheet the marketing layout renders once, as text. */
function motionCss(): string {
  const { container } = render(<MarketingMotionStyles />)
  const css = container.querySelector('style')?.textContent ?? ''
  expect(css.length, 'MarketingMotionStyles rendered no CSS').toBeGreaterThan(200)
  return css
}

/**
 * Every class selector in the sheet whose own rule body sets `opacity: 0`.
 *
 * Only top-level rules are read: the `@media (prefers-reduced-motion: reduce)`
 * block is where `.mkt-enter` is handed `opacity: 1` back, and folding that in
 * would say the class is safe because SOME readers escape it. The default path
 * is the one the measurement was taken on.
 */
function classesHeldInvisible(css: string): Set<string> {
  // Drop @-blocks (keyframes, media) so their inner rules are not mistaken for
  // top-level ones. Balanced-brace scan rather than a regex, because both
  // nest one level.
  let flat = ''
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '@') {
      let depth = 0
      let seen = false
      for (; i < css.length; i++) {
        if (css[i] === '{') {
          depth++
          seen = true
        } else if (css[i] === '}') {
          depth--
          if (seen && depth === 0) break
        }
      }
      continue
    }
    flat += css[i]
  }

  const held = new Set<string>()
  for (const m of Array.from(flat.matchAll(/([^{}]+)\{([^{}]*)\}/g))) {
    const [, selectors, body] = m
    if (!/opacity\s*:\s*0(\s*;|\s*$)/.test(body)) continue
    for (const sel of selectors.split(',')) {
      for (const cls of Array.from(sel.matchAll(/\.([A-Za-z0-9_-]+)/g))) held.add(cls[1])
    }
  }
  return held
}

/** The h1, and the paragraph that follows it — the hero's LCP candidates. */
function lcpTextOf(container: HTMLElement): HTMLElement[] {
  const h1 = container.querySelector('h1')
  expect(h1, 'no <h1> rendered — the hero did not come up').toBeTruthy()
  const sub = h1!.parentElement?.querySelector('p:not(:has(*))') ?? null
  // The sentence under the headline is the first <p> AFTER it in the reading
  // column. Walked rather than selected by class, so the guard does not depend
  // on the spelling it is checking.
  let next: Element | null = h1!.nextElementSibling
  while (next && next.tagName !== 'P') next = next.nextElementSibling
  const out: HTMLElement[] = [h1 as HTMLElement]
  if (next) out.push(next as HTMLElement)
  else if (sub) out.push(sub as HTMLElement)
  expect(out.length, 'the hero sentence under the headline was not found').toBe(2)
  return out
}

describe('BRAND.md Part 6 — the hero LCP text paints at frame 0', () => {
  it('the motion sheet still holds something invisible', () => {
    // The field-of-view assertion. If this set is ever empty the two tests
    // below become vacuous and would pass against the exact defect they exist
    // for — `.mkt-enter` is the thing they are reading, and it is still there
    // doing its job on the eyebrow, the buttons, the trust row and the mock.
    const held = classesHeldInvisible(motionCss())
    expect(held.size, 'no class in the motion sheet sets opacity: 0 any more').toBeGreaterThan(0)
    expect(held, 'the entrance fade is the class this guard reads').toContain('mkt-enter')
  })

  it("the homepage hero's LCP text is not held at opacity 0", async () => {
    const held = classesHeldInvisible(motionCss())
    const { container } = render(await MarketingHome())
    for (const el of lcpTextOf(container)) {
      const offenders = Array.from(el.classList).filter((c) => held.has(c))
      expect(
        offenders,
        `<${el.tagName.toLowerCase()}> "${el.textContent?.slice(0, 40)}…" is held unpaintable by ${offenders.join(' ')}`,
      ).toEqual([])
    }
  })

  it("a subpage hero's LCP text is not held at opacity 0 either", () => {
    // Fifteen call sites across eight pages inherit `PageHero`, so the fix is
    // worth nothing if it only reached the homepage's hand-built hero.
    const held = classesHeldInvisible(motionCss())
    const { container } = render(
      <PageHero eyebrow="Eyebrow" title="A subpage headline" sub="The sentence under it." />,
    )
    for (const el of lcpTextOf(container)) {
      const offenders = Array.from(el.classList).filter((c) => held.has(c))
      expect(
        offenders,
        `PageHero's <${el.tagName.toLowerCase()}> is held unpaintable by ${offenders.join(' ')}`,
      ).toEqual([])
    }
  })

  it('the rise animation never animates opacity, and reduced motion switches it off', () => {
    const css = motionCss()

    // Whatever the LCP text's entrance class is called, it must not have grown
    // an opacity ramp back: a keyframe from `opacity: 0` is the same defect
    // wearing a different selector.
    const rise = /@keyframes\s+mkt-rise\s*\{([^]*?)\}\s*\n/.exec(css)
    expect(rise, '@keyframes mkt-rise is gone').toBeTruthy()
    expect(rise![1], 'the rise animates opacity — that is the defect again').not.toMatch(/opacity/)

    // Part 6 is non-negotiable on this: `both` fill means the element sits 14px
    // low through the delay, so without an override a reduced-motion reader
    // gets travel they asked not to have.
    const reduce = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^]*?)\n\s*\}/.exec(css)
    expect(reduce, 'the reduced-motion block is gone').toBeTruthy()
    expect(reduce![1]).toMatch(/\.mkt-rise\s*\{[^}]*animation:\s*none/)
  })
})
