/**
 * The post-booking success screen. Confirms the date/time/type, surfaces a
 * maps link + "Add to calendar" (.ics) + "what to expect" line, and — when the
 * clinic has a default intake form — a prominent "Fill out your intake form
 * now" CTA. Phone-only bookers (no email) get the SAME screen plus a "we'll
 * call to confirm" framing, since the on-screen artifact is their only record.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { BookingSuccess, formatConfirmationWhen } from '@/app/site/[slug]/book/book-form'
import type { BookingConfirmation } from '@/app/site/[slug]/actions'

function makeConfirmation(overrides: Partial<BookingConfirmation> = {}): BookingConfirmation {
  return {
    patientName: 'Jane Doe',
    clinicName: 'Acme Dental',
    clinicPhone: '(555) 555-0100',
    startTimeIso: '2026-01-15T14:00:00.000Z',
    endTimeIso: '2026-01-15T14:30:00.000Z',
    timeZone: 'UTC',
    visitTypeLabel: 'Cleaning',
    addressText: '123 Main St, Springfield, IL 62704',
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St',
    intakeFormUrl: 'https://acme.test/intake/new-patient',
    emailSent: true,
    ...overrides,
  }
}

describe('formatConfirmationWhen', () => {
  it('formats the start instant as a long date + time in the clinic timezone', () => {
    const label = formatConfirmationWhen('2026-01-15T14:00:00.000Z', 'UTC')
    expect(label).toContain('Thursday')
    expect(label).toContain('January 15')
    expect(label).toContain('2:00')
  })

  it('renders in the clinic zone, not UTC, when a zone is given', () => {
    // 14:00 UTC is 09:00 in New York (EST in January).
    const label = formatConfirmationWhen('2026-01-15T14:00:00.000Z', 'America/New_York')
    expect(label).toContain('9:00')
  })

  it('returns empty string for a malformed instant', () => {
    expect(formatConfirmationWhen('not-a-date', 'UTC')).toBe('')
  })
})

describe('BookingSuccess', () => {
  it('confirms the visit date/time and type', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    expect(screen.getByText(/You.?re booked/i)).toBeTruthy()
    expect(screen.getByText('Cleaning')).toBeTruthy()
    expect(screen.getByText(/January 15/)).toBeTruthy()
  })

  it('shows the clinic address with a directions/maps link', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    const directions = screen.getByRole('link', { name: /get directions/i })
    expect(directions.getAttribute('href')).toContain('google.com/maps')
    expect(directions.getAttribute('target')).toBe('_blank')
  })

  it('offers an "Add to calendar" link as an inline .ics data URL (no server lookup)', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    const cal = screen.getByRole('link', { name: /add to calendar/i })
    const href = cal.getAttribute('href') ?? ''
    expect(href.startsWith('data:text/calendar')).toBe(true)
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('BEGIN:VCALENDAR')
    expect(decoded).toContain('SUMMARY:Cleaning at Acme Dental')
    // The visit's .ics carries the start instant + a reminder alarm.
    expect(decoded).toContain('DTSTART:20260115T140000Z')
    expect(decoded).toContain('BEGIN:VALARM')
    expect(cal.getAttribute('download')).toBeTruthy()
  })

  it('shows a "what to expect" line (arrive early + bring insurance card)', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/10 minutes early/i)
    expect(body).toMatch(/insurance card/i)
  })

  it('renders a prominent "Fill out your intake form now" button when a form URL is present', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    const intake = screen.getByRole('link', { name: /fill out your intake form/i })
    expect(intake.getAttribute('href')).toBe('https://acme.test/intake/new-patient')
  })

  it('omits the intake CTA when the clinic has no default form', () => {
    render(<BookingSuccess confirmation={makeConfirmation({ intakeFormUrl: null })} brand="#9CAF9F" />)
    expect(screen.queryByRole('link', { name: /fill out your intake form/i })).toBeNull()
  })

  it('phone-only booker: same screen, framed as "we\'ll call to confirm", no email claim', () => {
    render(
      <BookingSuccess
        confirmation={makeConfirmation({ emailSent: false })}
        brand="#9CAF9F"
      />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/call to confirm/i)
    expect(body).not.toMatch(/sent a confirmation to your email/i)
    // Still gets the calendar + intake artifacts (it's their only record).
    expect(screen.getByRole('link', { name: /add to calendar/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /fill out your intake form/i })).toBeTruthy()
  })

  it('hides the address row + maps/directions when the clinic has no address', () => {
    render(
      <BookingSuccess
        confirmation={makeConfirmation({ addressText: null, mapsUrl: null })}
        brand="#9CAF9F"
      />,
    )
    expect(screen.queryByRole('link', { name: /get directions/i })).toBeNull()
    // The calendar .ics then carries no LOCATION line.
    const cal = screen.getByRole('link', { name: /add to calendar/i })
    expect(decodeURIComponent(cal.getAttribute('href') ?? '')).not.toContain('LOCATION:')
  })

  it('offers a tel: link to change the appointment when the clinic has a phone', () => {
    render(<BookingSuccess confirmation={makeConfirmation()} brand="#9CAF9F" />)
    const tel = screen.getByRole('link', { name: /\(555\) 555-0100/ })
    expect(tel.getAttribute('href')).toBe('tel:(555) 555-0100')
  })
})
