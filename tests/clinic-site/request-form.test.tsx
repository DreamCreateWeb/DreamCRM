import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { isSelfBookingEnabled } from '@/lib/clinic-site-helpers'

// Stub the server action so the form renders + submits without the server graph.
const submitAppointmentRequest = vi.fn(async () => undefined)
vi.mock('@/app/site/[slug]/actions', () => ({
  submitAppointmentRequest: (...a: unknown[]) => submitAppointmentRequest(...(a as [])),
}))

import RequestForm from '@/app/site/[slug]/book/request-form'

const visitTypes = [
  { id: 'cleaning', label: 'Cleaning', durationMinutes: 30 },
  { id: 'whitening', label: 'Teeth Whitening', durationMinutes: 60 },
]

beforeEach(() => {
  cleanup()
  submitAppointmentRequest.mockClear()
})

describe('RequestForm (self-booking off)', () => {
  function renderForm() {
    return render(
      <RequestForm slug="acme" brand="#2A7F8C" clinicName="Acme Dental" clinicPhone="(555) 555-0100" visitTypes={visitTypes} />,
    )
  }

  it('requires email but NOT phone, and shows no date/time picker', () => {
    renderForm()
    const email = screen.getByPlaceholderText('Email') as HTMLInputElement
    expect(email.required).toBe(true)
    expect(email.type).toBe('email')

    const phone = screen.getByPlaceholderText(/phone number \(optional\)/i) as HTMLInputElement
    expect(phone.required).toBe(false)

    // The whole point of request-only mode: no calendar / slot grid.
    expect(screen.queryByText(/pick a date/i)).toBeNull()
    expect(screen.queryByText(/pick a time/i)).toBeNull()
    expect(screen.queryByLabelText(/previous days/i)).toBeNull()
  })

  it('offers the clinic visit types as an optional reason dropdown', () => {
    renderForm()
    const select = screen.getByLabelText(/what do you need\?/i)
    expect(select).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Cleaning' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Teeth Whitening' })).toBeTruthy()
  })

  it('submits the request and shows the "Request received" confirmation', async () => {
    renderForm()
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jordan' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Park' } })
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'jordan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => expect(submitAppointmentRequest).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/request received/i)).toBeTruthy()
    // Confirmation names the clinic + offers the phone fallback.
    expect(screen.getByText(/Acme Dental/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: '(555) 555-0100' }).getAttribute('href')).toBe('tel:(555) 555-0100')
  })

  it('surfaces a server error inline without flipping to success', async () => {
    submitAppointmentRequest.mockRejectedValueOnce(new Error('Our scheduler is temporarily unavailable'))
    renderForm()
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jordan' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Park' } })
    // Valid email so the form actually submits (happy-dom blocks submit on an
    // invalid required field); the rejection simulates a server-side failure.
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'jordan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByText(/temporarily unavailable/i)).toBeTruthy()
    expect(screen.queryByText(/request received/i)).toBeNull()
  })
})

describe('isSelfBookingEnabled', () => {
  it('treats null/undefined/missing as ENABLED (matches the default(true) column)', () => {
    expect(isSelfBookingEnabled(null)).toBe(true)
    expect(isSelfBookingEnabled(undefined)).toBe(true)
    expect(isSelfBookingEnabled({})).toBe(true)
    expect(isSelfBookingEnabled({ selfBookingEnabled: null })).toBe(true)
  })

  it('is true when explicitly enabled, false ONLY when explicitly disabled', () => {
    expect(isSelfBookingEnabled({ selfBookingEnabled: true })).toBe(true)
    expect(isSelfBookingEnabled({ selfBookingEnabled: false })).toBe(false)
  })
})
