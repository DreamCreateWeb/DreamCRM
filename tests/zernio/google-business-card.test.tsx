import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import GoogleBusinessCard from '@/app/(default)/integrations/google-business-card'
import type { ZernioConnectionView } from '@/lib/types/zernio'

/**
 * The Integrations GBP card is now a STATUS + link to /channels (connecting /
 * disconnecting moved to the canonical Channels surface — no competing connect
 * buttons). These tests assert the status pills + the "Manage channels" link.
 */
function view(overrides: Partial<ZernioConnectionView> = {}): ZernioConnectionView {
  return {
    status: 'disconnected',
    zernioProfileId: null,
    lastError: null,
    isDemo: false,
    googleBusinessAccounts: [],
    accounts: [],
    ...overrides,
  }
}

describe('GoogleBusinessCard (Integrations status card)', () => {
  it('renders the disconnected state with a link to the Channels page when configured', () => {
    render(<GoogleBusinessCard connection={view()} configured />)
    expect(screen.getByText('Google Business Profile')).toBeTruthy()
    expect(screen.getByText('Not connected')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Connect on the Channels page/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/channels')
  })

  it('does NOT carry its own connect button (Channels owns that)', () => {
    render(<GoogleBusinessCard connection={view()} configured />)
    expect(screen.queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Disconnect/i })).toBeNull()
  })

  it('shows the not-enabled note when Zernio is not configured', () => {
    render(<GoogleBusinessCard connection={view()} configured={false} />)
    expect(screen.getByText(/isn.t enabled on this DreamCRM instance/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Channels/i })).toBeNull()
  })

  it('renders the connected state with the account handle + a Manage channels link', () => {
    render(
      <GoogleBusinessCard
        configured
        connection={view({
          status: 'connected',
          zernioProfileId: 'prof_1',
          googleBusinessAccounts: [
            { id: 'a1', platform: 'googlebusiness', profileId: 'prof_1', username: 'acme-dental', displayName: 'Acme Dental', profilePicture: null, profileUrl: null },
          ],
          accounts: [
            { id: 'a1', platform: 'googlebusiness', profileId: 'prof_1', username: 'acme-dental', displayName: 'Acme Dental', profilePicture: null, profileUrl: null },
          ],
        })}
      />,
    )
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('Acme Dental')).toBeTruthy()
    expect(screen.getByText('acme-dental')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Manage channels/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/channels')
  })

  it('shows an error pill when the connection errored', () => {
    render(<GoogleBusinessCard connection={view({ status: 'error', lastError: 'token expired' })} configured />)
    expect(screen.getByText('Needs attention')).toBeTruthy()
  })
})
