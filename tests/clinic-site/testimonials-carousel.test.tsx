/**
 * Smoke tests for the arrow-paginated TestimonialsCarousel. The component
 * is a 'use client' surface (interactive prev/next), so we verify the
 * static markup the carousel ships with on first paint + that the
 * client buttons do exist for hydration.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import TestimonialsCarousel, {
  TestimonialCard,
} from '@/components/clinic-site/testimonials-carousel'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'

const T: ClinicTestimonial[] = Array.from({ length: 4 }, (_, i) => ({
  id: `t${i}`,
  quote: `Quote ${i}`,
  authorName: `Person ${i}`,
  authorLocation: 'Brooklyn, NY',
  authorPhotoUrl: null,
}))

describe('TestimonialsCarousel', () => {
  it('returns null for empty testimonials list (defensive)', () => {
    const { container } = render(<TestimonialsCarousel testimonials={[]} brand="#9CAF9F" />)
    // Should render no carousel chrome — the section that calls us
    // already guards on length > 0, so this is just defense in depth.
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeNull()
  })

  it('renders a single card without prev/next chrome for 1 testimonial', () => {
    render(<TestimonialsCarousel testimonials={[T[0]]} brand="#9CAF9F" />)
    expect(screen.getByText(/Quote 0/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Previous/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument()
  })

  it('renders prev/next buttons + all cards for ≥ 2 testimonials', () => {
    render(<TestimonialsCarousel testimonials={T} brand="#9CAF9F" />)
    expect(screen.getByRole('button', { name: /Previous testimonial/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next testimonial/i })).toBeInTheDocument()
    // Cards are doubled in the DOM (N + N) for the seamless wrap — each
    // quote appears twice, once in the original set and once in the
    // duplicate set used as the wrap-around landing pad.
    expect(screen.getAllByText(/Quote 0/)).toHaveLength(2)
    expect(screen.getAllByText(/Quote 3/)).toHaveLength(2)
  })

  it('advances the carousel state when Next is clicked (transform updates)', () => {
    const { container } = render(<TestimonialsCarousel testimonials={T} brand="#9CAF9F" />)
    const track = container.querySelector('ul') as HTMLElement
    const initialTransform = track.getAttribute('style') ?? ''
    fireEvent.click(screen.getByRole('button', { name: /Next testimonial/i }))
    const nextTransform = track.getAttribute('style') ?? ''
    expect(nextTransform).not.toBe(initialTransform)
  })

  it('animates past index 0 when Prev is clicked, then snaps to the wrap', () => {
    const { container } = render(<TestimonialsCarousel testimonials={T} brand="#9CAF9F" />)
    const track = container.querySelector('ul') as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: /Previous testimonial/i }))
    // The visible animation goes to -1 first (the duplicate-set position
    // visually identical to count-1). After the 500ms transition, the
    // useEffect snap fires and shifts index to count-1 with no
    // transition. We assert the immediate animated phase here — the
    // snap-back is timing-dependent and brittle to test in happy-dom.
    const animated = track.getAttribute('style') ?? ''
    expect(animated).toMatch(/\* -1\)/)
  })
})

describe('TestimonialCard', () => {
  it('renders the quote, star row, and bold author + location', () => {
    render(<TestimonialCard t={T[0]} brand="#9CAF9F" />)
    expect(screen.getByText(/Quote 0/)).toBeInTheDocument()
    expect(screen.getByLabelText(/5 out of 5 stars/i)).toBeInTheDocument()
    const strongs = Array.from(document.querySelectorAll('strong'))
    expect(strongs.some((s) => s.textContent === 'Person 0')).toBe(true)
    expect(screen.getByText(/Brooklyn, NY/)).toBeInTheDocument()
  })

  it('omits location text when authorLocation is null', () => {
    render(<TestimonialCard t={{ ...T[0], authorLocation: null }} brand="#9CAF9F" />)
    expect(screen.queryByText(/Brooklyn, NY/)).not.toBeInTheDocument()
  })
})
