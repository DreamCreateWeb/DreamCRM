import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const actions = {
  syncGoogleReviewsAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, synced: 3 })),
  replyToGoogleReviewAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  deleteGoogleReviewReplyAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
}
vi.mock('@/app/(default)/reviews/actions', () => ({
  syncGoogleReviewsAction: (...a: unknown[]) => actions.syncGoogleReviewsAction(...a),
  replyToGoogleReviewAction: (...a: unknown[]) => actions.replyToGoogleReviewAction(...a),
  deleteGoogleReviewReplyAction: (...a: unknown[]) => actions.deleteGoogleReviewReplyAction(...a),
}))

import GoogleReviewsSection, { GoogleConnectPrompt, type GoogleReviewClientRow } from '@/app/(default)/reviews/received/google-reviews-section'

function row(overrides: Partial<GoogleReviewClientRow> = {}): GoogleReviewClientRow {
  return {
    externalReviewId: 'rev_1',
    reviewerName: 'Priya N.',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment: 'Wonderful team!',
    reviewCreatedAtIso: new Date().toISOString(),
    replyComment: null,
    replyUpdatedAtIso: null,
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('GoogleConnectPrompt', () => {
  it('renders the connect-to-Google empty state linking to /integrations', () => {
    render(<GoogleConnectPrompt />)
    expect(screen.getByText('From Google')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/integrations')
  })
})

describe('GoogleReviewsSection', () => {
  it('shows the "From Google" label + average summary + Refresh button', () => {
    render(<GoogleReviewsSection rows={[row()]} count={2} averageRating={4.8} />)
    expect(screen.getByText('From Google')).toBeTruthy()
    expect(screen.getByText(/4\.8★ · 2 reviews/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh from Google/i })).toBeTruthy()
  })

  it('renders a review with stars, reviewer name, and comment', () => {
    render(<GoogleReviewsSection rows={[row({ reviewerName: 'Marcus B.', comment: 'Painless filling' })]} count={1} averageRating={5} />)
    expect(screen.getByText('Marcus B.')).toBeTruthy()
    expect(screen.getByText('Painless filling')).toBeTruthy()
    expect(screen.getByLabelText('5 out of 5 stars')).toBeTruthy()
  })

  it('renders a rating-only review with the no-comment note', () => {
    render(<GoogleReviewsSection rows={[row({ comment: null })]} count={1} averageRating={5} />)
    expect(screen.getByText(/didn.t leave a written comment/i)).toBeTruthy()
  })

  it('shows an existing reply with Edit + Delete controls', () => {
    render(
      <GoogleReviewsSection
        rows={[row({ replyComment: 'Thanks so much!', replyUpdatedAtIso: new Date().toISOString() })]}
        count={1}
        averageRating={5}
      />,
    )
    expect(screen.getByText('Thanks so much!')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Edit reply/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Delete reply/i })).toBeTruthy()
  })

  it('posts a reply via the action when one is written', async () => {
    render(<GoogleReviewsSection rows={[row()]} count={1} averageRating={5} />)
    fireEvent.click(screen.getByRole('button', { name: /^Reply$/i }))
    const textarea = screen.getByPlaceholderText(/Write a warm, public reply/i)
    fireEvent.change(textarea, { target: { value: 'Thank you, Priya!' } })
    fireEvent.click(screen.getByRole('button', { name: /Post reply/i }))
    await waitFor(() =>
      expect(actions.replyToGoogleReviewAction).toHaveBeenCalledWith({
        externalReviewId: 'rev_1',
        text: 'Thank you, Priya!',
      }),
    )
  })

  it('deletes a reply via the action', async () => {
    render(<GoogleReviewsSection rows={[row({ replyComment: 'old reply' })]} count={1} averageRating={5} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete reply/i }))
    await waitFor(() => expect(actions.deleteGoogleReviewReplyAction).toHaveBeenCalledWith('rev_1'))
  })

  it('refreshes via the sync action', async () => {
    render(<GoogleReviewsSection rows={[row()]} count={1} averageRating={5} />)
    fireEvent.click(screen.getByRole('button', { name: /Refresh from Google/i }))
    await waitFor(() => expect(actions.syncGoogleReviewsAction).toHaveBeenCalledTimes(1))
  })

  it('renders the empty "no reviews synced yet" state with Refresh still available', () => {
    render(<GoogleReviewsSection rows={[]} count={0} averageRating={null} />)
    expect(screen.getByText(/No Google reviews synced yet/i)).toBeTruthy()
    // Refresh is available both in the section header and as the EmptyState's
    // lead action (the empty state leads with its next step, per DS v2).
    expect(screen.getAllByRole('button', { name: /Refresh from Google/i }).length).toBeGreaterThanOrEqual(1)
  })
})
