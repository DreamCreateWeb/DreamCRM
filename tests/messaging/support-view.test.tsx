import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The support pane's IDENTITY CONTRACT: the platform side renders as
 * "Support" — the owner's name must never appear on a clinic's screen,
 * even though the underlying message row carries their authorName.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/realtime/realtime-provider', () => ({ useRealtime: () => undefined }))

import SupportView from '@/app/(double-sidebar)/messages/support/support-view'

const messages = [
  {
    id: 1,
    body: 'Our PMS sync looks stuck since yesterday.',
    createdAt: new Date().toISOString(),
    authorId: 'staffA1',
    authorName: 'Dr. Cotham',
    fromSupport: false,
  },
  {
    id: 2,
    body: 'On it — give me an hour.',
    createdAt: new Date().toISOString(),
    authorId: 'dustin',
    authorName: 'Dustin Mabray',
    fromSupport: true,
  },
]

describe('SupportView', () => {
  it('labels platform messages "Support" and never leaks the person behind it', () => {
    render(<SupportView messages={messages} currentUserId="staffA2" />)
    // The reply is on screen…
    expect(screen.getByText('On it — give me an hour.')).toBeInTheDocument()
    // …attributed to Support (header + bubble), with no personal identity.
    expect(screen.getAllByText('Support').length).toBeGreaterThanOrEqual(2)
    expect(document.body.textContent).not.toContain('Dustin')
    // A clinic teammate keeps their own name.
    expect(screen.getByText('Dr. Cotham')).toBeInTheDocument()
  })

  it('offers a live composer to real clinics', () => {
    render(<SupportView messages={[]} currentUserId="staffA1" />)
    expect(screen.getByLabelText('Message to support')).toBeEnabled()
    expect(screen.getByText('Anything on your mind?')).toBeInTheDocument()
  })

  it('the demo shows a preview with the composer disabled', () => {
    render(<SupportView demo messages={[]} currentUserId="u1" />)
    expect(screen.getByLabelText('Message to support')).toBeDisabled()
    expect(screen.getByText(/in the demo this is a preview/i)).toBeInTheDocument()
  })
})
