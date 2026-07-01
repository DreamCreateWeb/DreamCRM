import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestimonialCard } from '@/components/clinic-site/testimonials-carousel'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'

/**
 * The testimonial card now renders the REAL star rating (auto-featured Google
 * reviews carry it) and a "via Google" chip, while legacy/manual testimonials
 * with no rating keep the classic 5★ look.
 */
function t(overrides: Partial<ClinicTestimonial>): ClinicTestimonial {
  return { id: 't1', quote: 'Great visit', authorName: 'Priya N.', ...overrides }
}

describe('TestimonialCard rating + source', () => {
  it('renders the real rating for a 4★ Google review + a "via Google" chip', () => {
    render(<TestimonialCard t={t({ rating: 4, source: 'google' })} />)
    expect(screen.getByLabelText('4 out of 5 stars')).toBeTruthy()
    expect(screen.getByText('via Google')).toBeTruthy()
  })

  it('falls back to 5★ and no chip for a legacy manual testimonial (no rating/source)', () => {
    render(<TestimonialCard t={t({})} />)
    expect(screen.getByLabelText('5 out of 5 stars')).toBeTruthy()
    expect(screen.queryByText('via Google')).toBeNull()
  })

  it('shows the quote + author', () => {
    render(<TestimonialCard t={t({ quote: 'Painless filling', authorName: 'Marcus B.' })} />)
    expect(screen.getByText('Painless filling')).toBeTruthy()
    expect(screen.getByText('Marcus B.')).toBeTruthy()
  })
})
