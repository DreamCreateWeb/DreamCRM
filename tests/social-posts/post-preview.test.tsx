import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PostPreviews, { type PreviewChannel, type PreviewContent } from '@/components/social-posts/post-preview'

/**
 * The live multi-platform preview — the "broadcast studio" centerpiece. Renders
 * one faithful card per selected channel, live from the composer's state.
 */

function content(over: Partial<PreviewContent> = {}): PreviewContent {
  return {
    summary: 'Same-week openings this Friday!',
    imageUrl: null,
    clinicName: 'Dream Dental',
    postType: 'standard',
    ctaLabel: null,
    eventTitle: '',
    eventStartLabel: null,
    offerCouponCode: '',
    ...over,
  }
}
const ch = (platform: string, handle: string | null = null): PreviewChannel => ({
  accountId: `acc_${platform}`, platform, label: platform, handle,
})

describe('PostPreviews', () => {
  it('renders a card per selected platform with the live text', () => {
    const { container } = render(
      <PostPreviews channels={[ch('instagram', '@dreamdental'), ch('facebook'), ch('googlebusiness')]} content={content()} />,
    )
    // Each platform's brand mark identifies its card.
    expect(container.querySelector('[data-brand-logo="instagram"]')).toBeTruthy()
    expect(container.querySelector('[data-brand-logo="facebook"]')).toBeTruthy()
    expect(container.querySelector('[data-brand-logo="googlebusiness"]')).toBeTruthy()
    // The post text shows in every card (3×).
    expect(screen.getAllByText(/Same-week openings this Friday/i).length).toBe(3)
    // The Instagram card uses the connected handle.
    expect(screen.getAllByText('@dreamdental').length).toBeGreaterThan(0)
  })

  it('shows a prompt when no channel is selected', () => {
    render(<PostPreviews channels={[]} content={content()} />)
    expect(screen.getByText(/Pick a channel above to see your post/i)).toBeInTheDocument()
  })

  it('shows placeholder text when the post is empty (never a blank card)', () => {
    render(<PostPreviews channels={[ch('instagram')]} content={content({ summary: '' })} />)
    expect(screen.getByText(/Your post text will appear here/i)).toBeInTheDocument()
  })

  it('renders the Google Business CTA button + offer code when set', () => {
    render(
      <PostPreviews
        channels={[ch('googlebusiness')]}
        content={content({ postType: 'offer', ctaLabel: 'Book', offerCouponCode: 'SMILE99' })}
      />,
    )
    expect(screen.getByText('Book')).toBeInTheDocument()
    expect(screen.getByText('SMILE99')).toBeInTheDocument()
  })

  it('de-dupes to one card per platform', () => {
    const { container } = render(
      <PostPreviews channels={[ch('instagram', '@one'), ch('instagram', '@two')]} content={content()} />,
    )
    expect(container.querySelectorAll('[data-brand-logo="instagram"]').length).toBe(1)
  })
})
