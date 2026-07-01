import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import SocialConnectionsCard, {
  type SocialConnectionsCardProps,
} from '@/app/(default)/settings/billing/social-connections-card'

/**
 * The Settings → Billing "Social connections" card is now a SLIM summary that
 * links to the Integrations app-library (the canonical place to buy/cancel the
 * add-on + manage channels — no competing full add-on widget here). These tests
 * assert the entitlement summary + the state-aware nudge + the cross-link. The
 * buy/cancel BEHAVIOR is covered on the Integrations surface
 * (tests/zernio/integrations-library.test.tsx).
 */
function props(overrides: Partial<SocialConnectionsCardProps> = {}): SocialConnectionsCardProps {
  return {
    planName: 'Pro',
    socialLimit: 1,
    addonActive: false,
    addonAvailable: true,
    addonPriceDollars: 30,
    addonRaisesTo: 3,
    addonConfigured: true,
    managedBilling: false,
    ...overrides,
  }
}

describe('SocialConnectionsCard (Billing summary)', () => {
  it('shows the current entitlement incl. Google Business + the total', () => {
    render(<SocialConnectionsCard {...props()} />)
    expect(screen.getByRole('heading', { name: /Social connections/i })).toBeTruthy()
    // The total (2) is styled in its own font-mono-num span, so match the phrase
    // that carries the "including Google Business" framing.
    expect(screen.getByText(/total including Google Business/i)).toBeTruthy()
  })

  it('links to Integrations to manage the add-on (no competing buy/cancel buttons here)', () => {
    render(<SocialConnectionsCard {...props()} />)
    const link = screen.getByRole('link', { name: /Manage on Integrations/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/integrations')
    // No competing add-on widget on the billing card anymore.
    expect(screen.queryByRole('button', { name: /Add for/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel add-on/i })).toBeNull()
  })

  it('Pro without add-on nudges with the add-on price', () => {
    render(<SocialConnectionsCard {...props()} />)
    expect(screen.getByText(/Add more for \$30\/mo/i)).toBeTruthy()
  })

  it('active add-on shows the active pill', () => {
    render(<SocialConnectionsCard {...props({ addonActive: true, socialLimit: 3 })} />)
    expect(screen.getByText(/Add-on active/i)).toBeTruthy()
    expect(screen.getByText(/add-on is active/i)).toBeTruthy()
  })

  it('Basic surfaces the Pro-plan path', () => {
    render(
      <SocialConnectionsCard
        {...props({ planName: 'Basic', socialLimit: 0, addonAvailable: false, addonPriceDollars: null })}
      />,
    )
    expect(screen.getByText(/start on the Pro plan/i)).toBeTruthy()
  })

  it('shows "coming soon" copy when the Stripe prices are not configured', () => {
    render(<SocialConnectionsCard {...props({ addonConfigured: false })} />)
    // "Coming soon" now shows on both the status pill and the nudge line.
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0)
  })

  it('shows the managed-billing message for a comped clinic', () => {
    render(<SocialConnectionsCard {...props({ managedBilling: true })} />)
    // "Managed billing" shows on both the status pill and the nudge line.
    expect(screen.getAllByText(/managed billing/i).length).toBeGreaterThan(0)
  })
})
