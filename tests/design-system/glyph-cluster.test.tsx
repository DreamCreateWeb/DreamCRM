import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    expect(screen.getByLabelText('Lapsed — past your lapsed threshold')).toBeInTheDocument()
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
    expect(screen.queryByLabelText('Lapsed — past your lapsed threshold')).toBeNull()
    const overflow = screen.getByLabelText('2 more flags')
    expect(overflow).toHaveTextContent('+2')
    // The hidden flags stay discoverable via the badge tooltip.
    expect(overflow.getAttribute('title')).toContain('Unconfirmed appointment in next 48h')
    expect(overflow.getAttribute('title')).toContain('Lapsed — past your lapsed threshold')
  })

  it('every visible glyph carries a hover title matching its label', () => {
    render(<GlyphCluster glyphs={patientFlagGlyphs({ hasOutstandingBalance: true })} />)
    const glyph = screen.getByLabelText('Outstanding balance')
    expect(glyph.getAttribute('title')).toBe('Outstanding balance')
  })
})

/**
 * ANNOUNCED AND TOUCH-REACHABLE (2026-10-26). `aria-label` is prohibited on
 * the generic role, so on a bare span most screen readers skipped it and read
 * the raw emoji ("star", "memo exclamation mark"); `role="img"` (the
 * ProgressRing's shape) makes the label the thing announced. And touch has no
 * hover, so `title` never showed on a phone: a tap on the cluster now lists
 * every label, without reaching the (clickable) row around it.
 */
describe('GlyphCluster — announced and touch-reachable', () => {
  it('exposes each flag as a named image rather than a bare span', () => {
    render(<GlyphCluster glyphs={patientFlagGlyphs({ newPatient: true, hasOutstandingBalance: true })} />)
    expect(screen.getByRole('img', { name: 'New patient' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Outstanding balance' })).toBeInTheDocument()
  })

  it('the overflow badge is a named image too', () => {
    render(
      <GlyphCluster
        glyphs={patientFlagGlyphs({ newPatient: true, birthdayThisWeek: true, hasOutstandingBalance: true })}
        cap={1}
      />,
    )
    expect(screen.getByRole('img', { name: '2 more flags' })).toHaveTextContent('+2')
  })

  it('a tap lists every label for touch without reaching the row; Escape closes it', () => {
    const rowClick = vi.fn()
    render(
      <ul>
        <li onClick={rowClick}>
          <GlyphCluster
            glyphs={patientFlagGlyphs({ newPatient: true, lapsed: true, optedOut: true, birthdayThisWeek: true, hasOutstandingBalance: true })}
            cap={4}
          />
        </li>
      </ul>,
    )
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(trigger)
    expect(rowClick).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const tip = screen.getByRole('tooltip')
    // Every flag, including the ones folded into +1.
    expect(tip).toHaveTextContent('New patient')
    expect(tip).toHaveTextContent('Outstanding balance')
    // The label carries no number: the threshold is the clinic's own setting.
    expect(tip).toHaveTextContent(/^.*Lapsed/)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
