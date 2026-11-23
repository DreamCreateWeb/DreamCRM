import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: { value: new URLSearchParams() },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.value,
}))
vi.mock('@/lib/auth-client', () => ({
  signUp: { email: vi.fn() },
}))

import SignUpForm from '@/app/(auth)/signup/signup-form'

beforeEach(() => {
  mockSearchParams.value = new URLSearchParams()
})

describe('SignUpForm (dental, not Mosaic template)', () => {
  it('asks for name, work email, optional practice name, and password — no template Role dropdown', () => {
    render(<SignUpForm />)
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/practice name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    // The Mosaic template junk is gone.
    expect(screen.queryByText('Designer')).toBeNull()
    expect(screen.queryByText(/your role/i)).toBeNull()
    expect(screen.queryByText(/newsletter|product news/i)).toBeNull()
  })

  it('reflects the plan picked on /pricing (?plan=pro) as a trial interest, not a charge', () => {
    mockSearchParams.value = new URLSearchParams('plan=pro')
    render(<SignUpForm />)
    expect(screen.getByText(/interested in pro/i)).toBeInTheDocument()
    // The plan interest is answered with the trial's real terms: the card
    // comes on the last step and is not charged until the trial ends.
    expect(screen.getByText(/start with a 14-day free trial\. You add a card on the last step/i)).toBeInTheDocument()
    // No price at signup — nothing is charged here.
    expect(screen.queryByText(/\$149\/mo/)).toBeNull()
    expect(screen.queryByText(/checkout comes after/i)).toBeNull()
  })

  it('reflects the picked plan name (premium)', () => {
    mockSearchParams.value = new URLSearchParams('plan=premium&interval=annual')
    render(<SignUpForm />)
    expect(screen.getByText(/interested in premium/i)).toBeInTheDocument()
  })

  it('ignores junk plan params (no plan banner)', () => {
    mockSearchParams.value = new URLSearchParams('plan=enterprise-mega')
    render(<SignUpForm />)
    expect(screen.queryByText(/interested in/i)).toBeNull()
  })

  it('states the trial as it is: 14 days, a card on the last step, not charged until it ends — never "no card"', () => {
    // Owner ruling 2026-11-23. This line used to promise "no credit card
    // required", which a signup would now disprove three screens later.
    const { container } = render(<SignUpForm />)
    expect(container).toHaveTextContent(/14-day free trial\. You add a card on the last step/i)
    expect(container).toHaveTextContent(/not charged until the trial ends, and you\s+can cancel before then in Settings/i)
    expect(container).not.toHaveTextContent(/no (credit )?card/i)
  })
})
