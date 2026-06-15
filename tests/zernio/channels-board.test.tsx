import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/channels/actions', () => ({
  refreshChannelsAction: vi.fn(async () => ({ ok: true })),
  disconnectChannelAction: vi.fn(async () => ({ ok: true })),
}))

import ChannelsBoard, { type ChannelsBoardProps } from '@/app/(default)/channels/channels-board'
import { SOCIAL_CHANNEL_SHORTLIST, ZERNIO_PLATFORM_LABELS, ZERNIO_PLATFORM_ICONS } from '@/lib/types/zernio'
import type { ZernioAccount } from '@/lib/types/zernio'

function acct(platform: string, username: string, displayName: string): ZernioAccount {
  return { id: `${platform}_1`, platform, profileId: 'p', username, displayName, profilePicture: null, profileUrl: null }
}

function rows(connected: Record<string, ZernioAccount> = {}) {
  return SOCIAL_CHANNEL_SHORTLIST.map((platform) => ({
    platform,
    label: ZERNIO_PLATFORM_LABELS[platform],
    icon: ZERNIO_PLATFORM_ICONS[platform],
    account: connected[platform] ?? null,
  }))
}

function props(overrides: Partial<ChannelsBoardProps> = {}): ChannelsBoardProps {
  return {
    configured: true,
    gbp: { connected: false, error: false, account: null },
    socialChannels: rows(),
    cap: { allowed: true, limit: 5, current: 2 },
    entitlement: { planName: 'Premium', addonAvailable: true, addonActive: true, addonRaisesTo: 5 },
    justConnected: null,
    atLimit: null,
    routeError: null,
    ...overrides,
  }
}

describe('ChannelsBoard', () => {
  it('renders a row for each of the 5 shortlisted social platforms', () => {
    render(<ChannelsBoard {...props()} />)
    for (const platform of SOCIAL_CHANNEL_SHORTLIST) {
      expect(screen.getByText(ZERNIO_PLATFORM_LABELS[platform])).toBeTruthy()
    }
  })

  it('does NOT surface the off-shortlist platforms (X / Reddit / WhatsApp / …)', () => {
    render(<ChannelsBoard {...props()} />)
    for (const label of ['X', 'Reddit', 'WhatsApp', 'Pinterest', 'Threads', 'Snapchat', 'Discord', 'Telegram', 'Bluesky']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('shows the cap meter "{current} of {limit} social connections used"', () => {
    render(<ChannelsBoard {...props({ cap: { allowed: true, limit: 5, current: 2 } })} />)
    expect(screen.getByText(/social connections used/i)).toBeTruthy()
    // 2 and 5 are both rendered as mono-num figures.
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows a connected social row with handle + Disconnect (no Connect button)', () => {
    render(
      <ChannelsBoard
        {...props({
          cap: { allowed: true, limit: 5, current: 1 },
          socialChannels: rows({ instagram: acct('instagram', '@dreamdental', 'Dream Dental') }),
        })}
      />,
    )
    expect(screen.getByText('@dreamdental')).toBeTruthy()
    // Disconnect present for the connected platform.
    expect(screen.getAllByRole('button', { name: /Disconnect/i }).length).toBeGreaterThan(0)
  })

  it('renders Connect buttons (new tab, correct platform) for disconnected social rows under the cap', () => {
    render(<ChannelsBoard {...props({ cap: { allowed: true, limit: 5, current: 0 } })} />)
    const connect = screen.getAllByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement[]
    expect(connect.length).toBe(SOCIAL_CHANNEL_SHORTLIST.length)
    const igLink = connect.find((a) => a.getAttribute('href')?.includes('platform=instagram'))
    expect(igLink?.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=instagram')
    expect(igLink?.getAttribute('target')).toBe('_blank')
  })

  it('at the cap (Premium add-on active) → no Connect, shows a Billing CTA (no upgrade-to-Pro)', () => {
    render(
      <ChannelsBoard
        {...props({
          cap: { allowed: false, limit: 5, current: 5, reason: 'You’ve used all 5 of your social connections.' },
          entitlement: { planName: 'Premium', addonAvailable: true, addonActive: true, addonRaisesTo: 5 },
        })}
      />,
    )
    expect(screen.queryByRole('link', { name: /^Connect$/i })).toBeNull()
    expect(screen.getByText(/used all 5/i)).toBeTruthy()
    // Billing CTA present; Pro-upgrade CTA absent (already Premium + add-on).
    const billingLinks = screen.getAllByRole('link', { name: /Billing/i }) as HTMLAnchorElement[]
    expect(billingLinks.some((a) => a.getAttribute('href') === '/settings/billing')).toBe(true)
    expect(screen.queryByRole('link', { name: /Upgrade to Pro/i })).toBeNull()
  })

  it('at the cap (Pro, no add-on) → Add-more CTA points to Billing', () => {
    render(
      <ChannelsBoard
        {...props({
          cap: { allowed: false, limit: 1, current: 1, reason: 'add the add-on' },
          entitlement: { planName: 'Pro', addonAvailable: true, addonActive: false, addonRaisesTo: 3 },
        })}
      />,
    )
    const cta = screen.getByRole('link', { name: /Add more/i }) as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/settings/billing')
  })

  it('Basic plan (0 social) → upgrade-to-Pro CTA (no add-on, no Connect)', () => {
    render(
      <ChannelsBoard
        {...props({
          cap: { allowed: false, limit: 0, current: 0, reason: 'Your plan doesn’t include social connections yet. Upgrade to Pro to connect a social account.' },
          entitlement: { planName: 'Basic', addonAvailable: false, addonActive: false, addonRaisesTo: 0 },
        })}
      />,
    )
    expect(screen.queryByRole('link', { name: /^Connect$/i })).toBeNull()
    const upgrade = screen.getAllByRole('link', { name: /Upgrade to Pro/i }) as HTMLAnchorElement[]
    expect(upgrade.length).toBeGreaterThan(0)
    expect(upgrade[0].getAttribute('href')).toBe('/settings/plans')
    expect(screen.getByText(/Upgrade to Pro to connect a social account/i)).toBeTruthy()
  })

  it('GBP connected → Connect/Disconnect for Google Business + handle', () => {
    render(
      <ChannelsBoard
        {...props({ gbp: { connected: true, error: false, account: acct('googlebusiness', 'dream-dental', 'Dream Dental') } })}
      />,
    )
    expect(screen.getByText('Google Business Profile')).toBeTruthy()
    expect(screen.getByText('dream-dental')).toBeTruthy()
    // Connected GBP shows a Refresh button (exact label, distinct from the
    // social section's "I just connected — refresh").
    expect(screen.getByRole('button', { name: /^Refresh$/i })).toBeTruthy()
  })

  it('GBP disconnected (configured) → a Connect Google Business link in a new tab', () => {
    render(<ChannelsBoard {...props({ gbp: { connected: false, error: false, account: null } })} />)
    const link = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=googlebusiness')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('flashes a just-connected success message', () => {
    render(<ChannelsBoard {...props({ justConnected: 'instagram' })} />)
    expect(screen.getByText(/Instagram connected/i)).toBeTruthy()
  })

  it('flashes an at-limit notice when the route bounced a social connect off the cap', () => {
    render(<ChannelsBoard {...props({ atLimit: 'facebook', cap: { allowed: false, limit: 2, current: 2 } })} />)
    expect(screen.getByText(/Facebook wasn.t connected/i)).toBeTruthy()
  })

  it('surfaces a route error', () => {
    render(<ChannelsBoard {...props({ routeError: 'Zernio API 500' })} />)
    expect(screen.getByText('Zernio API 500')).toBeTruthy()
  })

  it('not configured → shows the not-enabled note + no Connect buttons', () => {
    render(<ChannelsBoard {...props({ configured: false })} />)
    expect(screen.getByText(/aren.t enabled on this DreamCRM instance/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Connect$/i })).toBeNull()
  })
})
