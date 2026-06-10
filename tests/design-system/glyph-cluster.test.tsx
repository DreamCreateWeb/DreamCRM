import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { appointmentFlagGlyphs, patientFlagGlyphs } from '@/lib/ui/encodings'

describe('GlyphCluster (shared)', () => {
  it('renders nothing when there are no glyphs', () => {
    const { container } = render(<GlyphCluster glyphs={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders patient flags with their aria-labels', () => {
    render(<GlyphCluster glyphs={patientFlagGlyphs({ newPatient: true, lapsed: true, optedOut: true })} cap={Infinity} />)
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Lapsed — no visit in 9+ months')).toBeInTheDocument()
    expect(screen.getByLabelText('Opted out of marketing')).toBeInTheDocument()
  })

  it('renders appointment-scoped flags with their aria-labels', () => {
    render(
      <GlyphCluster
        glyphs={appointmentFlagGlyphs({
          lapsedReturning: true,
          bookedJustNow: true,
          rescheduled: true,
          reminderSentRecently: true,
        })}
        cap={Infinity}
      />,
    )
    expect(screen.getByLabelText('Lapsed patient returning — celebrate')).toBeInTheDocument()
    expect(screen.getByLabelText('Booked in the last hour')).toBeInTheDocument()
    expect(screen.getByLabelText('Rescheduled from an earlier slot')).toBeInTheDocument()
    expect(screen.getByLabelText('Reminder sent in the last 24h — avoid double-texting')).toBeInTheDocument()
  })

  it('caps visible glyphs and summarizes the rest in a +N badge', () => {
    render(
      <GlyphCluster
        glyphs={patientFlagGlyphs({
          newPatient: true,
          birthdayThisWeek: true,
          hasOutstandingBalance: true,
          missingIntakeBeforeAppt: true,
          unconfirmedNext48h: true,
          lapsed: true,
        })}
        cap={4}
      />,
    )
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Missing intake form before next visit')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lapsed — no visit in 9+ months')).toBeNull()
    const overflow = screen.getByLabelText('2 more flags')
    expect(overflow).toHaveTextContent('+2')
    // The hidden flags stay discoverable via the badge tooltip.
    expect(overflow.getAttribute('title')).toContain('Unconfirmed appointment in next 48h')
    expect(overflow.getAttribute('title')).toContain('Lapsed — no visit in 9+ months')
  })

  it('every visible glyph carries a hover title matching its label', () => {
    render(<GlyphCluster glyphs={patientFlagGlyphs({ hasOutstandingBalance: true })} />)
    const glyph = screen.getByLabelText('Outstanding balance')
    expect(glyph.getAttribute('title')).toBe('Outstanding balance')
  })
})
