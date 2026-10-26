import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * "+ New booking" picks a patient through a SERVER search (name / email /
 * phone digits, capped, most recently active first) — not a 500-row
 * first-name-sorted list filtered in the browser, which could not book
 * anyone past the cap on a PMS-connected roster and could not search by
 * phone at all.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const ROSTER = [
  { id: 'p1', name: 'Emma Lopez', hint: '(512) 555-0101' },
  { id: 'p2', name: 'Marcus Chen', hint: 'marcus@example.com' },
]
const search = vi.fn(async (q: string) => {
  const term = q.trim().toLowerCase()
  if (!term) return ROSTER
  const digits = term.replace(/\D/g, '')
  return ROSTER.filter(
    (p) => p.name.toLowerCase().includes(term) || (digits.length >= 3 && (p.hint ?? '').replace(/\D/g, '').includes(digits)),
  )
})
vi.mock('@/app/(default)/appointments/actions', () => ({
  searchPatientOptionsAction: (q: string) => search(q),
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

beforeEach(() => {
  search.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('NewBookingDrawer', () => {
  it('opens on the most recently active patients (an empty search) and hands the picked one to the booking form', async () => {
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())
    expect(search).toHaveBeenCalledWith('')
    expect(screen.getByText(/Recently active/)).toBeTruthy()
    // The tiebreak the desk identifies a caller by rides each row.
    expect(screen.getByText('(512) 555-0101')).toBeTruthy()

    fireEvent.click(screen.getByText('Marcus Chen'))
    expect(screen.getByTestId('booking-form').textContent).toContain('booking:p2:Marcus Chen')
  })

  it('searches on the server after the keys settle — by name or by phone digits', async () => {
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'marc' } })
    await waitFor(() => expect(search).toHaveBeenLastCalledWith('marc'))
    await waitFor(() => expect(screen.queryByText('Emma Lopez')).toBeNull())
    expect(screen.getByText('Marcus Chen')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: '555-0101' } })
    await waitFor(() => expect(search).toHaveBeenLastCalledWith('555-0101'))
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())
    expect(screen.queryByText('Marcus Chen')).toBeNull()
  })

  it('debounces keystrokes into one round-trip', async () => {
    vi.useFakeTimers()
    render(<NewBookingDrawer onClose={() => {}} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(search).toHaveBeenCalledTimes(1) // the mount search
    const input = screen.getByLabelText('Search patients')
    fireEvent.change(input, { target: { value: 'm' } })
    fireEvent.change(input, { target: { value: 'ma' } })
    fireEvent.change(input, { target: { value: 'mar' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenLastCalledWith('mar')
  })

  it('offers the add-patient escape hatch and an honest empty prompt', async () => {
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())
    expect((screen.getByLabelText('Search patients') as HTMLInputElement).placeholder).toMatch(/name or phone/i)
    fireEvent.change(screen.getByLabelText('Search patients'), { target: { value: 'zoe' } })
    await waitFor(() => expect(screen.getByText('No patients match “zoe”.')).toBeTruthy())
    const addLink = screen.getByText('+ Add a new patient first') as HTMLAnchorElement
    expect(addLink.getAttribute('href')).toBe('/patients?new=1')
  })

  it('a failed search says so and keeps the drawer usable', async () => {
    search.mockRejectedValueOnce(new Error('Failed to find Server Action'))
    render(<NewBookingDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Could not search your patients/)).toBeTruthy())
  })

  it('calls onClose from Cancel', async () => {
    const onClose = vi.fn()
    render(<NewBookingDrawer onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Emma Lopez')).toBeTruthy())
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
