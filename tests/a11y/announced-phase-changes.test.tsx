import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * The portal accessibility cluster (batch 50). Three contracts that kept
 * getting re-broken because nothing pinned them:
 *
 *  1. A set of `aria-pressed` siblings is announced inside a NAMED group —
 *     the slot pickers had the pressed state but no group, so a day chip was
 *     announced as a loose toggle belonging to nothing. The portal's choice
 *     chips already had it; this is the parity.
 *  2. A grid that reloads itself when another control is touched narrates the
 *     phase change through a live region. Picking a day swaps every time in
 *     the grid; without this the screen reader says nothing at all.
 *  3. A phase swap that REPLACES the surface (the booking success screen)
 *     moves focus into the new content. A live region can't carry this one —
 *     it mounts already-populated, the case screen readers don't reliably
 *     announce — and focus otherwise falls back to <body>.
 */

const listBookingSlots = vi.fn()
vi.mock('@/app/site/[slug]/actions', () => ({
  listBookingSlots: (...args: unknown[]) => listBookingSlots(...args),
  submitBookingRequest: vi.fn(async () => ({ ok: true as const, data: null })),
}))

import SlotPicker from '@/components/patient-portal/slot-picker'
import { BookingSuccess } from '@/app/site/[slug]/book/book-form'

beforeEach(() => {
  cleanup()
  listBookingSlots.mockReset()
})

function slotsFor(times: Array<[string, boolean]>) {
  return {
    slots: times.map(([label, available]) => ({
      // Far enough out that the default minNotice never filters them.
      startIso: new Date(Date.now() + 86_400_000 * 3 + times.indexOf([label, available]) * 1000).toISOString(),
      label,
      available,
    })),
    closedReason: null,
  }
}

describe('portal slot picker — grouped choices + narrated phases', () => {
  it('names the day strip and the slot grid as groups', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    const loadSlots = vi.fn(async () => ({
      slots: [{ startIso: iso, label: '9:00 AM', available: true }],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    // The day strip is a named group of aria-pressed siblings...
    expect(screen.getByRole('group', { name: 'Pick a day' })).toBeTruthy()
    // ...and so is the slot grid, once it lands.
    await waitFor(() => expect(screen.getByRole('group', { name: 'Pick a time' })).toBeTruthy())
  })

  it('announces what landed after a day is picked', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    const loadSlots = vi.fn(async () => ({
      slots: [
        { startIso: iso, label: '9:00 AM', available: true },
        { startIso: new Date(Date.parse(iso) + 1800_000).toISOString(), label: '9:30 AM', available: true },
        { startIso: new Date(Date.parse(iso) + 3600_000).toISOString(), label: '10:00 AM', available: false },
      ],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    // Two available, one taken — the count is of what's actually bookable.
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/2 times available/i)
    })
  })

  it('says so when a day has nothing, rather than going silent', async () => {
    const loadSlots = vi.fn(async () => ({ slots: [], closedReason: 'day_closed' as const }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/no openings/i)
    })
  })

  it('keeps a text alternative on taken slots (strikethrough is not spoken)', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    // Needs a bookable sibling: an all-taken day renders the empty state
    // instead of the grid, so the taken chip would never mount.
    const loadSlots = vi.fn(async () => ({
      slots: [
        { startIso: iso, label: '9:00 AM', available: false },
        { startIso: new Date(Date.parse(iso) + 1800_000).toISOString(), label: '9:30 AM', available: true },
      ],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    await waitFor(() => expect(screen.getByText(/— taken/)).toBeTruthy())
  })
})

describe('public booking success — the phase swap moves focus', () => {
  const confirmation = {
    startTimeIso: new Date(Date.now() + 86_400_000 * 3).toISOString(),
    endTimeIso: new Date(Date.now() + 86_400_000 * 3 + 3600_000).toISOString(),
    timeZone: 'America/Chicago',
    visitTypeLabel: 'Cleaning',
    clinicName: 'Bright Smiles',
    clinicPhone: '(555) 555-0100',
    addressText: '1 Main St',
    mapsUrl: null,
    emailSent: true,
    intakeUrl: null,
  }

  it('focuses the confirmation heading so the outcome is spoken', () => {
    render(<BookingSuccess confirmation={confirmation as never} brand="#2A7F8C" />)

    const heading = screen.getByRole('heading', { name: /you.re booked/i })
    // Focus is the announcement: the submit button just unmounted, so without
    // this the screen reader is parked on <body> with nothing read out.
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })
})
