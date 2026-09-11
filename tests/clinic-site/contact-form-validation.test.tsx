import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Public contact form — inline field validation (Cycle-3 "finish the rollouts").
 * Required-field + email-format errors render under the field via <FieldError>
 * and the submit is blocked before the action runs; a valid submit calls through.
 */

// The action RESULT, not a bare resolve: the component branches on
// `res.ok`, so a mock resolving undefined makes it render "Something went
// wrong" while the test happily asserts the action was called.
const submit = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, data: null }))
vi.mock('@/app/site/[slug]/actions', () => ({
  submitContactRequest: (...a: unknown[]) => submit(...a),
}))

import ContactForm from '@/app/site/[slug]/contact-form'

function renderForm() {
  return render(
    <ContactForm slug="acme" brand="#2A7F8C" selfBooking={false} basePath="/site/acme" />,
  )
}

beforeEach(() => submit.mockClear())

describe('ContactForm validation', () => {
  it('blocks submit and shows required errors when name/phone are empty', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => {
      expect(screen.getByText(/Full name is required/i)).toBeTruthy()
      expect(screen.getByText(/Phone is required/i)).toBeTruthy()
    })
    expect(submit).not.toHaveBeenCalled()
  })

  it('rejects a malformed email even though email is optional', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Mia Hayes' } })
    fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: '5551234567' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(screen.getByText(/valid email address/i)).toBeTruthy())
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits when the required fields are valid', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Mia Hayes' } })
    fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: '5551234567' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    // "was called" is not "worked" — assert the form actually reached its
    // success state. Without this the test stays green while the patient is
    // looking at an error.
    expect(await screen.findByText(/thank you|we.ll be in touch|got it/i)).toBeTruthy()
  })
})
