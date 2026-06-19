/**
 * Skip-to-content link (WCAG 2.4.1). A hidden-until-focused anchor that points
 * at the focusable <main> landmark so keyboard/AT users bypass the nav.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkipToContent } from '@/components/ui/skip-to-content'

describe('SkipToContent', () => {
  it('renders a link to the main landmark, hidden until focused', () => {
    render(<SkipToContent />)
    const link = screen.getByRole('link', { name: 'Skip to content' })
    expect(link.getAttribute('href')).toBe('#main-content')
    // sr-only until focused; revealed via focus:not-sr-only.
    expect(link.className).toContain('sr-only')
    expect(link.className).toContain('focus:not-sr-only')
  })

  it('honors a custom target id', () => {
    render(<SkipToContent targetId="portal-main" />)
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#portal-main')
  })
})
