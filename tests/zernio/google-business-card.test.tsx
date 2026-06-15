import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/integrations/actions', () => ({
  syncZernioAccountsAction: vi.fn(async () => ({ ok: true })),
  disconnectZernioGoogleAction: vi.fn(async () => ({ ok: true })),
}))

import GoogleBusinessCard from '@/app/(default)/integrations/google-business-card'
import type { ZernioConnectionView } from '@/lib/types/zernio'

function view(overrides: Partial<ZernioConnectionView> = {}): ZernioConnectionView {
  return {
    status: 'disconnected',
    zernioProfileId: null,
    lastError: null,
    isDemo: false,
    googleBusinessAccounts: [],
    ...overrides,
  }
}

describe('GoogleBusinessCard', () => {
  it('renders the disconnected state with a connect link (new tab) when configured', () => {
    render(<GoogleBusinessCard connection={view()} configured />)
    expect(screen.getByText('Google Business Profile')).toBeTruthy()
    expect(screen.getByText('Not connected')).toBeTruthy()
    const connect = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=googlebusiness')
    expect(connect.getAttribute('target')).toBe('_blank')
  })

  it('shows the not-enabled note when Zernio is not configured', () => {
    render(<GoogleBusinessCard connection={view()} configured={false} />)
    expect(screen.getByText(/isn.t enabled on this DreamCRM instance/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
  })

  it('renders the connected state with the account handle + Refresh/Disconnect', () => {
    render(
      <GoogleBusinessCard
        configured
        connection={view({
          status: 'connected',
          zernioProfileId: 'prof_1',
          googleBusinessAccounts: [
            { id: 'a1', platform: 'googlebusiness', profileId: 'prof_1', username: 'acme-dental', displayName: 'Acme Dental', profilePicture: null, profileUrl: null },
          ],
        })}
      />,
    )
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('Acme Dental')).toBeTruthy()
    expect(screen.getByText('acme-dental')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeTruthy()
  })

  it('teases reviews/hours/metrics as coming next — does NOT claim to show them yet', () => {
    render(
      <GoogleBusinessCard
        configured
        connection={view({
          status: 'connected',
          googleBusinessAccounts: [
            { id: 'a1', platform: 'googlebusiness', profileId: 'p', username: 'x', displayName: 'X', profilePicture: null, profileUrl: null },
          ],
        })}
      />,
    )
    expect(screen.getByText(/next update/i)).toBeTruthy()
  })

  it('shows an error pill + message when the connection errored', () => {
    render(<GoogleBusinessCard connection={view({ status: 'error', lastError: 'token expired' })} configured />)
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('token expired')).toBeTruthy()
  })
})
