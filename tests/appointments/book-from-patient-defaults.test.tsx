/**
 * BookFromPatientDrawer honours its seeds: `defaultDate` opens the form on
 * that day (the recall day after a completed visit, an inquiry's preferred
 * date) and anything that is not a YYYY-MM-DD key falls back to tomorrow;
 * `defaultType` picks the visit type. The slot grid it renders is the shared
 * `SlotGrid`, loaded for the seeded day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const { configMock, slotsMock } = vi.hoisted(() => ({
  configMock: vi.fn(),
  slotsMock: vi.fn(),
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  createInternalAppointmentAction: vi.fn(),
  getBookingConfigAction: () => configMock(),
  getBookingSlotsAction: (dateKey: string, duration?: number) => slotsMock(dateKey, duration),
}))

import BookFromPatientDrawer from '@/app/(default)/appointments/book-from-patient-drawer'

function tomorrowKey(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  configMock.mockReset().mockResolvedValue({
    providers: [],
    visitTypes: [
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30 },
      { id: 'crown', label: 'Crown', durationMinutes: 60 },
    ],
  })
  slotsMock.mockReset().mockResolvedValue([{ startIso: '2027-04-26T14:00:00.000Z', label: '9:00 AM', available: true }])
})

describe('BookFromPatientDrawer — seeds', () => {
  it('opens on defaultDate and loads that day’s grid at the type’s length', async () => {
    render(<BookFromPatientDrawer patientId="pat_1" patientName="Mia Hayes" defaultType="crown" defaultDate="2027-04-26" onClose={() => {}} />)
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2027-04-26')
    await waitFor(() => expect(slotsMock).toHaveBeenLastCalledWith('2027-04-26', 60))
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('crown')
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Custom time' })).toBeTruthy()
  })

  it('falls back to tomorrow when the seed is not a date key', async () => {
    render(<BookFromPatientDrawer patientId="pat_1" patientName="Mia Hayes" defaultDate="next tuesday" onClose={() => {}} />)
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(tomorrowKey())
  })

  it('falls back to tomorrow with no seed at all (the drawer’s long-standing default)', async () => {
    render(<BookFromPatientDrawer patientId="pat_1" patientName="Mia Hayes" onClose={() => {}} />)
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(tomorrowKey())
  })
})
