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
const startSignupCheckoutFormAction = vi.fn()
const startActivationCheckoutFormAction = vi.fn()

vi.mock('@/app/(default)/settings/actions', () => ({
  startStripeCheckoutFormAction: (...a: unknown[]) => startStripeCheckoutFormAction(...a),
  startSignupCheckoutFormAction: (...a: unknown[]) => startSignupCheckoutFormAction(...a),
}))
vi.mock('@/app/(default)/billing/activate/actions', () => ({
  startActivationCheckoutFormAction: (...a: unknown[]) => startActivationCheckoutFormAction(...a),
}))

import TrialEndedWall, { PlanPicker } from '@/components/ui/trial-ended-wall'
import { PURCHASABLE_PLANS } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'

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
  startSignupCheckoutFormAction.mockReset()
  startSignupCheckoutFormAction.mockResolvedValue({ error: null })
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

/**
 * THE WALL AS THE LAST SIGNUP STEP (owner ruling 2026-11-23: a 14-day free
 * trial, card required to sign up). A practice that signed up and has not
 * added its card meets this same component — and it must not be told its
 * trial "has ended". Nothing has started.
 */
describe('needs a card — the trial has not started', () => {
  const plan = PURCHASABLE_PLANS[0]
  const startButton = () => screen.getByRole('button', { name: new RegExp(`start my ${TRIAL_DAYS}-day free trial`, 'i') })

  it('says "start your free trial", never "your free trial has ended"', () => {
    render(<TrialEndedWall {...props({ needsCard: true })} />)
    expect(
      screen.getByRole('heading', { name: new RegExp(`one step left: start your ${TRIAL_DAYS}-day free trial`, 'i') }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/has ended/i)).not.toBeInTheDocument()
    expect(screen.getByText(/nothing is charged today/i)).toBeInTheDocument()
  })

  it('states the terms beside the button: the days, the price after, when the card is charged, how to stop', () => {
    render(<TrialEndedWall {...props({ needsCard: true })} />)
    const terms = startButton().closest('form')!
    // The price is the plan's own — resolved, never typed here.
    expect(terms).toHaveTextContent(`free for ${TRIAL_DAYS} days, then $${plan.price.toLocaleString('en-US')}/mo`)
    expect(terms).toHaveTextContent(/not charged until the trial ends/i)
    expect(terms).toHaveTextContent(/cancel before then from settings → plan & billing and you pay nothing/i)
  })

  it('the annual toggle changes the price the terms quote', () => {
    render(<TrialEndedWall {...props({ needsCard: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /Annual/i }))
    expect(startButton().closest('form')!).toHaveTextContent(`then $${plan.annualPrice.toLocaleString('en-US')}/yr`)
  })

  it('pressing it reaches checkout with the plan and interval, and a refusal lands under it', async () => {
    startStripeCheckoutFormAction.mockResolvedValue({ error: 'We couldn’t start that just now, and nothing has been charged.' })
    render(<TrialEndedWall {...props({ needsCard: true })} />)
    fireEvent.click(startButton())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nothing has been charged/i))
    const [planId, interval] = startStripeCheckoutFormAction.mock.calls[0]
    expect(planId).toBe(plan.id)
    expect(interval).toBe('monthly')
  })

  it('a non-billing staffer is told who can start it', () => {
    render(<TrialEndedWall {...props({ needsCard: true, canManageBilling: false })} />)
    expect(screen.getByText(/ask your clinic’s owner or an admin to add a card and start the trial/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /free trial/i })).not.toBeInTheDocument()
  })

  it('NO OTHER WALL OFFERS THE TRIAL: an ended trial and a canceled subscription are charged at checkout, so their buttons promise no free days', () => {
    for (const p of [props(), props({ canceled: true })]) {
      const { unmount } = render(<TrialEndedWall {...p} />)
      expect(screen.queryByRole('button', { name: /free trial/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/not charged until/i)).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('PlanPicker — where checkout returns to', () => {
  it('from the last signup step it runs the SIGNUP action, so Stripe sends the practice back to onboarding', async () => {
    render(<PlanPicker startsTrial returnTo="onboarding" />)
    fireEvent.click(screen.getByRole('button', { name: /free trial/i }))
    await waitFor(() => expect(startSignupCheckoutFormAction).toHaveBeenCalled())
    expect(startStripeCheckoutFormAction).not.toHaveBeenCalled()
    expect(startSignupCheckoutFormAction.mock.calls[0].slice(0, 2)).toEqual([PURCHASABLE_PLANS[0].id, 'monthly'])
  })

  it('from the wall it runs the ordinary action', async () => {
    render(<PlanPicker startsTrial />)
    fireEvent.click(screen.getByRole('button', { name: /free trial/i }))
    await waitFor(() => expect(startStripeCheckoutFormAction).toHaveBeenCalled())
    expect(startSignupCheckoutFormAction).not.toHaveBeenCalled()
  })
})
