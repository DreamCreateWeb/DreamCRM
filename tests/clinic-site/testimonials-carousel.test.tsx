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
    expect(screen.getAllByText(/Quote 0/)).toHaveLength(1)
    expect(screen.getAllByText(/Quote 3/)).toHaveLength(1)
  })

  it('advances the carousel state when Next is clicked (transform updates)', () => {
    const { container } = render(<TestimonialsCarousel testimonials={T} brand="#9CAF9F" />)
    const track = container.querySelector('ul') as HTMLElement
    const initialTransform = track.getAttribute('style') ?? ''
    fireEvent.click(screen.getByRole('button', { name: /Next testimonial/i }))
    const nextTransform = track.getAttribute('style') ?? ''
    expect(nextTransform).not.toBe(initialTransform)
  })

  it('wraps around when Prev is clicked from index 0', () => {
    const { container } = render(<TestimonialsCarousel testimonials={T} brand="#9CAF9F" />)
    const track = container.querySelector('ul') as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: /Previous testimonial/i }))
    const wrapped = track.getAttribute('style') ?? ''
    // Wraps to count-1 = 3, so transform multiplier is now 3.
    expect(wrapped).toMatch(/\* 3\)/)
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
