import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GoogleRatingBadge, {
  ratingFillPct,
  GOOGLE_RATING_MIN_COUNT,
} from '@/components/clinic-site/google-rating-badge'

describe('ratingFillPct', () => {
  it('maps a 0–5 average to a 0–100% gold-overlay width', () => {
    expect(ratingFillPct(5)).toBe(100)
    expect(ratingFillPct(0)).toBe(0)
    expect(ratingFillPct(2.5)).toBe(50)
    expect(ratingFillPct(4.6)).toBeCloseTo(92)
  })

  it('clamps out-of-range averages', () => {
    expect(ratingFillPct(7)).toBe(100)
    expect(ratingFillPct(-1)).toBe(0)
  })
})

describe('GOOGLE_RATING_MIN_COUNT', () => {
  it('holds the badge until a rating is genuinely earned', () => {
    expect(GOOGLE_RATING_MIN_COUNT).toBeGreaterThanOrEqual(3)
  })
})

describe('GoogleRatingBadge', () => {
  it('renders the average, count, and an accessible label', () => {
    render(<GoogleRatingBadge average={4.9} count={212} headingInk="#1C1A17" />)
    expect(screen.getByText('4.9')).toBeTruthy()
    expect(screen.getByText(/212 reviews on Google/)).toBeTruthy()
    const badge = screen.getByRole('img')
    expect(badge.getAttribute('aria-label')).toBe('4.9 out of 5 stars from 212 Google reviews')
  })

  it('singularizes a one-review clinic', () => {
    render(<GoogleRatingBadge average={5} count={1} headingInk="#1C1A17" />)
    expect(screen.getByText(/1 review on Google/)).toBeTruthy()
    expect(screen.queryByText(/reviews on Google/)).toBeNull()
  })
})
