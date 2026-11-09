import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const cancelAction = vi.fn()
vi.mock('@/app/c/[token]/actions', () => ({
  confirmVisitAction: vi.fn(async () => ({ ok: true, state: 'confirmed' })),
  cancelVisitByTokenAction: (...a: unknown[]) => cancelAction(...a),
}))

import ConfirmForm from '@/app/c/[token]/confirm-form'

const soon = new Date(Date.now() + 3 * 3_600_000).toISOString()
const later = new Date(Date.now() + 5 * 86_400_000).toISOString()

function form(over: Record<string, unknown> = {}) {
  return (
    <ConfirmForm
      token="ct_abcdefgh"
      brand="#0a7"
      clinicName="Bright Smiles"
      clinicPhone="555-0100"
      patientFirstName="Mia"
      whenLabel="Mon 9:00 AM"
      visitTypeLabel="Cleaning"
      providerName={null}
      prepInstructions=""
      initialState="pending"
      bookUrl="https://x.example.com/book"
      rescheduleUrl="https://www.example.com/patient/appointments/a1"
      cancelNoticeHours={24}
      startTimeIso={later}
      location="1 Main St, Austin, TX, 78701"
      {...(over as object)}
    />
  )
}

describe('/c confirm page doors', () => {
  beforeEach(() => {
    cleanup()
    cancelAction.mockReset()
  })

  it('pending renders confirm, reschedule, directions and I-cant-make-it', () => {
    render(form())
    expect(screen.getByText('Confirm my visit')).toBeTruthy()
    expect(screen.getByText('Pick a different time').getAttribute('href')).toBe(
      'https://www.example.com/patient/appointments/a1',
    )
    const dir = screen.getByText('Get directions')
    expect(dir.getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('1 Main St, Austin, TX, 78701'),
    )
    expect(dir.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/can.t make it/)).toBeTruthy()
  })

  it('no directions link without an address', () => {
    render(form({ location: '' }))
    expect(screen.queryByText('Get directions')).toBeNull()
  })

  it('cancelling asks first, calls the action once, then offers to book again', async () => {
    cancelAction.mockResolvedValue({ ok: true, state: 'cancelled' })
    render(form())
    fireEvent.click(screen.getByText(/can.t make it/))
    expect(cancelAction).not.toHaveBeenCalled()
    expect(screen.getByText(/office hears right away/)).toBeTruthy()
    fireEvent.click(screen.getByText('Yes, cancel it'))
    await waitFor(() => expect(screen.getByText('Book another time')).toBeTruthy())
    expect(cancelAction).toHaveBeenCalledTimes(1)
    expect(cancelAction).toHaveBeenCalledWith('ct_abcdefgh')
    expect(screen.queryByText('Confirm my visit')).toBeNull()
  })

  it('inside the notice window the copy names the true notice', () => {
    render(form({ startTimeIso: soon }))
    fireEvent.click(screen.getByText(/can.t make it/))
    expect(screen.getByText(/Less than 24 hours/)).toBeTruthy()
  })

  it('a thrown action shows an honest message and resets busy', async () => {
    cancelAction.mockRejectedValue(new Error('boom'))
    render(form())
    fireEvent.click(screen.getByText(/can.t make it/))
    fireEvent.click(screen.getByText('Yes, cancel it'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect((screen.getByText('Yes, cancel it') as HTMLButtonElement).disabled).toBe(false)
  })

  it('cancelled and past never show Confirm', () => {
    render(form({ initialState: 'cancelled' }))
    expect(screen.queryByText('Confirm my visit')).toBeNull()
    cleanup()
    render(form({ initialState: 'past' }))
    expect(screen.queryByText('Confirm my visit')).toBeNull()
  })
})
