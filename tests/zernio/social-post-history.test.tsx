import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const deleteAction = vi.fn(async () => ({ ok: true }))
const retryAction = vi.fn(async (..._a: unknown[]) => ({ ok: true, recovered: 1, retried: 1 }))
vi.mock('@/app/(default)/growth/social/actions', () => ({
  createSocialPostAction: vi.fn(async () => ({ ok: true })),
  deleteSocialPostAction: (...a: unknown[]) => deleteAction(...(a as [])),
  retrySocialPostAction: (...a: unknown[]) => retryAction(...a),
}))

import PostHistory from '@/app/(default)/growth/social/post-history'
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

beforeEach(() => {
  deleteAction.mockClear()
  retryAction.mockClear()
  retryAction.mockResolvedValue({ ok: true, recovered: 1, retried: 1 })
})

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

/**
 * TRY AGAIN (2026-10-26): a failed channel gets a lever that matches the
 * legend, and the lever goes through the gated action — never bare-awaited.
 */
describe('PostHistory — Try again on a failed channel', () => {
  const failedPost = () =>
    post({
      status: 'failed',
      publishedAtIso: null,
      targets: [
        target(),
        target({ id: 'ti', status: 'failed', url: null, lastError: 'image too small', label: 'Instagram', platform: 'instagram', icon: '📸' }),
      ],
    })

  it('offers Try again named for the one failed channel and calls the action with the post id', async () => {
    render(<PostHistory posts={[failedPost()]} />)
    const btn = screen.getByRole('button', { name: 'Try again on Instagram' })
    fireEvent.click(btn)
    await waitFor(() => expect(retryAction).toHaveBeenCalledWith('sp_1'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/went through/))
  })

  it('a post with nothing failed has no Try again lever', () => {
    render(<PostHistory posts={[post()]} />)
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
  })

  it('a thrown action (a redeploy under the tab) becomes a sentence, not a stuck button', async () => {
    retryAction.mockRejectedValueOnce(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))
    render(<PostHistory posts={[failedPost()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again on Instagram' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Refresh/))
    expect((screen.getByRole('button', { name: 'Try again on Instagram' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
