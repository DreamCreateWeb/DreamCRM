/**
 * The full BookForm's closed-window "call us" fallback: when the entire
 * bookable window has no openings (server-computed `windowHasAvailability`),
 * the form leads with a prominent tel: card instead of burying the phone in a
 * side panel. The per-day slot grid + empty-day messaging still render below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

// The form's effect calls listBookingSlots on mount; stub both actions so the
// component renders without touching the server.
const listBookingSlots = vi.fn(async () => ({ slots: [], closedReason: 'day_closed' as const }))
const submitBookingRequest = vi.fn(async () => ({}) as never)
vi.mock('@/app/site/[slug]/actions', () => ({
  listBookingSlots: (...a: unknown[]) => listBookingSlots(...(a as [])),
  submitBookingRequest: (...a: unknown[]) => submitBookingRequest(...(a as [])),
}))

import BookForm from '@/app/site/[slug]/book/book-form'

const visitTypes = [{ id: 'cleaning', label: 'Cleaning', durationMinutes: 30 }]

beforeEach(() => {
  cleanup()
  listBookingSlots.mockClear()
})

describe('BookForm — closed-window fallback', () => {
  it('shows a prominent "call us" card when the whole window is closed/full and a phone exists', () => {
    render(
      <BookForm
        orgId="org_1"
        slug="acme"
        brand="#9CAF9F"
        clinicName="Acme Dental"
        clinicPhone="(555) 555-0100"
        windowHasAvailability={false}
        visitTypes={visitTypes}
      />,
    )
    expect(screen.getByText(/no online openings/i)).toBeTruthy()
    const call = screen.getByRole('link', { name: /call us at \(555\) 555-0100/i })
    expect(call.getAttribute('href')).toBe('tel:(555) 555-0100')
  })

  it('does NOT show the fallback when the window has availability', () => {
    render(
      <BookForm
        orgId="org_1"
        slug="acme"
        brand="#9CAF9F"
        clinicName="Acme Dental"
        clinicPhone="(555) 555-0100"
        windowHasAvailability={true}
        visitTypes={visitTypes}
      />,
    )
    expect(screen.queryByText(/no online openings/i)).toBeNull()
  })

  it('does NOT show the fallback when there is no phone to call (avoids a dead-end card)', () => {
    render(
      <BookForm
        orgId="org_1"
        slug="acme"
        brand="#9CAF9F"
        clinicName="Acme Dental"
        clinicPhone={null}
        windowHasAvailability={false}
        visitTypes={visitTypes}
      />,
    )
    expect(screen.queryByText(/no online openings/i)).toBeNull()
  })

  it('still renders the date/time picker below the fallback (per-day grid stays usable)', () => {
    render(
      <BookForm
        orgId="org_1"
        slug="acme"
        brand="#9CAF9F"
        clinicName="Acme Dental"
        clinicPhone="(555) 555-0100"
        windowHasAvailability={false}
        visitTypes={visitTypes}
      />,
    )
    expect(screen.getByText(/01 · Pick a date/i)).toBeTruthy()
  })

  it('renders the two optional context questions (visited-before + insurance), both optional', () => {
    render(
      <BookForm
        orgId="org_1"
        slug="acme"
        brand="#9CAF9F"
        clinicName="Acme Dental"
        clinicPhone="(555) 555-0100"
        windowHasAvailability={true}
        visitTypes={visitTypes}
      />,
    )
    const visited = screen.getByLabelText(/have you visited us before/i) as HTMLSelectElement
    const insurance = screen.getByLabelText(/do you have dental insurance/i) as HTMLSelectElement
    // Default to no answer (optional) and not `required`.
    expect(visited.value).toBe('')
    expect(visited.required).toBe(false)
    expect(insurance.value).toBe('')
    expect(insurance.required).toBe(false)
  })
})
