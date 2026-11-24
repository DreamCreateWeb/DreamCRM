import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE TRIAL STRIP SAYS WHICH TRIAL IT IS.
 *
 * Until the 2026-11-23 ruling (14 days, card required to sign up) there was
 * one trial and one strip: "full access, no card on file — set up billing",
 * turning amber, orange and red as the end came near. A practice that has
 * ALREADY given us its card must not read any of that. Its trial becomes a
 * subscription by itself; a red strip asking it to "Activate now" reads as a
 * failed payment, and "no card on file" is simply false.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import TrialBanner from '@/components/ui/trial-banner'
import type { TenantContext } from '@/lib/auth/context'

const inDays = (n: number) => new Date(Date.now() + (n - 0.5) * 86_400_000)

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantType: 'clinic',
    role: 'owner',
    onTrial: true,
    trialEndsAt: inDays(9),
    ...over,
  } as TenantContext
}

describe('a trial with the card on file', () => {
  it('says when the card is charged and where to cancel — and asks for nothing', () => {
    const { container } = render(<TrialBanner ctx={ctx({ trialCardOnFile: true })} />)
    expect(container).toHaveTextContent('9 days left in your free trial — your card is charged when it ends.')
    expect(container).toHaveTextContent(/cancel any time before then in settings/i)
    expect(container).not.toHaveTextContent(/no card on file/i)
    expect(container).not.toHaveTextContent(/set up billing|activate now/i)
    expect(screen.getByRole('link', { name: /billing/i })).toHaveAttribute('href', '/settings/billing')
  })

  it('stays calm on its last day — nothing is wrong, so nothing turns red', () => {
    const { container } = render(<TrialBanner ctx={ctx({ trialCardOnFile: true, trialEndsAt: inDays(1) })} />)
    const strip = container.firstElementChild as HTMLElement
    expect(strip.className).toMatch(/violet/)
    expect(strip.className).not.toMatch(/rose|orange|amber/)
    expect(container).toHaveTextContent(/ends tomorrow — your card is charged then/i)
  })

  it('a non-billing staffer sees the fact without the cancel line or the link', () => {
    const { container } = render(<TrialBanner ctx={ctx({ trialCardOnFile: true, role: 'member' })} />)
    expect(container).toHaveTextContent(/your card is charged when it ends/i)
    expect(container).not.toHaveTextContent(/cancel any time/i)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('a NO-card trial is unchanged', () => {
  it('still says no card is on file and asks for billing to be set up', () => {
    const { container } = render(<TrialBanner ctx={ctx()} />)
    expect(container).toHaveTextContent(/full access, no card on file/i)
    expect(screen.getByRole('link', { name: /set up billing/i })).toHaveAttribute('href', '/settings/billing')
  })

  it('still escalates as the end nears', () => {
    const { container } = render(<TrialBanner ctx={ctx({ trialEndsAt: inDays(1) })} />)
    expect((container.firstElementChild as HTMLElement).className).toMatch(/orange/)
    expect(screen.getByRole('link', { name: /activate now/i })).toBeInTheDocument()
  })
})

describe('who never sees it', () => {
  it('a clinic not on a trial, and any non-clinic tenant', () => {
    expect(render(<TrialBanner ctx={ctx({ onTrial: false })} />).container).toBeEmptyDOMElement()
    expect(render(<TrialBanner ctx={ctx({ tenantType: 'platform' })} />).container).toBeEmptyDOMElement()
  })
})
