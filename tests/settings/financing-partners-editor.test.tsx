import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import FinancingPartnersEditor from '@/app/(default)/settings/clinic/financing-partners-editor'
import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'

/**
 * FINANCING WIDGETS — the editor (2026-10-09). A clinic picks the provider
 * from the catalog and pastes the ONE thing that provider hands out; the
 * editor parses it on every keystroke into the stored slug / link, says
 * what it understood, and only lets the widget toggles on once a slug is
 * there. The hidden input is what the save action reads, so it must carry
 * the parsed value — never the raw paste.
 */

function hidden(): ClinicFinancingPartner[] {
  const input = document.querySelector('input[type="hidden"][name="financingPartners"]') as HTMLInputElement
  return JSON.parse(input.value)
}

describe('FinancingPartnersEditor', () => {
  it('opens the catalog and adds Cherry with its widget toggles waiting on a slug', () => {
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={[]} />)
    fireEvent.click(screen.getByText('Add financing partner'))
    expect(screen.getByTestId('financing-catalog')).toBeTruthy()
    fireEvent.click(screen.getByText('Cherry'))
    expect(screen.queryByTestId('financing-catalog')).toBeNull()
    const floating = screen.getByTestId('financing-floating') as HTMLInputElement
    expect(floating.disabled).toBe(true)
    expect(screen.getByTestId('financing-connect-note').textContent).toMatch(/Where to find it/)
    expect(hidden()[0]).toMatchObject({ provider: 'cherry', slug: null, applyUrl: null, showWidget: true })
  })

  it('parses Cherry’s application link into the slug and unlocks the floating button', () => {
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={[]} />)
    fireEvent.click(screen.getByText('Add financing partner'))
    fireEvent.click(screen.getByText('Cherry'))
    fireEvent.change(screen.getByTestId('financing-connect-cherry'), {
      target: { value: 'https://pay.withcherry.com/ted-pinney-dds-pa?utm_source=merchant&utm_medium=website' },
    })
    expect(screen.getByTestId('financing-connect-note').textContent).toMatch(/ends in “ted-pinney-dds-pa”/)
    const floating = screen.getByTestId('financing-floating') as HTMLInputElement
    expect(floating.disabled).toBe(false)
    fireEvent.click(floating)
    expect(hidden()[0]).toMatchObject({ provider: 'cherry', slug: 'ted-pinney-dds-pa', applyUrl: null, floatingButton: true })
  })

  it('accepts the bare slug too, and names a bad paste instead of storing it', () => {
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={[]} />)
    fireEvent.click(screen.getByText('Add financing partner'))
    fireEvent.click(screen.getByText('Cherry'))
    const box = screen.getByTestId('financing-connect-cherry')
    fireEvent.change(box, { target: { value: 'ted-pinney-dds-pa' } })
    expect(hidden()[0].slug).toBe('ted-pinney-dds-pa')
    fireEvent.change(box, { target: { value: 'https://evil.example/ted-pinney-dds-pa' } })
    expect(hidden()[0].slug).toBeNull()
    expect(hidden()[0].applyUrl).toBeNull()
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByTestId('financing-connect-note').textContent).not.toMatch(/Connected/)
  })

  it('a link provider keeps a host-checked link and refuses another host', () => {
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={[]} />)
    fireEvent.click(screen.getByText('Add financing partner'))
    fireEvent.click(screen.getByText('CareCredit'))
    const box = screen.getByTestId('financing-connect-carecredit')
    fireEvent.change(box, { target: { value: 'https://www.carecredit.com/go/ABC123/' } })
    expect(hidden()[0]).toMatchObject({ provider: 'carecredit', applyUrl: 'https://www.carecredit.com/go/ABC123/', slug: null })
    expect(screen.getByTestId('financing-connect-note').textContent).toMatch(/Connected/)
    fireEvent.change(box, { target: { value: 'https://phish.example/go/ABC123/' } })
    expect(hidden()[0].applyUrl).toBeNull()
  })

  it('labels the first of several partners as the primary', () => {
    const existing: ClinicFinancingPartner[] = [
      { id: 'a', name: 'Cherry', description: null, applyUrl: null, logoUrl: null, provider: 'cherry', slug: 'ted-pinney-dds-pa', showWidget: true, floatingButton: true },
      { id: 'b', name: 'CareCredit', description: null, applyUrl: 'https://www.carecredit.com/go/X/', logoUrl: null, provider: 'carecredit' },
    ]
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={existing} />)
    expect(screen.getByText('Primary')).toBeTruthy()
    expect(screen.getByText(/Shown first and largest/)).toBeTruthy()
    // A stored slug is shown back in the connect box.
    expect((screen.getByTestId('financing-connect-cherry') as HTMLInputElement).value).toBe('ted-pinney-dds-pa')
  })

  it('"Another provider" keeps the free-form name + URL row', () => {
    render(<FinancingPartnersEditor name="financingPartners" defaultValue={[]} />)
    fireEvent.click(screen.getByText('Add financing partner'))
    fireEvent.click(screen.getByText('Another provider'))
    fireEvent.change(screen.getByPlaceholderText('The provider’s name'), { target: { value: 'Local Credit Union' } })
    fireEvent.change(screen.getByTestId('financing-connect-other'), { target: { value: 'https://example.org/apply' } })
    expect(hidden()[0]).toMatchObject({ provider: 'other', name: 'Local Credit Union', applyUrl: 'https://example.org/apply' })
  })
})
