import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const deleteAction = vi.fn(async () => ({ ok: true }))
vi.mock('@/app/(default)/google-posts/actions', () => ({
  createGbpPostAction: vi.fn(async () => ({ ok: true })),
  deleteGbpPostAction: (...a: unknown[]) => deleteAction(...(a as [])),
}))

import PostHistory from '@/app/(default)/google-posts/post-history'
import type { GbpPostView } from '@/lib/types/zernio'

function post(over: Partial<GbpPostView> = {}): GbpPostView {
  return {
    id: 'gbp_1',
    postType: 'standard',
    summary: 'Same-week cleanings available',
    imageUrl: null,
    ctaType: null,
    ctaUrl: null,
    eventTitle: null,
    eventStartAtIso: null,
    eventEndAtIso: null,
    offerCouponCode: null,
    offerRedeemUrl: null,
    offerTerms: null,
    status: 'published',
    scheduledAtIso: null,
    publishedAtIso: '2026-06-10T00:00:00.000Z',
    googleUrl: 'https://maps.google/p/1',
    lastError: null,
    createdAtIso: '2026-06-10T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => deleteAction.mockClear())

describe('PostHistory', () => {
  it('renders a published Update with its type badge, status pill + View on Google link', () => {
    render(<PostHistory posts={[post()]} />)
    expect(screen.getByText('Update')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    expect(screen.getByText(/Same-week cleanings/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /View on Google/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://maps.google/p/1')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows the scheduled date + Scheduled pill for a scheduled post', () => {
    render(<PostHistory posts={[post({ status: 'scheduled', publishedAtIso: null, scheduledAtIso: '2099-01-02T00:00:00.000Z', googleUrl: null })]} />)
    expect(screen.getByText('Scheduled')).toBeTruthy()
    expect(screen.getByText(/Scheduled for/)).toBeTruthy()
    // No live link yet.
    expect(screen.queryByRole('link', { name: /View on Google/i })).toBeNull()
  })

  it('surfaces the error + a Failed pill on a failed post', () => {
    render(<PostHistory posts={[post({ status: 'failed', publishedAtIso: null, googleUrl: null, lastError: 'image too small' })]} />)
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('image too small')).toBeTruthy()
  })

  it('shows the Offer badge + coupon code', () => {
    render(<PostHistory posts={[post({ postType: 'offer', offerCouponCode: 'SMILE99' })]} />)
    expect(screen.getByText('Offer')).toBeTruthy()
    expect(screen.getByText('SMILE99')).toBeTruthy()
  })

  it('shows the event title for an Event post', () => {
    render(<PostHistory posts={[post({ postType: 'event', eventTitle: "Kids' Smile Day" })]} />)
    expect(screen.getByText('Event')).toBeTruthy()
    expect(screen.getByText("Kids' Smile Day")).toBeTruthy()
  })

  it('confirms before deleting, then calls the gated delete action', async () => {
    render(<PostHistory posts={[post()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    // Now a confirm step appears.
    const confirm = screen.getByRole('button', { name: 'Confirm delete' })
    fireEvent.click(confirm)
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith('gbp_1'))
  })
})
