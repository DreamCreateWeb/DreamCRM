import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE TRIAL-ENDED WALL'S BUTTONS ANSWER WHEN THEY REFUSE (DREAMCRM-97).
 *
 * This is the hard half of the slice and the reason it was its own 1.0 item.
 * The wall is rendered IN PLACE of the whole app for a clinic whose trial
 * expired, so its plan buttons are the last thing that practice can press —
 * and they were bare `<form action={startStripeCheckout.bind(…)}>`, with
 * nothing anywhere to read a result. Every way checkout can refuse (Stripe
 * unreachable, a price id missing from the deployment, a session with no URL,
 * a role that changed since the page rendered) produced a button that visibly
 * did nothing on the screen where that costs the most.
 *
 * These fail against the pre-fix component for a structural reason rather than
 * a wording one: there was no element to find. `useActionState` is what gives
 * the refusal somewhere to land.
 */

const startStripeCheckoutFormAction = vi.fn()
const startActivationCheckoutFormAction = vi.fn()

vi.mock('@/app/(default)/settings/actions', () => ({
  startStripeCheckoutFormAction: (...a: unknown[]) => startStripeCheckoutFormAction(...a),
}))
vi.mock('@/app/(default)/billing/activate/actions', () => ({
  startActivationCheckoutFormAction: (...a: unknown[]) => startActivationCheckoutFormAction(...a),
}))

import TrialEndedWall from '@/components/ui/trial-ended-wall'
import { PURCHASABLE_PLANS } from '@/lib/stripe-config'

function props(overrides: Record<string, unknown> = {}) {
  return {
    orgName: 'Acme Dental',
    managed: false,
    canManageBilling: true,
    ...overrides,
  } as Parameters<typeof TrialEndedWall>[0]
}

beforeEach(() => {
  startStripeCheckoutFormAction.mockReset()
  startActivationCheckoutFormAction.mockReset()
  startStripeCheckoutFormAction.mockResolvedValue({ error: null })
  startActivationCheckoutFormAction.mockResolvedValue({ error: null })
})

describe('self-serve arm — a refused purchase says why', () => {
  it('shows the action’s refusal under the plan the clinic pressed', async () => {
    startStripeCheckoutFormAction.mockResolvedValue({
      error: 'Only an owner or admin can change billing.',
    })
    render(<TrialEndedWall {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(PURCHASABLE_PLANS[0].name, 'i') }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/only an owner or admin can change billing/i),
    )
  })

  it('surfaces a Stripe-side failure the same way', async () => {
    startStripeCheckoutFormAction.mockResolvedValue({
      error: 'We couldn’t start that just now, and nothing has been charged.',
    })
    render(<TrialEndedWall {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(PURCHASABLE_PLANS[0].name, 'i') }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nothing has been charged/i))
  })

  it('shows nothing when the action does not refuse (the success path navigates)', async () => {
    render(<TrialEndedWall {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(PURCHASABLE_PLANS[0].name, 'i') }))
    await waitFor(() => expect(startStripeCheckoutFormAction).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still reaches checkout with the plan and interval the clinic chose', async () => {
    render(<TrialEndedWall {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Annual/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(PURCHASABLE_PLANS[0].name, 'i') }))
    await waitFor(() => expect(startStripeCheckoutFormAction).toHaveBeenCalled())
    const [planId, interval] = startStripeCheckoutFormAction.mock.calls[0]
    expect(planId).toBe(PURCHASABLE_PLANS[0].id)
    expect(interval).toBe('annual')
  })
})

describe('managed arm — the reserved-plan button answers too', () => {
  it('shows the activation refusal', async () => {
    startActivationCheckoutFormAction.mockResolvedValue({
      error: 'Only the clinic owner or an admin can add billing.',
    })
    render(<TrialEndedWall {...props({ managed: true })} />)

    fireEvent.click(screen.getByRole('button', { name: /Set up billing/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/only the clinic owner or an admin/i),
    )
  })
})

describe('what did not change', () => {
  it('a non-billing staffer still gets the "ask your owner" note and no buttons', () => {
    render(<TrialEndedWall {...props({ canManageBilling: false })} />)
    expect(screen.getByText(/ask your clinic’s owner or an admin/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Set up billing/i })).not.toBeInTheDocument()
  })

  it('a canceled clinic is not told it was on a trial', () => {
    render(<TrialEndedWall {...props({ canceled: true })} />)
    expect(screen.getByRole('heading', { name: /your subscription has ended/i })).toBeInTheDocument()
  })
})
