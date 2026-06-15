import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import CalendarView from '@/app/(default)/social-posts/calendar-view'
import type { SocialPostView, SocialPostTargetView } from '@/lib/types/zernio'

function target(over: Partial<SocialPostTargetView> = {}): SocialPostTargetView {
  return {
    id: 't1',
    platform: 'instagram',
    label: 'Instagram',
    icon: '📸',
    status: 'scheduled',
    url: null,
    lastError: null,
    publishedAtIso: null,
    ...over,
  }
}

function post(over: Partial<SocialPostView> = {}): SocialPostView {
  return {
    id: 'sp_1',
    postType: 'standard',
    summary: 'Behind the smiles',
    imageUrl: null,
    ctaType: null,
    ctaUrl: null,
    eventTitle: null,
    eventStartAtIso: null,
    eventEndAtIso: null,
    offerCouponCode: null,
    offerRedeemUrl: null,
    offerTerms: null,
    status: 'scheduled',
    scheduledAtIso: null,
    publishedAtIso: null,
    createdAtIso: new Date().toISOString(),
    targets: [target()],
    ...over,
  }
}

/** Build an ISO for "today at noon" so the post lands in the current month grid. */
function todayNoonIso(): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

describe('CalendarView', () => {
  it('renders the current month label + weekday header', () => {
    render(<CalendarView posts={[]} />)
    const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    expect(screen.getByText(monthLabel)).toBeTruthy()
    expect(screen.getByText('Mon')).toBeTruthy()
    expect(screen.getByText('Sun')).toBeTruthy()
  })

  it('places a scheduled post on its day with channel icons, and opens a detail popover', () => {
    const p = post({ scheduledAtIso: todayNoonIso(), summary: 'Behind the smiles today' })
    render(<CalendarView posts={[p]} />)
    // The chip shows the post preview text.
    const chip = screen.getByText('Behind the smiles today')
    expect(chip).toBeTruthy()
    // Clicking opens the detail popover (Close button appears).
    fireEvent.click(chip)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('navigates months with Prev/Next', () => {
    render(<CalendarView posts={[]} />)
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText(next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))).toBeTruthy()
  })

  it('falls back to the created date when a post has neither scheduled nor published date', () => {
    const p = post({ status: 'draft', scheduledAtIso: null, publishedAtIso: null, createdAtIso: todayNoonIso(), summary: 'A draft post' })
    render(<CalendarView posts={[p]} />)
    expect(screen.getByText('A draft post')).toBeTruthy()
  })
})
