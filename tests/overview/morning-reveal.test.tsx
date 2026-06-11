/**
 * MorningReveal — signature moment #1 ("the morning reveal", DESIGN-SYSTEM
 * Part 3). The attention-cards row cascades in ONCE per session entry (50ms
 * stagger, spring-gentle, y(8px)+fade), then never again; reduced-motion snaps.
 *
 * These tests pin the mechanics that make it a once-per-session, accessible
 * cascade — the stagger arms only on the first entry, respects the shared
 * sessionStorage flag (sibling to KpiStat's count-up flag), and stays static
 * for returning visits + reduced-motion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { render } from '@testing-library/react'
import { MorningReveal } from '@/app/(default)/dashboard/morning-reveal'

const REVEAL_FLAG = 'v2-reveal-done'

function cells(container: HTMLElement): HTMLElement[] {
  // MorningReveal wraps each child in a direct <div> cell.
  return Array.from(container.firstElementChild?.children ?? []) as HTMLElement[]
}

function Cards({ n }: { n: number }) {
  return (
    <MorningReveal className="grid">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} data-testid={`card-${i}`}>
          card {i}
        </div>
      ))}
    </MorningReveal>
  )
}

beforeEach(() => {
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  // Default: motion allowed (happy-dom matchMedia returns matches:false).
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }),
  )
})

describe('MorningReveal — first session entry', () => {
  it('arms the cascade once, staggering the first cards, and sets the session flag', () => {
    let raf: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const { container } = render(<Cards n={4} />)
    // After mount the effect armed the hidden state (opacity 0 + lift).
    let cs = cells(container)
    expect(cs).toHaveLength(4)
    expect(cs[0].style.opacity).toBe('0')
    expect(cs[0].style.transform).toContain('translateY(8px)')
    // Flag is set so it never replays this session.
    expect(sessionStorage.getItem(REVEAL_FLAG)).toBe('1')

    // Flip to the shown phase (rAF) → transitions to resting state with a
    // per-card stagger delay (50ms step).
    act(() => {
      raf?.(0)
    })
    cs = cells(container)
    expect(cs[0].style.opacity).toBe('1')
    expect(cs[0].style.transform).toBe('translateY(0)')
    expect(cs[0].style.transitionDelay).toBe('0ms')
    expect(cs[1].style.transitionDelay).toBe('50ms')
    expect(cs[2].style.transitionDelay).toBe('100ms')
    // The transition uses the spec's spring-gentle easing token.
    expect(cs[0].style.transition).toContain('--spring-gentle')
  })

  it('caps the stagger at 8 cards (cards beyond the cap resolve with the row)', () => {
    let raf: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const { container } = render(<Cards n={10} />)
    act(() => {
      raf?.(0)
    })
    const cs = cells(container)
    expect(cs).toHaveLength(10)
    // 8th card (index 7) is the last staggered one.
    expect(cs[7].style.transitionDelay).toBe('350ms')
    // 9th + 10th (beyond the cap) snap with the row — no extra delay.
    expect(cs[8].style.transitionDelay).toBe('0ms')
    expect(cs[9].style.transitionDelay).toBe('0ms')
  })
})

describe('MorningReveal — returning visit + reduced motion stay static', () => {
  it('does NOT arm when the session flag is already set', () => {
    sessionStorage.setItem(REVEAL_FLAG, '1')
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)

    const { container } = render(<Cards n={4} />)
    const cs = cells(container)
    // Static: no inline opacity/transform/transition applied.
    expect(cs[0].style.opacity).toBe('')
    expect(cs[0].style.transform).toBe('')
    expect(cs[0].style.transition).toBe('')
    expect(raf).not.toHaveBeenCalled()
  })

  it('does NOT arm under prefers-reduced-motion (and leaves the flag untouched)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }),
    )
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)

    const { container } = render(<Cards n={4} />)
    const cs = cells(container)
    expect(cs[0].style.opacity).toBe('')
    expect(cs[0].style.transition).toBe('')
    expect(raf).not.toHaveBeenCalled()
    // Reduced-motion users shouldn't "spend" the once-per-session reveal.
    expect(sessionStorage.getItem(REVEAL_FLAG)).toBeNull()
  })

  it('renders every child exactly once regardless of phase', () => {
    sessionStorage.setItem(REVEAL_FLAG, '1')
    const { getAllByText, getByTestId } = render(<Cards n={3} />)
    expect(getByTestId('card-0')).toBeInTheDocument()
    expect(getByTestId('card-2')).toBeInTheDocument()
    expect(getAllByText(/^card \d$/)).toHaveLength(3)
  })
})
