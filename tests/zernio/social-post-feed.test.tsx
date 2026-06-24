import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import PostFeed from '@/components/social-posts/post-feed'
import type { SocialPostView, SocialPostTargetView } from '@/lib/types/zernio'

function target(over: Partial<SocialPostTargetView> = {}): SocialPostTargetView {
  return {
    id: 't1',
    platform: 'googlebusiness',
    label: 'Google Business Profile',
    icon: '📍',
    status: 'published',
    url: null,
    lastError: null,
    publishedAtIso: '2026-06-10T00:00:00.000Z',
    ...over,
  }
}

function post(over: Partial<SocialPostView> = {}): SocialPostView {
  return {
    id: 'sp_1',
    postType: 'standard',
    summary: 'A post',
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

const channels = [
  { accountId: 'a_gbp', platform: 'googlebusiness', label: 'Google Business Profile', handle: 'dream' },
  { accountId: 'a_ig', platform: 'instagram', label: 'Instagram', handle: '@dream' },
]

// A GBP-only post, an Instagram-only post, and one cross-posted to both.
const gbpPost = post({ id: 'p_gbp', summary: 'Whitening special this month', targets: [target({ id: 'tg', platform: 'googlebusiness' })] })
const igPost = post({ id: 'p_ig', summary: 'Meet our new hygienist', targets: [target({ id: 'ti', platform: 'instagram', label: 'Instagram', icon: '📸' })] })
const bothPost = post({
  id: 'p_both',
  summary: 'Same-week cleanings available',
  targets: [target({ id: 'tg2', platform: 'googlebusiness' }), target({ id: 'ti2', platform: 'instagram', label: 'Instagram', icon: '📸' })],
})

describe('PostFeed — tablet showcase of the post history', () => {
  it('renders a platform tab only for platforms that have posts, with a count', () => {
    render(<PostFeed posts={[gbpPost, igPost, bothPost]} channels={channels} clinicName="Dream Dental" />)
    // Google appears in 2 posts (gbpPost + bothPost); Instagram in 2 (igPost + bothPost).
    expect(screen.getByRole('tab', { name: /Google/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Instagram/ })).toBeTruthy()
    // No TikTok posts → no TikTok tab.
    expect(screen.queryByRole('tab', { name: /TikTok/ })).toBeNull()
  })

  it('defaults to the first platform (Google) and shows only its posts', () => {
    render(<PostFeed posts={[gbpPost, igPost, bothPost]} channels={channels} clinicName="Dream Dental" />)
    expect(screen.getByText('Whitening special this month')).toBeTruthy()
    expect(screen.getByText('Same-week cleanings available')).toBeTruthy()
    // The Instagram-only post is not in the Google feed.
    expect(screen.queryByText('Meet our new hygienist')).toBeNull()
  })

  it('switches the feed when another platform tab is clicked', () => {
    render(<PostFeed posts={[gbpPost, igPost, bothPost]} channels={channels} clinicName="Dream Dental" />)
    fireEvent.click(screen.getByRole('tab', { name: /Instagram/ }))
    expect(screen.getByText('Meet our new hygienist')).toBeTruthy()
    expect(screen.getByText('Same-week cleanings available')).toBeTruthy()
    // The Google-only post drops out of the Instagram feed.
    expect(screen.queryByText('Whitening special this month')).toBeNull()
  })

  it('marks the active platform tab as selected', () => {
    render(<PostFeed posts={[gbpPost, igPost]} channels={channels} clinicName="Dream Dental" />)
    const google = screen.getByRole('tab', { name: /Google/ })
    expect(google.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: /Instagram/ }))
    expect(screen.getByRole('tab', { name: /Instagram/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /Google/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('falls back to a "List" hint when no post is on a previewable platform', () => {
    const odd = post({ id: 'p_odd', summary: 'on a mystery channel', targets: [target({ id: 'tx', platform: 'pinterest', label: 'Pinterest' })] })
    render(<PostFeed posts={[odd]} channels={[]} clinicName="Dream Dental" />)
    expect(screen.getByText(/Switch to/)).toBeTruthy()
    expect(screen.getByText('List')).toBeTruthy()
  })

  it('uses the connected handle for the platform header', () => {
    const { container } = render(<PostFeed posts={[igPost]} channels={channels} clinicName="Dream Dental" />)
    // The Instagram card's account name uses the connected handle (header + byline).
    expect(within(container).getAllByText('@dream').length).toBeGreaterThanOrEqual(1)
  })
})
