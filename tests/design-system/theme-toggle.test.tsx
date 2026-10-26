import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * THE THEME TOGGLE IS A SWITCH THAT TELLS THE TRUTH (2026-10-26).
 *
 * The Mosaic checkbox flipped `theme === 'dark' ? 'light' : 'dark'` off the
 * STORED choice, and next-themes starts at 'system'. On a dark device the
 * first click therefore set 'dark' — nothing on screen changed and a second
 * click was needed — and `checked={theme === 'light'}` announced the opposite
 * of what was painted. The control now reads `resolvedTheme` for both the
 * announced state and the flip, so the first click always changes the screen.
 */
const themeState: {
  theme: string
  resolvedTheme: string | undefined
  setTheme: ReturnType<typeof vi.fn>
} = { theme: 'system', resolvedTheme: 'dark', setTheme: vi.fn() }

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}))

import ThemeToggle from '@/components/theme-toggle'

beforeEach(() => {
  themeState.theme = 'system'
  themeState.resolvedTheme = 'dark'
  themeState.setTheme = vi.fn()
})

describe('ThemeToggle', () => {
  it('is a real switch named "Dark mode" whose state mirrors the RESOLVED theme', () => {
    render(<ThemeToggle />)
    const sw = screen.getByRole('switch', { name: 'Dark mode' })
    expect(sw.tagName).toBe('BUTTON')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    // No hidden checkbox left from the template.
    expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  })

  it('on a dark device with the stored theme at "system", the FIRST click goes to light', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('switch', { name: 'Dark mode' }))
    expect(themeState.setTheme).toHaveBeenCalledWith('light')
    expect(themeState.setTheme).toHaveBeenCalledOnce()
  })

  it('on a light screen the switch reads off and a click goes to dark', () => {
    themeState.resolvedTheme = 'light'
    render(<ThemeToggle />)
    const sw = screen.getByRole('switch', { name: 'Dark mode' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(themeState.setTheme).toHaveBeenCalledWith('dark')
  })

  it('is a 40px control (DESIGN-SYSTEM §2.2), not the template’s 32px', () => {
    render(<ThemeToggle />)
    const sw = screen.getByRole('switch', { name: 'Dark mode' })
    expect(sw.className).toMatch(/\bh-10\b/)
    expect(sw.className).toMatch(/\bw-10\b/)
    expect(sw.className).not.toMatch(/\b[hw]-8\b/)
  })

  it('keeps the pre-paint CSS icon swap, and hides both icons from AT', () => {
    const { container } = render(<ThemeToggle />)
    const svgs = Array.from(container.querySelectorAll('svg'))
    expect(svgs.length).toBe(2)
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svgs[0].getAttribute('class')).toContain('dark:hidden')
    expect(svgs[1].getAttribute('class')).toContain('dark:block')
  })
})
