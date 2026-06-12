import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import LeadFormBuilder from '@/app/(default)/website/lead-form-builder'
import HoursEditor from '@/app/(default)/website/hours-editor'
import type { LeadFormField } from '@/lib/types/lead-forms'

/**
 * Inline validation shown in the Studio editors BEFORE save, mirroring the
 * server rules so the owner doesn't round-trip to discover a problem.
 */

describe('LeadFormBuilder — inline validation', () => {
  const withContact: LeadFormField[] = [
    { id: 'f1', type: 'tel', label: 'Phone', required: true, systemKey: 'phone' },
  ]
  const noContact: LeadFormField[] = [
    { id: 'f1', type: 'text', label: 'Name', required: true },
  ]

  it('warns when no email/phone field is present', () => {
    render(<LeadFormBuilder formKey="contact" defaultValue={noContact} />)
    expect(screen.getByRole('alert').textContent).toMatch(/email or phone/i)
  })

  it('shows no warning for a valid form with a reachable field', () => {
    render(<LeadFormBuilder formKey="contact" defaultValue={withContact} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns when there are no fields at all', () => {
    render(<LeadFormBuilder formKey="contact" defaultValue={[]} />)
    expect(screen.getByRole('alert').textContent).toMatch(/at least one field/i)
  })
})

describe('HoursEditor — inline validation', () => {
  it('flags an open day where open is not before close', () => {
    render(
      <HoursEditor defaultValue={{ mon: { open: '17:00', close: '09:00' } }} />,
    )
    expect(screen.getByText(/before close time/i)).toBeInTheDocument()
  })

  it('flags an open day missing a time', () => {
    render(<HoursEditor defaultValue={{ tue: { open: '09:00', close: '' } }} />)
    expect(screen.getByText(/open and close/i)).toBeInTheDocument()
  })

  it('clears the error when the day is marked closed', () => {
    render(<HoursEditor defaultValue={{ wed: { open: '17:00', close: '09:00' } }} />)
    expect(screen.getByText(/before close time/i)).toBeInTheDocument()
    // Toggle "Closed" for Wednesday.
    const wedClosed = screen.getByLabelText('Wednesday open').parentElement!.parentElement!
      .querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(wedClosed)
    expect(screen.queryByText(/before close time/i)).not.toBeInTheDocument()
  })
})
