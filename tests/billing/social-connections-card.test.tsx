import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(default)/settings/actions', () => ({
  buySocialAddonAction: vi.fn(async () => ({ ok: true })),
  cancelSocialAddonAction: vi.fn(async () => ({ ok: true })),
}))

import SocialConnectionsCard, {
  type SocialConnectionsCardProps,
} from '@/app/(default)/settings/billing/social-connections-card'

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

describe('SocialConnectionsCard', () => {
  it('shows the current entitlement incl. Google Business + the total', () => {
    render(<SocialConnectionsCard {...props()} />)
    expect(screen.getByRole('heading', { name: /Social connections/i })).toBeTruthy()
    expect(screen.getByText(/2 total including Google Business/i)).toBeTruthy()
  })

  it('Pro without add-on shows a Buy CTA at $30/mo', () => {
    render(<SocialConnectionsCard {...props()} />)
    expect(screen.getByRole('button', { name: /Add for \$30\/mo/i })).toBeTruthy()
  })

  it('active add-on shows the active pill + a Cancel button', () => {
    render(<SocialConnectionsCard {...props({ addonActive: true, socialLimit: 3 })} />)
    expect(screen.getByText(/Add-on active/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancel add-on/i })).toBeTruthy()
  })

  it('Basic shows the Upgrade-to-Pro path and no buy button', () => {
    render(
      <SocialConnectionsCard
        {...props({ planName: 'Basic', socialLimit: 0, addonAvailable: false, addonPriceDollars: null })}
      />,
    )
    expect(screen.getByRole('link', { name: /Upgrade to Pro/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add for/i })).toBeNull()
  })

  it('shows "coming soon" (disabled) when the Stripe prices are not configured', () => {
    render(<SocialConnectionsCard {...props({ addonConfigured: false })} />)
    const btn = screen.getByRole('button', { name: /coming soon/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('shows the managed-billing message for a comped clinic', () => {
    render(<SocialConnectionsCard {...props({ managedBilling: true })} />)
    expect(screen.getByText(/managed billing/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add for/i })).toBeNull()
  })
})
