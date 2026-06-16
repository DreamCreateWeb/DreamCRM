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
    expect(screen.getByText(/pick your plan when you set up billing/i)).toBeInTheDocument()
    // No price / no "checkout" at signup — it's a no-card trial now.
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

  it('makes the no-card free-trial promise (no checkout at signup)', () => {
    render(<SignUpForm />)
    expect(screen.getByText(/no credit card required/i)).toBeInTheDocument()
  })
})
