/**
 * FieldError — the inline, per-field error shown under an input.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldError } from '@/components/ui/field-error'

describe('FieldError', () => {
  it('renders the message as an alert with the given id', () => {
    render(<FieldError id="err-email" message="Enter a valid email address." />)
    const el = screen.getByRole('alert')
    expect(el.textContent).toBe('Enter a valid email address.')
    expect(el.id).toBe('err-email')
  })

  it('renders nothing when there is no message', () => {
    const { container } = render(<FieldError message={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})
