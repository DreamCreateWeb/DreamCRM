import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

/**
 * The Integrations marketplace — reframed as a menu of FEATURE BUNDLES (Practice
 * Management / Google Business / Social Media / Patient Communications /
 * Ecommerce & Payments). Each bundle groups its catalog integrations under one
 * capability + pricing frame; connecting an individual account happens inside its
 * bundle section. These tests assert the bundle structure:
 *   - the overview "control center" header (connected count + cap meter + logos),
 *   - the five bundle sections with names + pricing badges + status pills,
 *   - member connect cards inside each bundle (with REAL brand logos),
 *   - connected members stay in-bundle with the "Active" framing + "In your
 *     dashboard" value links,
 *   - the Open Dental + GBP cards linking to their detail pages,
 *   - plan-locked bundles showing a single upgrade prompt (not per-card CTAs),
 *   - the social cap meter + consolidated add-on states,
 *   - search across member cards, flashes, not-configured.
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

import IntegrationsLibrary, { type IntegrationsLibraryProps } from '@/app/(default)/integrations/integrations-library'
import { resolveCatalog, type LiveIntegrationState, type IntegrationConnectionFact } from '@/lib/integrations/resolve'
import { resolveBundles } from '@/lib/integrations/bundles'

// ── Helpers ──────────────────────────────────────────────────────────────────

function liveState(overrides: Partial<LiveIntegrationState> = {}): LiveIntegrationState {
  return {
    pmsEligible: true,
    zernioConfigured: true,
    connections: {},
    socialCap: { allowed: true, limit: 5, current: 2 },
    ...overrides,
  }
}

function fact(connected: boolean, extra: Partial<IntegrationConnectionFact> = {}): IntegrationConnectionFact {
  return { connected, ...extra }
}

function props(
  overrides: Partial<IntegrationsLibraryProps> = {},
  state: LiveIntegrationState = liveState(),
  planTier = 'premium',
): IntegrationsLibraryProps {
  return {
    bundles: resolveBundles(resolveCatalog(state, planTier), planTier),
    zernioConfigured: state.zernioConfigured,
    planName: 'Premium',
    cap: { ...state.socialCap },
    entitlement: {
      addonAvailable: true,
      addonActive: true,
      addonRaisesTo: 5,
      addonPriceDollars: 20,
      addonConfigured: true,
      managedBilling: false,
    },
    oauthConnectHrefs: { gmail: '/inbox', stripe_connect: '/shop' },
    justConnected: null,
    atLimit: null,
    routeError: null,
    ...overrides,
  }
}

const BUNDLE_HEADINGS = [
  'Practice Management',
  'Google Business',
  'Social Media',
  'Patient Communications',
  'Ecommerce & Payments',
]

describe('IntegrationsLibrary — bundle sections', () => {
  it('renders all five feature-bundle sections', () => {
    render(<IntegrationsLibrary {...props()} />)
    for (const name of BUNDLE_HEADINGS) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
  })

  it('carries the pricing frame per bundle (Included / Pro & up / Premium + Add-on)', () => {
    render(<IntegrationsLibrary {...props()} />)
    const google = screen.getByRole('heading', { name: 'Google Business' }).closest('section')!
    expect(within(google).getByText('Included')).toBeTruthy()
    const social = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    expect(within(social).getByText('Pro & up')).toBeTruthy()
    expect(within(social).getByText('Add-on')).toBeTruthy()
    const pms = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    expect(within(pms).getByText('Premium')).toBeTruthy()
  })

  it('renders a card for each of the 5 shortlisted social platforms, inside Social Media', () => {
    render(<IntegrationsLibrary {...props()} />)
    const social = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    for (const name of ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn']) {
      expect(within(social).getByText(name)).toBeTruthy()
    }
  })

  it('does NOT surface the off-shortlist platforms (X / Reddit / WhatsApp / …)', () => {
    render(<IntegrationsLibrary {...props()} />)
    for (const label of ['Reddit', 'WhatsApp', 'Pinterest', 'Threads', 'Snapchat', 'Discord', 'Telegram', 'Bluesky']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('surfaces the real Gmail + SMS (Communications) and Stripe (Ecommerce)', () => {
    render(<IntegrationsLibrary {...props()} />)
    const comms = screen.getByRole('heading', { name: 'Patient Communications' }).closest('section')!
    expect(within(comms).getByText('Gmail')).toBeTruthy()
    expect(within(comms).getByText('Text messaging (SMS)')).toBeTruthy()
    const pay = screen.getByRole('heading', { name: 'Ecommerce & Payments' }).closest('section')!
    expect(within(pay).getByText('Stripe')).toBeTruthy()
  })
})

describe('IntegrationsLibrary — REAL brand logos', () => {
  it('renders a brand-accurate SVG logo for every social platform (not a generic icon)', () => {
    const { container } = render(<IntegrationsLibrary {...props()} />)
    for (const platform of ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']) {
      expect(container.querySelector(`svg[data-brand-logo="${platform}"]`)).toBeTruthy()
    }
  })

  it('renders the Google / Open Dental / Gmail / Stripe brand logos', () => {
    const { container } = render(<IntegrationsLibrary {...props()} />)
    expect(container.querySelector('svg[data-brand-logo="googlebusiness"]')).toBeTruthy()
    expect(container.querySelector('svg[data-brand-logo="open_dental"]')).toBeTruthy()
    expect(container.querySelector('svg[data-brand-logo="gmail"]')).toBeTruthy()
    expect(container.querySelector('svg[data-brand-logo="stripe"]')).toBeTruthy()
  })

  it('renders monogram tiles for the roadmap PMSs (no generic plug)', () => {
    const { container } = render(<IntegrationsLibrary {...props()} />)
    expect(container.querySelectorAll('svg[data-brand-logo="monogram"]').length).toBeGreaterThanOrEqual(4)
  })
})

describe('IntegrationsLibrary — overview header', () => {
  it('shows the connected count when tools are connected (in their bundles)', () => {
    const state = liveState({
      connections: {
        open_dental: fact(true, { isDemo: true, title: 'Open Dental (Sandbox)' }),
        googlebusiness: fact(true, { title: 'Dream Dental', handle: 'dream-dental' }),
        instagram: fact(true, { title: 'Dream Dental', handle: '@dreamdental' }),
      },
      socialCap: { allowed: true, limit: 5, current: 1 },
    })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const header = screen.getByText('Your connected tools').closest('section')!
    expect(within(header).getByText('3')).toBeTruthy()
    expect(within(header).getByText(/tools connected/i)).toBeTruthy()
  })

  it('shows a "nothing connected yet" prompt when nothing is connected', () => {
    render(<IntegrationsLibrary {...props()} />)
    const header = screen.getByText('Your connected tools').closest('section')!
    expect(within(header).getByText(/Nothing connected yet/i)).toBeTruthy()
  })

  it('renders the social cap meter in the overview header', () => {
    render(<IntegrationsLibrary {...props()} />)
    const header = screen.getByText('Your connected tools').closest('section')!
    expect(within(header).getByText('Social connections')).toBeTruthy()
    expect(within(header).getByText('2')).toBeTruthy()
    expect(within(header).getByText('5')).toBeTruthy()
  })
})

describe('IntegrationsLibrary — search across member cards', () => {
  it('filters cards by name (and hides non-matching bundles)', () => {
    render(<IntegrationsLibrary {...props()} />)
    const search = screen.getByLabelText('Search integrations')
    fireEvent.change(search, { target: { value: 'instagram' } })
    expect(screen.getByText('Instagram')).toBeTruthy()
    expect(screen.queryByText('Open Dental')).toBeNull()
    expect(screen.queryByText('Facebook')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Practice Management' })).toBeNull()
  })

  it('filters by keyword (not just name) — "maps" matches Google Business', () => {
    render(<IntegrationsLibrary {...props()} />)
    const search = screen.getByLabelText('Search integrations')
    fireEvent.change(search, { target: { value: 'maps' } })
    expect(screen.getByText('Google Business Profile')).toBeTruthy()
    expect(screen.queryByText('Instagram')).toBeNull()
  })

  it('shows a no-results state for a query that matches nothing', () => {
    render(<IntegrationsLibrary {...props()} />)
    const search = screen.getByLabelText('Search integrations')
    fireEvent.change(search, { target: { value: 'zzznotathing' } })
    expect(screen.getByText(/No integrations match/i)).toBeTruthy()
  })
})

describe('IntegrationsLibrary — Practice Management bundle', () => {
  it('Premium + not connected → a Connect button linking to the detail page', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    const connect = within(section).getByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/integrations/open-dental')
  })

  it('Premium + connected → the bundle is Active; the OD card shows Manage + Connected', () => {
    const state = liveState({
      connections: { open_dental: fact(true, { isDemo: true, title: 'Open Dental (Sandbox)' }) },
    })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    expect(within(section).getByText('Active')).toBeTruthy()
    const manage = within(section).getByRole('link', { name: /^Manage$/i }) as HTMLAnchorElement
    expect(manage.getAttribute('href')).toBe('/integrations/open-dental')
    expect(within(section).getByText('Connected')).toBeTruthy()
    // "Feels built-in" — the bundle header points at where its data lives.
    expect((within(section).getByRole('link', { name: /Patients/i }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/patients',
    )
  })

  it('connected + last run errored → a "Needs attention" pill', () => {
    const state = liveState({ connections: { open_dental: fact(true, { errored: true, title: 'Open Dental' }) } })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    expect(within(section).getAllByText('Needs attention').length).toBeGreaterThan(0)
  })

  it('below Premium → a single Upgrade-to-Premium prompt, no per-account Connect cards', () => {
    const state = liveState({ pmsEligible: false })
    render(<IntegrationsLibrary {...props({}, state, 'basic')} />)
    const section = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    const upgrade = within(section).getByRole('link', { name: /Upgrade to Premium/i }) as HTMLAnchorElement
    expect(upgrade.getAttribute('href')).toContain('/settings/plans')
    // The plan-locked bundle hides its member cards (no Open Dental / roadmap tiles).
    expect(within(section).queryByText('Open Dental')).toBeNull()
    expect(within(section).queryByRole('link', { name: /^Connect$/i })).toBeNull()
  })

  it('Premium → the roadmap PMSs render as request-access / coming-soon tiles', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Practice Management' }).closest('section')!
    expect(within(section).getByText('Dentrix (desktop)')).toBeTruthy()
    expect(within(section).getByText('Eaglesoft')).toBeTruthy()
    expect(within(section).getByText('Curve Dental')).toBeTruthy()
    expect(within(section).getAllByText(/Coming soon/i).length).toBeGreaterThan(0)
    expect(within(section).getByText('Dentrix Ascend')).toBeTruthy()
    expect(within(section).getAllByText(/Request access/i).length).toBeGreaterThan(0)
  })
})

describe('IntegrationsLibrary — Google Business bundle', () => {
  it('disconnected (configured) → a Connect Google Business link in a new tab', () => {
    render(<IntegrationsLibrary {...props()} />)
    const link = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=googlebusiness')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('connected → handle + Manage (detail link) + Refresh + Disconnect + value links in the header', () => {
    const state = liveState({
      connections: { googlebusiness: fact(true, { title: 'Dream Dental', handle: 'dream-dental' }) },
    })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Google Business' }).closest('section')!
    expect(within(section).getByText('dream-dental')).toBeTruthy()
    const manage = within(section).getByRole('link', { name: /^Manage$/i }) as HTMLAnchorElement
    expect(manage.getAttribute('href')).toBe('/integrations/google-business')
    expect(within(section).getByRole('button', { name: /^Refresh$/i })).toBeTruthy()
    expect(within(section).getByRole('button', { name: /^Disconnect$/i })).toBeTruthy()
    expect(within(section).queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
    // The bundle header carries the "where it shows up" links once (not per card).
    expect((within(section).getByRole('link', { name: /Reviews/i }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/reviews/received',
    )
    expect((within(section).getByRole('link', { name: /Local search/i }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/seo',
    )
  })

  it('errored connection → a "Needs attention" pill', () => {
    const state = liveState({ connections: { googlebusiness: fact(false, { errored: true }) } })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Google Business' }).closest('section')!
    expect(within(section).getAllByText('Needs attention').length).toBeGreaterThan(0)
  })
})

describe('IntegrationsLibrary — Gmail + Stripe (first-party OAuth link-out)', () => {
  it('Gmail disconnected → a Connect link to the inbox setup flow', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Patient Communications' }).closest('section')!
    const gmailCard = within(section).getByText('Gmail').closest('.v2-card-interactive')!
    const connect = within(gmailCard as HTMLElement).getByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/inbox')
  })

  it('Gmail connected → handle + a Manage link to the inbox', () => {
    const state = liveState({ connections: { gmail: fact(true, { title: 'hello@clinic.com' }) } })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Patient Communications' }).closest('section')!
    expect(within(section).getByText('hello@clinic.com')).toBeTruthy()
    const manage = within(section).getByRole('link', { name: /^Manage$/i }) as HTMLAnchorElement
    expect(manage.getAttribute('href')).toBe('/inbox')
  })

  it('Stripe disconnected → a Connect link to the shop setup flow', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Ecommerce & Payments' }).closest('section')!
    const connect = within(section).getByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/shop')
  })
})

describe('IntegrationsLibrary — SMS coming-soon', () => {
  it('SMS renders a coming-soon tile (no connect affordance)', () => {
    render(<IntegrationsLibrary {...props()} />)
    const section = screen.getByRole('heading', { name: 'Patient Communications' }).closest('section')!
    const smsCard = within(section).getByText('Text messaging (SMS)').closest('.v2-card-interactive')!
    expect(within(smsCard as HTMLElement).getByText(/Coming soon/i)).toBeTruthy()
    expect(within(smsCard as HTMLElement).queryByRole('link', { name: /^Connect$/i })).toBeNull()
  })
})

describe('IntegrationsLibrary — Social cards + cap', () => {
  it('a connected social card shows handle + Disconnect (no Connect)', () => {
    const state = liveState({
      connections: { instagram: fact(true, { title: 'Dream Dental', handle: '@dreamdental' }) },
      socialCap: { allowed: true, limit: 5, current: 1 },
    })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const section = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    expect(within(section).getByText('@dreamdental')).toBeTruthy()
    expect(within(section).getAllByRole('button', { name: /Disconnect/i }).length).toBeGreaterThan(0)
    // Active bundle → the composer link lives in the bundle header.
    expect((within(section).getByRole('link', { name: /Social Posts/i }) as HTMLAnchorElement).getAttribute('href')).toBe(
      '/social-posts',
    )
  })

  it('disconnected social rows under the cap render Connect links (new tab, correct platform)', () => {
    const state = liveState({ socialCap: { allowed: true, limit: 5, current: 0 } })
    render(<IntegrationsLibrary {...props({}, state)} />)
    const connect = screen.getAllByRole('link', { name: /^Connect$/i }) as HTMLAnchorElement[]
    const igLink = connect.find((a) => a.getAttribute('href')?.includes('platform=instagram'))
    expect(igLink?.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=instagram')
    expect(igLink?.getAttribute('target')).toBe('_blank')
  })

  it('at the cap → no social Connect links, the add-on CTA shows instead', () => {
    const state = liveState({ socialCap: { allowed: false, limit: 5, current: 5 } })
    render(<IntegrationsLibrary {...props({ cap: { allowed: false, limit: 5, current: 5, reason: 'used all 5' } }, state)} />)
    const section = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    const socialConnect = within(section)
      .queryAllByRole('link', { name: /^Connect$/i })
      .filter((a) => a.getAttribute('href')?.includes('/api/integrations/zernio/connect'))
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
    const state = liveState({ socialCap: { allowed: true, limit: 1, current: 0 } })
    render(
      <IntegrationsLibrary
        {...props(
          {
            planName: 'Pro',
            cap: { allowed: true, limit: 1, current: 0 },
            entitlement: { addonAvailable: true, addonActive: false, addonRaisesTo: 3, addonPriceDollars: 30, addonConfigured: true, managedBilling: false },
          },
          state,
          'pro',
        )}
      />,
    )
    expect(screen.getByRole('button', { name: /Add more — \$30\/mo/i })).toBeTruthy()
  })

  it('Basic → the Social bundle is plan-locked (Upgrade to Pro prompt, no add-on buy)', () => {
    const state = liveState({ pmsEligible: false, socialCap: { allowed: false, limit: 0, current: 0 } })
    render(
      <IntegrationsLibrary
        {...props(
          {
            planName: 'Basic',
            cap: { allowed: false, limit: 0, current: 0, reason: 'upgrade to Pro' },
            entitlement: { addonAvailable: false, addonActive: false, addonRaisesTo: 0, addonPriceDollars: null, addonConfigured: true, managedBilling: false },
          },
          state,
          'basic',
        )}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    expect(within(section).getByRole('link', { name: /Upgrade to Pro/i })).toBeTruthy()
    expect(within(section).queryByRole('button', { name: /Add more/i })).toBeNull()
  })

  it('add-on not configured (env unset) → a disabled "coming soon" button in the Social bundle', () => {
    const state = liveState({ socialCap: { allowed: true, limit: 1, current: 0 } })
    render(
      <IntegrationsLibrary
        {...props(
          {
            planName: 'Pro',
            cap: { allowed: true, limit: 1, current: 0 },
            entitlement: { addonAvailable: true, addonActive: false, addonRaisesTo: 3, addonPriceDollars: 30, addonConfigured: false, managedBilling: false },
          },
          state,
          'pro',
        )}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
    const btn = within(section).getByRole('button', { name: /Add-on coming soon/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('comped clinic (managed billing) → a managed-billing message, no buy button', () => {
    render(
      <IntegrationsLibrary
        {...props({
          cap: { allowed: true, limit: 2, current: 0 },
          entitlement: { addonAvailable: true, addonActive: false, addonRaisesTo: 5, addonPriceDollars: 20, addonConfigured: true, managedBilling: true },
        })}
      />,
    )
    const section = screen.getByRole('heading', { name: 'Social Media' }).closest('section')!
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
    const state = liveState({ zernioConfigured: false })
    render(<IntegrationsLibrary {...props({ zernioConfigured: false }, state)} />)
    expect(screen.getByText(/aren.t enabled on this DreamCRM instance/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Connect Google Business/i })).toBeNull()
  })
})
