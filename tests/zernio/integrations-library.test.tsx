import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

/**
 * The Integrations app-library — the redesigned /integrations directory that
 * folds in the former /channels surface. A grid of cards across three sections
 * (Practice management · Google · Social). These tests assert each card state:
 * the Open Dental card (Connect / Manage / Premium), the Google Business card
 * (connect / connected handle / refresh / disconnect), the social cards
 * (cap-gated connect / connected / at-cap CTA), the cap meter, the coming-soon
 * PMS tiles, and the consolidated add-on management.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/integrations/actions', () => ({
  syncZernioAccountsAction: vi.fn(async () => ({ ok: true })),
  disconnectChannelAction: vi.fn(async () => ({ ok: true })),
  buySocialAddonAction: vi.fn(async () => ({ ok: true })),
  cancelSocialAddonAction: vi.fn(async () => ({ ok: true })),
}))

import IntegrationsLibrary, {
  type IntegrationsLibraryProps,
} from '@/app/(default)/integrations/integrations-library'
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

function props(overrides: Partial<IntegrationsLibraryProps> = {}): IntegrationsLibraryProps {
  return {
    zernioConfigured: true,
    pmsEligible: true,
    pms: { connected: false, errored: false, providerLabel: 'Open Dental', isDemo: false },
    gbp: { connected: false, error: false, account: null },
    socialChannels: rows(),
    cap: { allowed: true, limit: 5, current: 2 },
    entitlement: {
      planName: 'Premium',
      addonAvailable: true,
      addonActive: true,
      addonRaisesTo: 5,
      addonPriceDollars: 20,
      addonConfigured: true,
      managedBilling: false,
    },
    justConnected: null,
    atLimit: null,
    routeError: null,
    ...overrides,
  }
}

describe('IntegrationsLibrary — sections + structure', () => {
  it('renders the three grouped sections', () => {
    render(<IntegrationsLibrary {...props()} />)
    expect(screen.getByRole('heading', { name: 'Practice management' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Google' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Social' })).toBeTruthy()
  })

  it('renders a row for each of the 5 shortlisted social platforms', () => {
    render(<IntegrationsLibrary {...props()} />)
    for (const platform of SOCIAL_CHANNEL_SHORTLIST) {
      expect(screen.getByText(ZERNIO_PLATFORM_LABELS[platform])).toBeTruthy()
    }
  })

  it('does NOT surface the off-shortlist platforms (X / Reddit / WhatsApp / …)', () => {
    render(<IntegrationsLibrary {...props()} />)
    for (const label of ['Reddit', 'WhatsApp', 'Pinterest', 'Threads', 'Snapchat', 'Discord', 'Telegram', 'Bluesky']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })
})

describe('IntegrationsLibrary — Open Dental card', () => {
  it('Premium + not connected → a Connect button anchored to the connect form', () => {
    render(<IntegrationsLibrary {...props({ pmsEligible: true, pms: { connected: false, errored: false, providerLabel: 'Open Dental', isDemo: false } })} />)
    const section = screen.getByRole('heading', { name: 'Practice management' }).closest('section')!
    const connect = within(section).getByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('#connect-open-dental')
  })

  it('Premium + connected → a Manage button anchored to the detail section', () => {
    render(<IntegrationsLibrary {...props({ pms: { connected: true, errored: false, providerLabel: 'Open Dental (Sandbox)', isDemo: true } })} />)
    const section = screen.getByRole('heading', { name: 'Practice management' }).closest('section')!
    const manage = within(section).getByRole('link', { name: /^Manage$/i }) as HTMLAnchorElement
    expect(manage.getAttribute('href')).toBe('#open-dental-detail')
    expect(within(section).getByText('Connected')).toBeTruthy()
  })

  it('connected + last run errored → a "Needs attention" pill', () => {
    render(<IntegrationsLibrary {...props({ pms: { connected: true, errored: true, providerLabel: 'Open Dental', isDemo: false } })} />)
    const section = screen.getByRole('heading', { name: 'Practice management' }).closest('section')!
    expect(within(section).getByText('Needs attention')).toBeTruthy()
  })

  it('below Premium → a Premium pill + an Upgrade-to-Premium CTA (no Connect/Manage)', () => {
    render(<IntegrationsLibrary {...props({ pmsEligible: false })} />)
    const section = screen.getByRole('heading', { name: 'Practice management' }).closest('section')!
    expect(within(section).getByText('Premium')).toBeTruthy()
    const upgrade = within(section).getByRole('link', { name: /Upgrade to Premium/i }) as HTMLAnchorElement
    expect(upgrade.getAttribute('href')).toContain('/settings/plans')
    expect(within(section).queryByRole('link', { name: /^Connect$/i })).toBeNull()
    expect(within(section).queryByRole('link', { name: /^Manage$/i })).toBeNull()
  })

  it('renders the roadmap PMSs as "Coming soon" tiles', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Practice management' }).closest('section')!
    expect(within(section).getByText('Dentrix (desktop)')).toBeTruthy()
    expect(within(section).getByText('Eaglesoft')).toBeTruthy()
    expect(within(section).getByText('Curve Dental')).toBeTruthy()
    // At least one "Coming soon" availability pill.
    expect(within(section).getAllByText(/Coming soon/i).length).toBeGreaterThan(0)
    // Dentrix Ascend is "request access" (its own pill).
    expect(within(section).getByText('Dentrix Ascend')).toBeTruthy()
  })
})

describe('IntegrationsLibrary — Google Business card', () => {
  it('disconnected (configured) → a Connect Google Business link in a new tab', () => {
    render(<IntegrationsLibrary {...props({ gbp: { connected: false, error: false, account: null } })} />)
    const link = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=googlebusiness')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('connected → handle + Refresh + Disconnect (no Connect)', () => {
    render(
      <IntegrationsLibrary
        {...props({ gbp: { connected: true, error: false, account: acct('googlebusiness', 'dream-dental', 'Dream Dental') } })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Google' }).closest('section')!
    expect(within(section).getByText('dream-dental')).toBeTruthy()
    expect(within(section).getByRole('button', { name: /^Refresh$/i })).toBeTruthy()
    expect(within(section).getByRole('button', { name: /^Disconnect$/i })).toBeTruthy()
    expect(within(section).queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
  })

  it('errored connection → a "Needs attention" pill', () => {
    render(<IntegrationsLibrary {...props({ gbp: { connected: false, error: true, account: null } })} />)
    const section = screen.getByRole('heading', { name: 'Google' }).closest('section')!
    expect(within(section).getByText('Needs attention')).toBeTruthy()
  })
})

describe('IntegrationsLibrary — Social cards + cap', () => {
  it('shows the cap meter "{current} of {limit} social connections used"', () => {
    render(<IntegrationsLibrary {...props({ cap: { allowed: true, limit: 5, current: 2 } })} />)
    const meter = screen.getByText(/social connections used/i)
    // current + limit render as mono-num <strong> figures inside the meter.
    expect(meter.textContent).toMatch(/2\s*of\s*5/)
  })

  it('a connected social card shows handle + Disconnect (no Connect)', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: true, limit: 5, current: 1 },
          socialChannels: rows({ instagram: acct('instagram', '@dreamdental', 'Dream Dental') }),
        })}
      />,
    )
    expect(screen.getByText('@dreamdental')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Disconnect/i }).length).toBeGreaterThan(0)
  })

  it('disconnected social rows under the cap render Connect links (new tab, correct platform)', () => {
    render(<IntegrationsLibrary {...props({ cap: { allowed: true, limit: 5, current: 0 } })} />)
    const connect = screen.getAllByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement[]
    // 5 social + the Open Dental card's Connect = 6 (Premium + unconnected PMS).
    const igLink = connect.find((a) => a.getAttribute('href')?.includes('platform=instagram'))
    expect(igLink?.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=instagram')
    expect(igLink?.getAttribute('target')).toBe('_blank')
  })

  it('at the cap → no social Connect links, the add-on CTA shows instead', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: false, limit: 5, current: 5, reason: 'used all 5' },
          entitlement: { planName: 'Premium', addonAvailable: true, addonActive: true, addonRaisesTo: 5, addonPriceDollars: 20, addonConfigured: true, managedBilling: false },
        })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social' }).closest('section')!
    // No platform connect links in the social section (all at-limit → "At limit").
    const socialConnect = within(section).queryAllByRole('link', { name: /^Connect$/i })
    expect(socialConnect.length).toBe(0)
  })
})

describe('IntegrationsLibrary — consolidated add-on management', () => {
  it('active add-on → active pill + Cancel button', () => {
    render(<IntegrationsLibrary {...props({ entitlement: { ...props().entitlement, addonActive: true } })} />)
    expect(screen.getByText(/Add-on active/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancel add-on/i })).toBeTruthy()
  })

  it('Pro without add-on → a Buy CTA at $30/mo', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: true, limit: 1, current: 0 },
          entitlement: { planName: 'Pro', addonAvailable: true, addonActive: false, addonRaisesTo: 3, addonPriceDollars: 30, addonConfigured: true, managedBilling: false },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /Add more — \$30\/mo/i })).toBeTruthy()
  })

  it('Basic → Upgrade-to-Pro (no add-on buy)', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: false, limit: 0, current: 0, reason: 'upgrade to Pro' },
          entitlement: { planName: 'Basic', addonAvailable: false, addonActive: false, addonRaisesTo: 0, addonPriceDollars: null, addonConfigured: true, managedBilling: false },
        })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social' }).closest('section')!
    expect(within(section).getByRole('link', { name: /Upgrade to Pro/i })).toBeTruthy()
    expect(within(section).queryByRole('button', { name: /Add more/i })).toBeNull()
  })

  it('add-on not configured (env unset) → a disabled "coming soon" button in the Social section', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: true, limit: 1, current: 0 },
          entitlement: { planName: 'Pro', addonAvailable: true, addonActive: false, addonRaisesTo: 3, addonPriceDollars: 30, addonConfigured: false, managedBilling: false },
        })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social' }).closest('section')!
    const btn = within(section).getByRole('button', { name: /Add-on coming soon/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('comped clinic (managed billing) → a managed-billing message, no buy button', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: true, limit: 2, current: 0 },
          entitlement: { planName: 'Premium', addonAvailable: true, addonActive: false, addonRaisesTo: 5, addonPriceDollars: 20, addonConfigured: true, managedBilling: true },
        })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social' }).closest('section')!
    expect(within(section).getByText(/Managed billing/i)).toBeTruthy()
    expect(within(section).queryByRole('button', { name: /Add more/i })).toBeNull()
  })
})

describe('IntegrationsLibrary — flashes + config', () => {
  it('flashes a just-connected success message', () => {
    render(<IntegrationsLibrary {...props({ justConnected: 'instagram' })} />)
    expect(screen.getByText(/Instagram connected/i)).toBeTruthy()
  })

  it('flashes an at-limit notice when the route bounced a social connect off the cap', () => {
    render(<IntegrationsLibrary {...props({ atLimit: 'facebook', cap: { allowed: false, limit: 2, current: 2 } })} />)
    expect(screen.getByText(/Facebook wasn.t connected/i)).toBeTruthy()
  })

  it('surfaces a route error', () => {
    render(<IntegrationsLibrary {...props({ routeError: 'Zernio API 500' })} />)
    expect(screen.getByText('Zernio API 500')).toBeTruthy()
  })

  it('not configured → shows the not-enabled note + no Google/social Connect links', () => {
    render(<IntegrationsLibrary {...props({ zernioConfigured: false })} />)
    expect(screen.getByText(/aren.t enabled on this DreamCRM instance/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
  })
})
