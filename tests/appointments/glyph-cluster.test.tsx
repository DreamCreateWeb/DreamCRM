import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppointmentGlyphCluster } from '@/app/(default)/appointments/appointment-glyph-cluster'
import type { AppointmentRowFlags } from '@/lib/services/appointments'

function flags(overrides: Partial<AppointmentRowFlags> = {}): AppointmentRowFlags {
  return {
    newPatient: false,
    birthdayThisWeek: false,
    hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false,
    unconfirmedNext48h: false,
    lapsedReturning: false,
    optedOut: false,
    reminderSentRecently: false,
    bookedJustNow: false,
    rescheduled: false,
    ...overrides,
  }
}

describe('AppointmentGlyphCluster', () => {
  it('renders nothing when no flags are set', () => {
    const { container } = render(<AppointmentGlyphCluster flags={flags()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders patient-carried glyphs (★/🎂/$/📝!/⚠️)', () => {
    render(
      <AppointmentGlyphCluster
        flags={flags({
          newPatient: true,
          birthdayThisWeek: true,
          hasOutstandingBalance: true,
          missingIntakeBeforeAppt: true,
          unconfirmedNext48h: true,
        })}
        cap={Infinity}
      />,
    )
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Birthday this week')).toBeInTheDocument()
    expect(screen.getByLabelText('Outstanding balance')).toBeInTheDocument()
    expect(screen.getByLabelText(/Missing intake form before this visit/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Unconfirmed appointment/)).toBeInTheDocument()
  })

  it('renders the lapsed-returning 💤 celebration glyph', () => {
    render(<AppointmentGlyphCluster flags={flags({ lapsedReturning: true })} />)
    expect(screen.getByLabelText(/Lapsed patient returning/)).toBeInTheDocument()
  })

  it('renders the 🆕 booked-just-now glyph', () => {
    render(<AppointmentGlyphCluster flags={flags({ bookedJustNow: true })} />)
    expect(screen.getByLabelText(/Booked in the last hour/)).toBeInTheDocument()
  })

  it('renders the 📅 rescheduled glyph', () => {
    render(<AppointmentGlyphCluster flags={flags({ rescheduled: true })} />)
    expect(screen.getByLabelText(/Rescheduled from an earlier slot/)).toBeInTheDocument()
  })

  it('renders the ⏱ reminder-sent-recently glyph', () => {
    render(<AppointmentGlyphCluster flags={flags({ reminderSentRecently: true })} />)
    expect(screen.getByLabelText(/Reminder sent in the last 24h/)).toBeInTheDocument()
  })

  it('caps at the configured number with +N overflow', () => {
    render(
      <AppointmentGlyphCluster
        flags={flags({
          newPatient: true,
          birthdayThisWeek: true,
          hasOutstandingBalance: true,
          missingIntakeBeforeAppt: true,
          unconfirmedNext48h: true,
          bookedJustNow: true,
        })}
        cap={3}
      />,
    )
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Booked in the last hour/)).not.toBeInTheDocument()
  })
})
