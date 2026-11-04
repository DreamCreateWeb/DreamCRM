import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntakeAlertPill } from '@/components/ui/intake-alert-pill'

/**
 * The "⚠ Allergic to penicillin" pill (ML-27) — warn tone (needs OUR
 * attention before the visit), first alert in the pill, "+N" for the rest,
 * the full list on the title. Nothing renders when there is nothing to say.
 */
describe('IntakeAlertPill', () => {
  it('renders the first alert in the warn tone with the full list on the title', () => {
    render(<IntakeAlertPill alerts={['Allergic to penicillin', 'Takes warfarin (blood thinner)']} />)
    const pill = screen.getByTitle('From their intake form: Allergic to penicillin · Takes warfarin (blood thinner)')
    expect(pill).toHaveAttribute('data-tone', 'warn')
    expect(pill).toHaveTextContent('Allergic to penicillin')
    expect(pill).toHaveTextContent('+1')
    // The symbol is decoration; the text carries the meaning.
    expect(pill.querySelector('[aria-hidden="true"]')).toHaveTextContent('⚠')
  })

  it('one alert → no "+N"; empty / blank alerts → nothing at all', () => {
    const { unmount } = render(<IntakeAlertPill alerts={['High dental anxiety — prefers nitrous']} />)
    expect(screen.getByTitle(/From their intake form/)).not.toHaveTextContent('+')
    unmount()
    const { container } = render(<IntakeAlertPill alerts={['', '  ']} />)
    expect(container.firstChild).toBeNull()
  })
})
