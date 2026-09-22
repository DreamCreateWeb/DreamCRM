import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * THE MARKETING SITE IS LIGHT IN BOTH THEMES, AND A `dark:` CLASS REACHING IT
 * IS A DEFECT — `docs/RELEASE.md` Part 5, "the Dream Create wordmark is
 * invisible to every dark-OS visitor".
 *
 * THE DEFECT THIS EXISTS FOR. `app/(marketing)/layout.tsx` hard-codes
 * `bg-white text-gray-950` and carries no `dark:` class anywhere under it, but
 * `next-themes` still puts `.dark` on `<html>` from the OS preference. So a
 * `dark:` half on anything rendered here fires on a ground that never went
 * dark. The shared company lockup carried
 * `text-[--brand-ink,#22304E] dark:text-white`, and on `/why` at 1440 a
 * dark-OS visitor measured **1.00** — white on white, the words gone from
 * every page while the bubble MARK (its own gradient fill) kept painting.
 *
 * WHY THE EXISTING GUARDS DECLINED, which is the transferable part and the
 * reason this grades a RENDER rather than a directory:
 *
 *   - `tests/a11y/dark-mode-parity.test.ts` exists for exactly this shape — a
 *     `dark:text-*` with no `dark:bg-*` beside it — and returned null here
 *     because the LIGHT half is `text-[--brand-ink,#22304E]`, an arbitrary
 *     CSS-var value rather than a `text-<ramp>-<step>` its resolver can grade.
 *   - **Every source scanner in this repo is keyed on a PATH.** `dark:` has a
 *     count of ZERO across `app/(marketing)` and `components/marketing`
 *     already, and it always did — the offending class was in
 *     `components/brand/`, where it is CORRECT for the partner shell, the auth
 *     shell and the dashboard chrome, all of which really are theme-aware. A
 *     rule that banned `dark:` in the marketing directories would have been
 *     green the entire time, and one that banned it in `components/brand/`
 *     would be wrong.
 *
 * SO THE SUBJECT IS THE COMPOSITION, NOT THE FILE. This renders the chrome a
 * visitor actually meets and walks the produced DOM for a `dark:` variant in
 * any `class` attribute. A shared component leaking a dark half into this lane
 * fails here whatever file it lives in, which is the one question the path
 * scanners structurally cannot ask.
 *
 * WATCHED TO FAIL (§2d) against the real defect in its real shape: removing
 * `alwaysLightGround` from `components/marketing/chrome.tsx` — restoring the
 * shipped spelling, not a synthetic one — reddens
 * `the marketing header renders no dark: variant` naming
 * `dark:text-white` on the wordmark `<span>`. Restored and re-run green. The
 * walker was mutated too: forcing `darkVariantsIn` to return `[]` reddens the
 * field-of-view test below rather than passing silently.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE, so a green run is not mistaken for proof:
 *
 *   - **A dark rendering assembled outside `className`** — a style object, a
 *     `<style>` block, a class arriving from a stylesheet. This reads the
 *     attribute, the same false-negative direction every scanner here takes.
 *   - **The page BODIES.** The chrome is what a shared component enters this
 *     lane through; a page author writing `dark:` in `app/(marketing)` is
 *     visible to an ordinary grep and has never happened. Widening to the
 *     pages means rendering nine of them for a class that is already at zero
 *     by directory, which is the "208 places to catch 8" trade.
 *   - **A `dark:` that happens to be harmless.** `MarketingFooter` sits on a
 *     dark band in both themes and is exempted BY NAME below, with its premise
 *     asserted rather than assumed — the ground it names has to still be there.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

import { MarketingHeader } from '@/components/marketing/chrome'
import { MarketingFooter, PageHero } from '@/components/marketing/ui'

/** Every `dark:` variant in every `class` attribute of a rendered subtree. */
export function darkVariantsIn(root: Element): string[] {
  const hits: string[] = []
  const walk = (el: Element) => {
    for (const cls of Array.from(el.classList)) {
      if (cls.startsWith('dark:')) hits.push(`${el.tagName.toLowerCase()} — ${cls}`)
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
  return hits
}

const WHY =
  'app/(marketing)/layout.tsx forces a light page (bg-white text-gray-950, no ' +
  'dark: class under it) while next-themes still puts .dark on <html> from the ' +
  'OS preference — so a dark: half here fires on a ground that never goes dark. ' +
  'That is how the company wordmark rendered white on white (1.00) on every ' +
  'page of this site. Scope the override at the marketing call site; do not ' +
  'change the shared default, which is correct on the theme-aware surfaces.'

describe('nothing in the forced-light marketing chrome carries a dark: variant', () => {
  it('the marketing header renders no dark: variant', () => {
    const { container } = render(<MarketingHeader />)
    expect(darkVariantsIn(container), WHY).toEqual([])
  })

  it('PageHero — the opener every subpage inherits — renders no dark: variant', () => {
    const { container } = render(
      <PageHero eyebrow="Eyebrow" title="Title" sub="Sub" />,
    )
    expect(darkVariantsIn(container), WHY).toEqual([])
  })

  /**
   * THE FOOTER IS THE ONE EXEMPTION, AND ITS PREMISE IS ASSERTED RATHER THAN
   * ASSUMED. It is a dark band inside a light page in both themes, so a
   * `dark:` half there is harmless by construction — but only while the band
   * is still dark. `exclusionsHidingReadableText`'s lesson in `e2e/axe.ts`
   * applies: a dead-exemption check asks whether the subject still matches,
   * never whether the REASON still holds. So this asserts the GROUND.
   */
  it('the footer is exempt because it is a dark band — and it still is one', () => {
    const { container } = render(<MarketingFooter />)
    const footer = container.querySelector('footer')
    expect(footer, 'MarketingFooter no longer renders a <footer>').not.toBeNull()
    expect(
      Array.from(footer!.classList).some((c) => /^bg-gray-9\d0$/.test(c)),
      'the footer exemption rests on the band being DARK in both themes. It is ' +
        'no longer bg-gray-9x0, so either re-measure and re-word this exemption ' +
        'or delete it and grade the footer like the rest of the chrome.',
    ).toBe(true)
  })

  it('the walker actually finds a dark: variant, and ignores everything else', () => {
    // The field of view, on a fixture — a guard whose scanner cannot see the
    // defect reports CLEAN forever.
    const { container } = render(
      <div className="text-gray-950 bg-white">
        <span className="text-[--brand-ink,#22304E] dark:text-white">ream Create</span>
        <em className="hover:text-teal-700">not a theme variant</em>
      </div>,
    )
    expect(darkVariantsIn(container)).toEqual(['span — dark:text-white'])
  })
})
