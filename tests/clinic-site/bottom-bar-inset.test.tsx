import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, cleanup, screen } from '@testing-library/react'
import BottomBarInset from '@/components/clinic-site/bottom-bar-inset'
import SiteChatWidget from '@/components/clinic-site/site-chat-widget'
import { BOTTOM_BAR_ATTR, BOTTOM_BAR_VAR, bottomBarOffset } from '@/lib/site-bottom-bar'

/**
 * THE BOTTOM BAR INSET (2026-10-12). Three templates pin a full-width Call /
 * Book bar to the phone's bottom edge, and the chat bubble (and Cherry's
 * button) float in the bottom-left corner on every template — they were
 * sitting ON the bars. The bars carry `data-site-bottom-bar`, the layout
 * measures them into `--site-bottom-bar`, and every floater adds it to its
 * own bottom. This pins the three halves: the bars are tagged, the floaters
 * read the variable, and the measurer writes it from the bar's box.
 */

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty(BOTTOM_BAR_VAR)
})

describe('the bottom bar inset', () => {
  it('every full-width bottom bar is tagged, and the right-aligned pairs are not', () => {
    for (const t of ['cosmetic', 'hometown', 'pediatric']) {
      const src = readFileSync(`components/clinic-site/templates/${t}/mobile-actions.tsx`, 'utf8')
      expect(src, `${t}'s bar spans the bottom edge and must carry ${BOTTOM_BAR_ATTR}`).toContain(BOTTOM_BAR_ATTR)
    }
    for (const t of ['established', 'hometeam']) {
      const src = readFileSync(`components/clinic-site/templates/${t}/mobile-actions.tsx`, 'utf8')
      expect(src, `${t}'s pair sits bottom-right; the bottom-left floaters never meet it`).not.toContain(BOTTOM_BAR_ATTR)
    }
  })

  it('the chat bubble and the editor banner sit on top of whatever bar is under them', () => {
    // happy-dom drops a calc()+var() length on the way into the CSSOM, so the
    // rendered style is empty here; the source is the contract. The render
    // still proves the bubble mounts with the hardcoded `bottom-4` gone.
    render(<SiteChatWidget slug="acme" clinicName="Acme Dental" brand="#1F6F8B" />)
    expect(screen.getByTestId('site-chat-widget').className).not.toMatch(/\bbottom-4\b/)
    for (const f of ['components/clinic-site/site-chat-widget.tsx', 'components/clinic-site/draft-preview-banner.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('bottom: bottomBarOffset(16)')
    }
    expect(bottomBarOffset(16)).toBe('calc(16px + var(--site-bottom-bar, 0px))')
  })

  it('measures the tallest visible bar from the viewport bottom and writes the variable', () => {
    const bar = document.createElement('div')
    bar.setAttribute(BOTTOM_BAR_ATTR, '')
    document.body.appendChild(bar)
    // A 60px bar whose top sits 60px above the bottom of an 844px viewport.
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true })
    bar.getBoundingClientRect = () => ({ top: 784, bottom: 844, height: 60, left: 0, right: 390, width: 390, x: 0, y: 784, toJSON() {} }) as DOMRect
    const { unmount } = render(<BottomBarInset />)
    expect(document.documentElement.style.getPropertyValue(BOTTOM_BAR_VAR)).toBe('60px')
    unmount()
    expect(document.documentElement.style.getPropertyValue(BOTTOM_BAR_VAR)).toBe('')
    bar.remove()
  })

  it('a hidden bar measures zero', () => {
    const bar = document.createElement('div')
    bar.setAttribute(BOTTOM_BAR_ATTR, '')
    bar.style.display = 'none'
    document.body.appendChild(bar)
    render(<BottomBarInset />)
    expect(document.documentElement.style.getPropertyValue(BOTTOM_BAR_VAR)).toBe('0px')
    bar.remove()
  })
})
