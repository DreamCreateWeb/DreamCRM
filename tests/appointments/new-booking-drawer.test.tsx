import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const listOptions = vi.fn(async () => [
  { id: 'p1', name: 'Emma Lopez' },
  { id: 'p2', name: 'Marcus Chen' },
])
vi.mock('@/app/(default)/appointments/actions', () => ({
  listPatientOptionsAction: () => listOptions(),
}))

// Stage 2 is the existing booking drawer — sentinel keeps this test on the picker.
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({
  default: ({ patientId, patientName }: { patientId: string; patientName: string }) => (
    <div data-testid="booking-form">
      booking:{patientId}:{patientName}
    </div>
  ),
}))

import NewBookingDrawer from '@/app/(default)/appointments/new-booking-drawer'

describe('NewBookingDrawer', () => {
  it('lists patients and hands the picked one to the booking form', async () => {
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())

    fireEvent.click(screen.getByText('Marcus Chen'))
    expect(screen.getByTestId('booking-form').textContent).toContain('booking:p2:Marcus Chen')
  })

  it('filters by search and offers the add-patient escape hatch', async () => {
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'marc' } })
    expect(screen.queryByText('Emma Lopez')).toBeNull()
    expect(screen.getByText('Marcus Chen')).toBeTruthy()

    const addLink = screen.getByText('+ Add a new patient first') as HTMLAnchorElement
    expect(addLink.getAttribute('href')).toBe('/patients?new=1')
  })

  it('calls onClose from Cancel', async () => {
    const onClose = vi.fn()
    render(<NewBookingDrawer onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
