import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { patientFlagGlyphs } from '@/lib/ui/encodings'
import type { PatientRowFlags } from '@/lib/services/patients'

/**
 * The Patients module now renders the SHARED <GlyphCluster> from the design
 * system, fed by the registry builder patientFlagGlyphs(). These tests prove
 * the patient-flag shape still produces the same aria-labels (preserved by the
 * encodings registry) and the same cap/overflow behavior the module relies on.
 */
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

/** Render the shared cluster the way patients-list / patient-detail do. */
function renderCluster(f: PatientRowFlags, cap?: number) {
  return render(<GlyphCluster glyphs={patientFlagGlyphs(f)} cap={cap} />)
}

describe('GlyphCluster (shared, fed by patientFlagGlyphs)', () => {
  it('renders nothing when no flags are set', () => {
    const { container } = renderCluster(flags())
    expect(container.firstChild).toBeNull()
  })

  it('renders the ★ glyph for new patients', () => {
    renderCluster(flags({ newPatient: true }))
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
  })

  it('renders the 🎂 glyph for birthday this week', () => {
    renderCluster(flags({ birthdayThisWeek: true }))
    expect(screen.getByLabelText('Birthday this week')).toBeInTheDocument()
  })

  it('renders the $ glyph for outstanding balance', () => {
    renderCluster(flags({ hasOutstandingBalance: true }))
    expect(screen.getByLabelText('Outstanding balance')).toBeInTheDocument()
  })

  it('renders the 📝! glyph for missing intake before next visit', () => {
    renderCluster(flags({ missingIntakeBeforeAppt: true }))
    expect(screen.getByLabelText(/Missing intake form/)).toBeInTheDocument()
  })

  it('renders the ⚠️ glyph for unconfirmed-next-48h', () => {
    renderCluster(flags({ unconfirmedNext48h: true }))
    expect(screen.getByLabelText(/Unconfirmed appointment/)).toBeInTheDocument()
  })

  it('renders the 💤 glyph for lapsed patients', () => {
    renderCluster(flags({ lapsed: true }))
    expect(screen.getByLabelText(/Lapsed/)).toBeInTheDocument()
  })

  it('renders the 🔕 glyph for opted-out patients', () => {
    renderCluster(flags({ optedOut: true }))
    expect(screen.getByLabelText(/Opted out/)).toBeInTheDocument()
  })

  it('caps at the configured number with +N overflow', () => {
    renderCluster(
      flags({
        newPatient: true,
        birthdayThisWeek: true,
        hasOutstandingBalance: true,
        missingIntakeBeforeAppt: true,
        unconfirmedNext48h: true,
        lapsed: true,
      }),
      3,
    )
    expect(screen.getByText('+3')).toBeInTheDocument()
    // First three are visible; overflow has the rest in title attr
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lapsed/)).not.toBeInTheDocument()
  })

  it('renders all glyphs when cap=Infinity', () => {
    renderCluster(
      flags({ newPatient: true, birthdayThisWeek: true, hasOutstandingBalance: true }),
      Infinity,
    )
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Birthday this week')).toBeInTheDocument()
    expect(screen.getByLabelText('Outstanding balance')).toBeInTheDocument()
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument()
  })

  it('orders glyphs per the patients-module registry order', () => {
    // newPatient → birthday → balance → missingIntake → unconfirmed → lapsed → optedOut
    const ids = patientFlagGlyphs(
      flags({ optedOut: true, newPatient: true, hasOutstandingBalance: true }),
    )
    expect(ids).toEqual(['newPatient', 'balance', 'optedOut'])
  })
})
