import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import FilterStrip, { STRIP_BREAKPOINT_PX } from '@/app/(double-sidebar)/messages/filter-strip'

/**
 * The strip scrolls the chip the person just picked into view below lg — a
 * server navigation resets a scroll region to x=0, which would hide the very
 * selection they made at 390px. Above lg the strip wraps and everything is
 * visible, so nothing moves. The region is reachable from the keyboard.
 */
const scrollIntoView = vi.fn()
let innerWidth = 390

beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => innerWidth })
})
afterEach(() => {
  innerWidth = 390
})

function strip(marked: boolean) {
  return render(
    <FilterStrip label="Conversation filters">
      <a href="/a">Open</a>
      <a href="/b" {...(marked ? { 'data-keep-in-view': '' } : {})}>
        Unread only
      </a>
      <a href="/c">Newest</a>
    </FilterStrip>,
  )
}

describe('FilterStrip', () => {
  it('is a named, focusable scroll region that wraps at lg', () => {
    const { container } = strip(false)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('aria-label')).toBe('Conversation filters')
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.className).toContain('overflow-x-auto')
    expect(el.className).toContain('no-scrollbar')
    expect(el.className).toContain('lg:flex-wrap')
  })

  it('below lg scrolls the marked chip into view, nearest edge, on mount', () => {
    innerWidth = 390
    strip(true)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect((scrollIntoView.mock.instances[0] as HTMLElement).textContent).toBe('Unread only')
  })

  it('does nothing when no chip is marked (the default view opens at the start)', () => {
    innerWidth = 390
    strip(false)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does nothing at lg and above, where the strip wraps', () => {
    innerWidth = STRIP_BREAKPOINT_PX
    strip(true)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
