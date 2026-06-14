import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessagesSurfaceTabs from '@/app/(double-sidebar)/messages/surface-tabs'

/**
 * The Patients ⇄ Mailbox surface tabs render on BOTH /messages and /inbox so
 * neither surface is a one-way trip (the founder's bug: clicking Mailbox lost
 * the way back to Patients). The active tab is a non-link; the other links across.
 */
describe('MessagesSurfaceTabs', () => {
  it('on the Patients surface, Mailbox links to /inbox', () => {
    render(<MessagesSurfaceTabs active="patients" />)
    const mailbox = screen.getByText(/Mailbox/).closest('a')
    expect(mailbox).toHaveAttribute('href', '/inbox')
    // Active Patients tab is a span (aria-current), not a link.
    const patients = screen.getByText('Patients')
    expect(patients.closest('a')).toBeNull()
    expect(patients).toHaveAttribute('aria-current', 'page')
  })

  it('on the Mailbox surface, Patients links back to /messages', () => {
    render(<MessagesSurfaceTabs active="mailbox" />)
    const patients = screen.getByText('Patients').closest('a')
    expect(patients).toHaveAttribute('href', '/messages')
    // Active Mailbox tab is a span (aria-current), not a link.
    const mailbox = screen.getByText(/Mailbox/)
    expect(mailbox.closest('a')).toBeNull()
    expect(mailbox).toHaveAttribute('aria-current', 'page')
  })
})
