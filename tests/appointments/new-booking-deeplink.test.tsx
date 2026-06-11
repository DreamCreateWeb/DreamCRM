import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type {
  AppointmentListFilters,
  AppointmentFilterMeta,
} from '@/lib/services/appointments'

/**
 * The `?new=1` deep-link reader on the appointments agenda (the one surgical
 * module-page edit allowed for the v2 navigation shell — DESIGN-SYSTEM.md
 * Part 4 / mission boundary). The header `+ New ▾` quick-create and the ⌘K
 * "Add a booking" launcher both navigate to `/appointments?new=1`; the agenda
 * opens the NewBookingDrawer on arrival and strips the param so a refresh /
 * close doesn't re-pop it.
 */

const replace = vi.fn()
// Holder so each test can vary the search params.
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
  useSearchParams: () => searchParams,
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(async () => ({ ok: true })),
  bulkSendRemindersAction: vi.fn(async () => ({ attempted: 0, sent: 0, skipped: 0, errors: [] })),
}))
vi.mock('@/app/(default)/appointments/appointment-drawer', () => ({ default: () => null }))
vi.mock('@/app/(default)/appointments/new-booking-drawer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="new-booking-drawer">
      <button onClick={onClose}>close-drawer</button>
    </div>
  ),
}))

import AgendaView from '@/app/(default)/appointments/agenda-view'

const baseMeta: AppointmentFilterMeta = { providers: [], sources: [] }
const baseFilters: AppointmentListFilters = { window: 'next_14d', attention: [] }

beforeEach(() => {
  replace.mockReset()
  searchParams = new URLSearchParams()
})

describe('AgendaView — ?new=1 deep link', () => {
  it('opens the new-booking drawer on arrival when ?new=1 is present', () => {
    searchParams = new URLSearchParams('new=1')
    render(<AgendaView groups={[]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    expect(screen.getByTestId('new-booking-drawer')).toBeInTheDocument()
  })

  it('strips the new param from the URL once consumed (replace, no history push)', () => {
    searchParams = new URLSearchParams('new=1')
    render(<AgendaView groups={[]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    expect(replace).toHaveBeenCalledWith('/appointments')
  })

  it('preserves other query params while dropping only new', () => {
    searchParams = new URLSearchParams('new=1&q=mia')
    render(<AgendaView groups={[]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    expect(replace).toHaveBeenCalledWith('/appointments?q=mia')
  })

  it('does NOT open the drawer (or strip anything) without ?new=1', () => {
    searchParams = new URLSearchParams()
    render(<AgendaView groups={[]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    expect(screen.queryByTestId('new-booking-drawer')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
