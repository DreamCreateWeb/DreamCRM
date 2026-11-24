import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE LAST SCREEN OF SIGNUP IS ONE OF TWO SCREENS.
 *
 * Owner ruling 2026-11-23: a 14-day free trial, card required to sign up. So
 * `/onboarding-complete` is the CARD STEP for a practice that has not added
 * its card, and the "your site is ready" screen once the trial has started.
 *
 * What is pinned, because each is a way this page could lie or cost money:
 *
 *  - a practice without a card is never told its site is ready or sent on to
 *    the AI interview — the trial has not started;
 *  - the card step says what the card costs today (nothing), what happens
 *    when the trial ends, and that reminders come first — the terms agreed
 *    to on the next screen, written before it;
 *  - back from a COMPLETED checkout the subscription is synced before
 *    anything renders, then the request is redirected to a clean URL;
 *  - back from a completed checkout whose sync has not landed, NO card form
 *    is shown — offering it twice is how a practice gets two subscriptions.
 */

const h = vi.hoisted(() => ({
  ctx: null as Record<string, unknown> | null,
  sync: vi.fn(async (..._a: unknown[]) => true),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: (url: string) => h.redirect(url) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/session', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/auth/context', () => ({ getTenantContext: vi.fn(async () => h.ctx) }))
vi.mock('@/lib/services/billing', () => ({ syncCheckoutSuccess: (...a: unknown[]) => h.sync(...a) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))
vi.mock('@/app/(default)/settings/actions', () => ({
  startStripeCheckoutFormAction: vi.fn(async () => ({ error: null })),
  startSignupCheckoutFormAction: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/app/(default)/billing/activate/actions', () => ({
  startActivationCheckoutFormAction: vi.fn(async () => ({ error: null })),
}))
// The frame's chrome is not the subject.
vi.mock('@/app/(onboarding)/onboarding-header', () => ({ default: () => null }))
vi.mock('@/app/(onboarding)/onboarding-image', () => ({ default: () => null }))

import OnboardingComplete from '@/app/(onboarding)/onboarding-complete/page'
import { TRIAL_DAYS } from '@/lib/trial'

const clinic = (over: Record<string, unknown> = {}) => ({
  tenantType: 'clinic',
  role: 'owner',
  organizationId: 'org_1',
  organizationName: 'Maple Dental',
  organizationSlug: 'maple-dental',
  ...over,
})

async function page(params: Record<string, string> = {}) {
  return render(await OnboardingComplete({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  h.ctx = null
  h.sync.mockClear()
  h.redirect.mockClear()
})

describe('a practice that has not added its card — the card step', () => {
  beforeEach(() => {
    h.ctx = clinic({ trialNeedsCard: true, trialExpired: true })
  })

  it('is step 4 of 4, asks for the card, and does NOT say the site is ready or offer the interview', async () => {
    await page()
    expect(screen.getByText('4 of 4')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: new RegExp(`one step left: start your ${TRIAL_DAYS}-day free trial`, 'i') }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add a card & start my 14-day free trial/i })).toBeInTheDocument()
    expect(screen.queryByText(/your site is ready/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /build my website with ai/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /go to dashboard/i })).not.toBeInTheDocument()
  })

  it('says the terms before the checkout page does: nothing today, cancel any time, charged at the end, reminded first', async () => {
    const { container } = await page()
    expect(container).toHaveTextContent(/Today: nothing\. Your card is saved, not charged\./)
    expect(container).toHaveTextContent(/For 14 days: everything is switched on\. Cancel any time from Settings → Plan & billing\./)
    expect(container).toHaveTextContent(/When the trial ends: your plan starts and the card is charged\./)
    // A promise the reminder sweep keeps (d7 + d1 for a card-on-file trial).
    expect(container).toHaveTextContent(/We email you a week before and again the day before\./)
  })

  it('names the practice, so the person knows what they are opening', async () => {
    const { container } = await page()
    expect(container).toHaveTextContent(/Maple Dental is set up and your website draft is waiting/)
  })

  it('back from a CANCELLED checkout: says nothing was charged, and the card form is still there', async () => {
    const { container } = await page({ checkout: 'cancelled' })
    expect(container).toHaveTextContent(/No card was added and nothing was charged/)
    expect(screen.getByRole('button', { name: /start my 14-day free trial/i })).toBeInTheDocument()
  })

  it('back from a COMPLETED checkout the row still awaits a card: NO second card form — only "check again"', async () => {
    const { container } = await page({ checkout: 'success' })
    expect(screen.getByRole('heading', { name: /opening your free trial/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /free trial/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /check again/i })).toHaveAttribute('href', '/onboarding-complete?checkout=success')
    expect(container).toHaveTextContent(/You have not been charged/)
    // The only help offered is one that works from behind the wall.
    expect(screen.getByRole('link', { name: /hello@/i })).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
  })

  it('a member who cannot manage billing is told who can', async () => {
    h.ctx = clinic({ trialNeedsCard: true, trialExpired: true, role: 'member' })
    await page()
    expect(screen.getByText(/ask your clinic’s owner or an admin to add a card and start the trial/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /free trial/i })).not.toBeInTheDocument()
  })
})

describe('returning from Stripe Checkout', () => {
  it('syncs the subscription for THIS org first, then redirects to a clean URL — before rendering anything', async () => {
    h.ctx = clinic({ trialNeedsCard: true, trialExpired: true })
    await expect(page({ checkout: 'success', session_id: 'cs_123' })).rejects.toThrow(
      'REDIRECT:/onboarding-complete?checkout=success',
    )
    expect(h.sync).toHaveBeenCalledWith('org_1', 'cs_123')
  })

  it('does not sync without a session id, or for a cancelled checkout', async () => {
    h.ctx = clinic({ trialNeedsCard: true, trialExpired: true })
    await page({ checkout: 'success' })
    await page({ checkout: 'cancelled', session_id: 'cs_123' })
    expect(h.sync).not.toHaveBeenCalled()
  })
})

describe('once the trial has started — the site-is-ready screen', () => {
  it('says the site is ready, and the day the card is charged in the clinic’s own calendar', async () => {
    // 03:30 UTC on the 8th is the evening of the 7th in Chicago.
    h.ctx = clinic({ onTrial: true, trialCardOnFile: true, trialEndsAt: new Date('2026-12-08T03:30:00Z') })
    const { container } = await page({ checkout: 'success' })
    expect(screen.getByRole('heading', { name: /maple dental — your site is ready/i })).toBeInTheDocument()
    expect(container).toHaveTextContent(
      'Your free trial has started. It ends on Dec 7, 2026 — your card is charged then, and not before.',
    )
    expect(screen.getByRole('link', { name: /build my website with ai/i })).toHaveAttribute('href', '/welcome')
    expect(screen.queryByRole('button', { name: /free trial/i })).not.toBeInTheDocument()
  })

  it('a clinic that is not on a card-on-file trial gets no charge-date line it does not have', async () => {
    h.ctx = clinic({ onTrial: true, trialCardOnFile: false, trialEndsAt: new Date('2026-12-08T03:30:00Z') })
    const { container } = await page()
    expect(screen.getByRole('heading', { name: /your site is ready/i })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/your card is charged/i)
  })
})
