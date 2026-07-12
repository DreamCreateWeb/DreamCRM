import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const actions = {
  syncFacebookReviewsAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, synced: 2 })),
}
vi.mock('@/app/(default)/growth/reviews/actions', () => ({
  syncFacebookReviewsAction: (...a: unknown[]) => actions.syncFacebookReviewsAction(...a),
}))

import FacebookReviewsSection, { type FacebookReviewClientRow } from '@/app/(default)/growth/reviews/received/facebook-reviews-section'

function row(overrides: Partial<FacebookReviewClientRow> = {}): FacebookReviewClientRow {
  return {
    externalReviewId: 'fb_1',
    reviewerName: 'Jenna R.',
    reviewerPhotoUrl: null,
    recommendationType: 'recommended',
    comment: 'Took my whole family here!',
    reviewCreatedAtIso: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('FacebookReviewsSection', () => {
  it('shows the "From Facebook" label, recommend tally, and Refresh button', () => {
    render(<FacebookReviewsSection rows={[row()]} recommended={3} notRecommended={1} />)
    expect(screen.getByText('From Facebook')).toBeTruthy()
    // The tally text is built from several JSX expressions in one span, so match
    // on the element's full normalized text.
    const tally = screen.getByText(
      (_t, el) => el?.tagName === 'SPAN' && /3 recommend · 1 don't/.test(el?.textContent ?? ''),
    )
    expect(tally).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh from Facebook/i })).toBeTruthy()
  })

  it('renders a recommendation with reviewer name + comment + a Recommends badge', () => {
    render(<FacebookReviewsSection rows={[row({ reviewerName: 'Andre C.', comment: 'Same-day appointment' })]} recommended={1} notRecommended={0} />)
    expect(screen.getByText('Andre C.')).toBeTruthy()
    expect(screen.getByText('Same-day appointment')).toBeTruthy()
    expect(screen.getByText('Recommends')).toBeTruthy()
  })

  it("renders a doesn't-recommend badge for a negative recommendation", () => {
    render(<FacebookReviewsSection rows={[row({ recommendationType: 'not_recommended', comment: 'Wait was long' })]} recommended={0} notRecommended={1} />)
    expect(screen.getByText("Doesn't recommend")).toBeTruthy()
  })

  it('renders a bare recommendation (no comment) with the no-comment fallback', () => {
    render(<FacebookReviewsSection rows={[row({ comment: null })]} recommended={1} notRecommended={0} />)
    expect(screen.getByText(/no written comment/i)).toBeTruthy()
  })

  it('is read-only — shows a "reply on Facebook" link-out, NOT a reply box', () => {
    render(<FacebookReviewsSection rows={[row()]} recommended={1} notRecommended={0} />)
    // No reply controls (FB replies aren't supported via our connection).
    expect(screen.queryByRole('button', { name: /^Reply$/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    const link = screen.getByRole('link', { name: /Facebook Page/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('facebook.com')
  })

  it('honestly notes recommendations do NOT affect the website star rating', () => {
    render(<FacebookReviewsSection rows={[]} recommended={0} notRecommended={0} />)
    expect(screen.getByText(/don't affect your website's Google star rating/i)).toBeTruthy()
  })

  it('refresh calls the action', async () => {
    render(<FacebookReviewsSection rows={[row()]} recommended={1} notRecommended={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Refresh from Facebook/i }))
    await waitFor(() => expect(actions.syncFacebookReviewsAction).toHaveBeenCalled())
  })
})
