import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
const refreshAction = vi.fn(async () => ({ ok: true }))
const buyAddon = vi.fn(async () => ({ ok: true }))
vi.mock('@/app/(default)/social-posts/actions', () => ({
  refreshChannelsAction: (...a: unknown[]) => refreshAction(...(a as [])),
}))
vi.mock('@/app/(default)/integrations/actions', () => ({
  buySocialAddonAction: (...a: unknown[]) => buyAddon(...(a as [])),
}))

import ConnectChannels, { type ConnectChannelsProps } from '@/app/(default)/social-posts/connect-channels'

function props(over: Partial<ConnectChannelsProps> = {}): ConnectChannelsProps {
  return {
    variant: 'hero',
    connected: [],
    handles: {},
    cap: { allowed: true, limit: 2, current: 0 },
    planName: 'Premium',
    addonAvailable: true,
    addonActive: false,
    addonPriceDollars: 20,
    addonConfigured: true,
    zernioConfigured: true,
    canManage: true,
    ...over,
  }
}

beforeEach(() => {
  refreshAction.mockClear()
  buyAddon.mockClear()
})

describe('ConnectChannels — hero (nothing connected)', () => {
  it('renders a one-click Connect link for Google Business and every social platform', () => {
    render(<ConnectChannels {...props()} />)
    expect(screen.getByRole('link', { name: 'Connect Google Business' })).toBeTruthy()
    for (const name of ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn']) {
      expect(screen.getByRole('link', { name: `Connect ${name}` })).toBeTruthy()
    }
    // GBP is flagged free.
    expect(screen.getByText(/Free · always/)).toBeTruthy()
  })

  it('the connect link opens the Zernio connect route in a new tab', () => {
    render(<ConnectChannels {...props()} />)
    const ig = screen.getByRole('link', { name: 'Connect Instagram' }) as HTMLAnchorElement
    expect(ig.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=instagram')
    expect(ig.getAttribute('target')).toBe('_blank')
  })

  it('shows the connected handle (and no connect link) for an already-linked channel', () => {
    render(<ConnectChannels {...props({ connected: ['instagram'], handles: { instagram: '@dream' } })} />)
    expect(screen.getByText('@dream')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Connect Instagram' })).toBeNull()
    // Other socials are still connectable.
    expect(screen.getByRole('link', { name: 'Connect Facebook' })).toBeTruthy()
  })
})

describe('ConnectChannels — plan cap', () => {
  it('at the social cap, offers the add-on instead of a connect link (GBP still free)', () => {
    render(<ConnectChannels {...props({ cap: { allowed: false, limit: 2, current: 2 } })} />)
    expect(screen.getAllByRole('button', { name: /Add a slot — \$20\/mo/ }).length).toBe(5)
    // Google Business is never capped.
    expect(screen.getByRole('link', { name: 'Connect Google Business' })).toBeTruthy()
  })

  it('clicking "Add a slot" calls the buy-add-on action', () => {
    render(<ConnectChannels {...props({ cap: { allowed: false, limit: 2, current: 2 } })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Add a slot/ })[0])
    expect(buyAddon).toHaveBeenCalledTimes(1)
  })

  it('on Basic (no social slots, no add-on), points social to the upgrade path', () => {
    render(
      <ConnectChannels
        {...props({ planName: 'Basic', cap: { allowed: false, limit: 0, current: 0 }, addonAvailable: false })}
      />,
    )
    expect(screen.getAllByRole('link', { name: 'Upgrade to post' }).length).toBe(5)
    expect(screen.getByText(/Social posting is on Pro/)).toBeTruthy()
    // Even Basic can post to Google Business.
    expect(screen.getByRole('link', { name: 'Connect Google Business' })).toBeTruthy()
  })
})

describe('ConnectChannels — guards', () => {
  it('a non-owner/admin sees a calm note instead of connect buttons', () => {
    render(<ConnectChannels {...props({ canManage: false })} />)
    expect(screen.getByText(/Ask an owner or admin/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Connect Instagram' })).toBeNull()
  })

  it('renders a "not enabled" note when Zernio is off on the instance', () => {
    render(<ConnectChannels {...props({ zernioConfigured: false })} />)
    expect(screen.getByText(/enabled on this DreamCRM instance/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Connect Instagram' })).toBeNull()
  })
})

describe('ConnectChannels — "add" strip (some connected)', () => {
  it('renders nothing when every channel is already connected', () => {
    const { container } = render(
      <ConnectChannels
        {...props({ variant: 'add', connected: ['googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('expands to show the remaining channels when "Connect another" is clicked', () => {
    render(<ConnectChannels {...props({ variant: 'add', connected: ['googlebusiness', 'instagram'] })} />)
    // Collapsed: the connect links aren't shown yet.
    expect(screen.queryByRole('link', { name: 'Connect TikTok' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Connect another channel/ }))
    // Expanded: remaining (not-yet-connected) channels appear.
    expect(screen.getByRole('link', { name: 'Connect TikTok' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connect Facebook' })).toBeTruthy()
    // Already-connected ones are not offered again.
    expect(screen.queryByRole('link', { name: 'Connect Instagram' })).toBeNull()
  })
})
