import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlyphCluster } from '@/app/(default)/patients/glyph-cluster'
import type { PatientRowFlags } from '@/lib/services/patients'

function flags(overrides: Partial<PatientRowFlags> = {}): PatientRowFlags {
  return {
    newPatient: false,
    birthdayThisWeek: false,
    hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false,
    unconfirmedNext48h: false,
    lapsed: false,
    optedOut: false,
    ...overrides,
  }
}

describe('GlyphCluster', () => {
  it('renders nothing when no flags are set', () => {
    const { container } = render(<GlyphCluster flags={flags()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the ★ glyph for new patients', () => {
    render(<GlyphCluster flags={flags({ newPatient: true })} />)
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
  })

  it('renders the 🎂 glyph for birthday this week', () => {
    render(<GlyphCluster flags={flags({ birthdayThisWeek: true })} />)
    expect(screen.getByLabelText('Birthday this week')).toBeInTheDocument()
  })

  it('renders the $ glyph for outstanding balance', () => {
    render(<GlyphCluster flags={flags({ hasOutstandingBalance: true })} />)
    expect(screen.getByLabelText('Outstanding balance')).toBeInTheDocument()
  })

  it('renders the 📝! glyph for missing intake before next visit', () => {
    render(<GlyphCluster flags={flags({ missingIntakeBeforeAppt: true })} />)
    expect(screen.getByLabelText(/Missing intake form/)).toBeInTheDocument()
  })

  it('renders the ⚠️ glyph for unconfirmed-next-48h', () => {
    render(<GlyphCluster flags={flags({ unconfirmedNext48h: true })} />)
    expect(screen.getByLabelText(/Unconfirmed appointment/)).toBeInTheDocument()
  })

  it('renders the 💤 glyph for lapsed patients', () => {
    render(<GlyphCluster flags={flags({ lapsed: true })} />)
    expect(screen.getByLabelText(/Lapsed/)).toBeInTheDocument()
  })

  it('caps at the configured number with +N overflow', () => {
    render(
      <GlyphCluster
        flags={flags({
          newPatient: true,
          birthdayThisWeek: true,
          hasOutstandingBalance: true,
          missingIntakeBeforeAppt: true,
          unconfirmedNext48h: true,
          lapsed: true,
        })}
        cap={3}
      />,
    )
    expect(screen.getByText('+3')).toBeInTheDocument()
    // First three are visible; overflow has the rest in title attr
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lapsed/)).not.toBeInTheDocument()
  })

  it('renders all glyphs when cap=Infinity', () => {
    render(
      <GlyphCluster
        flags={flags({ newPatient: true, birthdayThisWeek: true, hasOutstandingBalance: true })}
        cap={Infinity}
      />,
    )
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Birthday this week')).toBeInTheDocument()
    expect(screen.getByLabelText('Outstanding balance')).toBeInTheDocument()
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument()
  })
})
