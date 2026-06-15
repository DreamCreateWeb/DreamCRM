import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const deleteAction = vi.fn(async () => ({ ok: true }))
vi.mock('@/app/(default)/social-posts/actions', () => ({
  createSocialPostAction: vi.fn(async () => ({ ok: true })),
  deleteSocialPostAction: (...a: unknown[]) => deleteAction(...(a as [])),
}))

import PostHistory from '@/app/(default)/social-posts/post-history'
import type { SocialPostView, SocialPostTargetView } from '@/lib/types/zernio'

function target(over: Partial<SocialPostTargetView> = {}): SocialPostTargetView {
  return {
    id: 't1',
    platform: 'googlebusiness',
    label: 'Google Business Profile',
    icon: '📍',
    status: 'published',
    url: 'https://maps.google/p/1',
    lastError: null,
    publishedAtIso: '2026-06-10T00:00:00.000Z',
    ...over,
  }
}

function post(over: Partial<SocialPostView> = {}): SocialPostView {
  return {
    id: 'sp_1',
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
    createdAtIso: '2026-06-10T00:00:00.000Z',
    targets: [target()],
    ...over,
  }
}

beforeEach(() => deleteAction.mockClear())

describe('PostHistory', () => {
  it('renders a published post with its status pill + multi-channel target chips', () => {
    render(
      <PostHistory
        posts={[
          post({
            targets: [
              target({ id: 'tg', platform: 'googlebusiness', label: 'Google Business Profile', icon: '📍' }),
              target({ id: 'ti', platform: 'instagram', label: 'Instagram', icon: '📸', url: null, publishedAtIso: '2026-06-10T00:00:00.000Z' }),
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Published')).toBeTruthy()
    // Both channels show as chips (labels appear).
    expect(screen.getByText('Google Business Profile')).toBeTruthy()
    expect(screen.getByText('Instagram')).toBeTruthy()
    // The GBP target's permalink is a link.
    const link = screen.getByRole('link', { name: /Google Business Profile/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://maps.google/p/1')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows the scheduled date + Scheduled pill for a scheduled post', () => {
    render(
      <PostHistory
        posts={[
          post({
            status: 'scheduled',
            publishedAtIso: null,
            scheduledAtIso: '2099-01-02T00:00:00.000Z',
            targets: [target({ status: 'scheduled', url: null, publishedAtIso: null })],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Scheduled')).toBeTruthy()
    expect(screen.getByText(/Scheduled for/)).toBeTruthy()
  })

  it('surfaces a per-target error on a failed channel', () => {
    render(
      <PostHistory
        posts={[
          post({
            status: 'failed',
            publishedAtIso: null,
            targets: [target({ status: 'failed', url: null, lastError: 'image too small', label: 'Instagram', platform: 'instagram', icon: '📸' })],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText(/image too small/)).toBeTruthy()
  })

  it('shows the Offer badge + coupon code for a GBP offer', () => {
    render(<PostHistory posts={[post({ postType: 'offer', offerCouponCode: 'SMILE99' })]} />)
    expect(screen.getByText('Offer')).toBeTruthy()
    expect(screen.getByText('SMILE99')).toBeTruthy()
  })

  it('confirms before deleting, then calls the gated delete action', async () => {
    render(<PostHistory posts={[post()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith('sp_1'))
  })
})
