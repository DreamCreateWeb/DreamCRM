import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DreamTeamStrip from '@/app/(default)/dashboard/dream-team-strip'

/**
 * THE SUMMONS STRIP (docs/ai-operations.md, D2) — the Overview's whole word
 * on the Dream Team after the stack moved to /dream-team. The contract:
 * one calm linked row when work waits, NOTHING when it doesn't, and the
 * urgency dot only for a card about to retire.
 */

function mk(over: Partial<{ id: string; capability: string; capabilityLabel: string; expiresAt: Date | null }> = {}) {
  return {
    id: over.id ?? 'p1',
    capability: over.capability ?? 'review_reply',
    capabilityLabel: over.capabilityLabel ?? 'Reply to Google reviews',
    expiresAt: over.expiresAt ?? null,
  }
}

describe('the Dream Team summons strip', () => {
  it('renders nothing at all when no work waits — the huddle stays a glance', () => {
    const { container } = render(<DreamTeamStrip proposals={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('summons with an honest count and deep-links to /dream-team', () => {
    render(
      <DreamTeamStrip
        proposals={[
          mk(),
          mk({ id: 'p2', capability: 'outreach_campaign', capabilityLabel: 'Launch outreach campaigns' }),
          mk({ id: 'p3', capability: 'social_post', capabilityLabel: 'Post to your social channels' }),
        ]}
      />,
    )
    expect(screen.getByText(/The Dream Team has 3 things ready for your sign-off/)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/dream-team')
    // Each waiting capability shows as a chip, so the row says WHAT kind of
    // work waits without making the reader click to find out.
    expect(screen.getByText('Reply to Google reviews')).toBeInTheDocument()
    expect(screen.getByText('Launch outreach campaigns')).toBeInTheDocument()
    // The full Approve control must NOT be here — the strip summons, the
    // Dream Team page signs.
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })

  it('singular voice for one card', () => {
    render(<DreamTeamStrip proposals={[mk()]} />)
    expect(screen.getByText(/one thing ready for your sign-off/)).toBeInTheDocument()
  })

  it('an expiring card earns the retires-within-a-day note; a dateless one stays calm', () => {
    const soon = new Date(Date.now() + 6 * 60 * 60 * 1000)
    render(<DreamTeamStrip proposals={[mk({ expiresAt: soon }), mk({ id: 'p2' })]} />)
    expect(screen.getByText(/retires within a day/)).toBeInTheDocument()
  })

  it('clamps to four chips and counts the rest honestly', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      mk({ id: `p${i}`, capabilityLabel: `Job ${i}` }),
    )
    render(<DreamTeamStrip proposals={many} />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
})
