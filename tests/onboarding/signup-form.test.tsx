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

  it('shows the picked plan from /pricing (?plan=pro)', () => {
    mockSearchParams.value = new URLSearchParams('plan=pro')
    render(<SignUpForm />)
    expect(screen.getByText(/pro plan/i)).toBeInTheDocument()
    expect(screen.getByText(/\$149\/mo/)).toBeInTheDocument()
    expect(screen.getByText(/checkout comes after a quick setup/i)).toBeInTheDocument()
  })

  it('shows annual pricing when the interval is annual', () => {
    mockSearchParams.value = new URLSearchParams('plan=premium&interval=annual')
    render(<SignUpForm />)
    expect(screen.getByText(/premium plan/i)).toBeInTheDocument()
    expect(screen.getByText(/\$1,990\/yr/)).toBeInTheDocument()
  })

  it('ignores junk plan params', () => {
    mockSearchParams.value = new URLSearchParams('plan=enterprise-mega')
    render(<SignUpForm />)
    expect(screen.queryByText(/checkout comes after/i)).toBeNull()
  })

  it('keeps the honest no-charge-yet promise', () => {
    render(<SignUpForm />)
    expect(screen.getByText(/card isn.t charged until you pick a plan/i)).toBeInTheDocument()
  })
})
