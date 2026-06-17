import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

/**
 * PortalRequestForm — shown in the portal instead of the slot picker when
 * self-scheduling is off. No calendar; an optional reason + preferred times +
 * note that send an in-app message to the clinic.
 */

const requestMyVisitAction = vi.fn(async (_fd: FormData) => ({ ok: true as const }))
vi.mock('@/app/(portal)/patient/actions', () => ({
  requestMyVisitAction: (fd: FormData) => requestMyVisitAction(fd),
}))

import PortalRequestForm from '@/app/(portal)/patient/book/request-form'

beforeEach(() => {
  cleanup()
  requestMyVisitAction.mockClear()
  requestMyVisitAction.mockResolvedValue({ ok: true })
})

function renderForm(props: Partial<React.ComponentProps<typeof PortalRequestForm>> = {}) {
  return render(
    <PortalRequestForm
      brand="#2A7F8C"
      allowedTypes={['cleaning', 'checkup']}
      typeLabels={{ cleaning: 'Cleaning', checkup: 'Checkup' }}
      self={{ id: 'pat_1', firstName: 'Jordan' }}
      dependents={[]}
      clinicPhone="(555) 555-0100"
      {...props}
    />,
  )
}

describe('PortalRequestForm', () => {
  it('renders a request form with reason pills and NO slot picker', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Cleaning' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Checkup' })).toBeTruthy()
    expect(screen.getByLabelText(/when works best/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send request/i })).toBeTruthy()
    // No calendar / slot grid in request mode.
    expect(screen.queryByText(/pick a time/i)).toBeNull()
  })

  it('submits the chosen reason as free text and confirms', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Cleaning' }))
    fireEvent.change(screen.getByLabelText(/when works best/i), { target: { value: 'Tuesday AM' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => expect(requestMyVisitAction).toHaveBeenCalledTimes(1))
    const fd = requestMyVisitAction.mock.calls[0]![0]
    expect(fd.get('reason')).toBe('Cleaning')
    expect(fd.get('preferredTimes')).toBe('Tuesday AM')
    expect(fd.get('forPatientId')).toBe('pat_1')

    expect(await screen.findByText(/request sent/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /go to messages/i })).toBeTruthy()
  })

  it('clicking the active reason pill again clears it (reason is optional)', async () => {
    renderForm()
    const pill = screen.getByRole('button', { name: 'Cleaning' })
    fireEvent.click(pill) // select
    fireEvent.click(pill) // deselect
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(requestMyVisitAction).toHaveBeenCalledTimes(1))
    const fd = requestMyVisitAction.mock.calls[0]![0]
    expect(fd.get('reason')).toBe('')
  })

  it('shows a "who is this for?" picker only when there are dependents', () => {
    const { rerender } = renderForm()
    expect(screen.queryByText(/who’s this visit for/i)).toBeNull()
    rerender(
      <PortalRequestForm
        brand="#2A7F8C"
        allowedTypes={['cleaning']}
        typeLabels={{ cleaning: 'Cleaning' }}
        self={{ id: 'pat_1', firstName: 'Jordan' }}
        dependents={[{ id: 'pat_kid', firstName: 'Sam' }]}
        clinicPhone={null}
      />,
    )
    expect(screen.getByText(/who’s this visit for/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sam/i })).toBeTruthy()
  })

  it('surfaces a server error without flipping to the sent state', async () => {
    requestMyVisitAction.mockResolvedValueOnce({ ok: false as const, error: 'Online requests aren’t available' } as never)
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText(/aren’t available/i)).toBeTruthy()
    expect(screen.queryByText(/request sent/i)).toBeNull()
  })
})
