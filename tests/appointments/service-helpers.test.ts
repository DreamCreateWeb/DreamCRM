import { describe, it, expect } from 'vitest'
import { groupByDay, isRebookingCandidate, type AppointmentRow } from '@/lib/services/appointments'

function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Mia Hayes',
    patientLifecycle: 'active',
    startTime: new Date('2026-05-21T09:00:00Z'),
    endTime: null,
    durationMinutes: null,
    type: 'cleaning',
    status: 'scheduled',
    source: null,
    notes: null,
    providerId: null,
    providerName: null,
    locationName: null,
    confirmedAt: null,
    cancelledAt: null,
    reminderLastSentAt: null,
    createdAt: new Date('2026-05-15T00:00:00Z'),
    flags: {
      newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
      optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
    },
    agingLevel: 'none',
    needsRebooking: false,
    ...overrides,
  }
}

describe('groupByDay', () => {
  const today = new Date('2026-05-20T08:00:00Z')

  it('groups rows by calendar day', () => {
    const rows = [
      makeRow({ id: 'a1', startTime: new Date('2026-05-21T09:00:00Z') }),
      makeRow({ id: 'a2', startTime: new Date('2026-05-21T11:30:00Z') }),
      makeRow({ id: 'a3', startTime: new Date('2026-05-22T09:00:00Z') }),
    ]
    const groups = groupByDay(rows, today)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[1].rows).toHaveLength(1)
  })

  it('labels today + tomorrow specifically', () => {
    const rows = [
      makeRow({ id: 'a_today', startTime: new Date('2026-05-20T10:00:00Z') }),
      makeRow({ id: 'a_tomorrow', startTime: new Date('2026-05-21T10:00:00Z') }),
      makeRow({ id: 'a_later', startTime: new Date('2026-05-27T10:00:00Z') }),
    ]
    const groups = groupByDay(rows, today)
    expect(groups[0].label).toMatch(/^Today · /)
    expect(groups[1].label).toMatch(/^Tomorrow · /)
    expect(groups[2].label).not.toMatch(/Today|Tomorrow/)
  })

  it('computes per-day totals correctly', () => {
    const rows = [
      makeRow({ id: 'a1', status: 'confirmed' }),
      makeRow({ id: 'a2', status: 'scheduled' }),
      makeRow({ id: 'a3', status: 'scheduled' }),
      makeRow({ id: 'a4', status: 'completed' }),
      makeRow({ id: 'a5', status: 'cancelled' }),
    ]
    const groups = groupByDay(rows, today)
    expect(groups[0].totals).toEqual({ booked: 5, confirmed: 1, unconfirmed: 2 })
  })

  it('returns an empty array when there are no rows', () => {
    expect(groupByDay([], today)).toEqual([])
  })
})

describe('isRebookingCandidate', () => {
  const now = new Date('2026-06-01T12:00:00Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  it('flags a recent cancelled visit with no future appointment', () => {
    expect(isRebookingCandidate({ status: 'cancelled', startTime: daysAgo(10), hasFutureAppt: false, now })).toBe(true)
  })

  it('flags a recent no-show with no future appointment', () => {
    expect(isRebookingCandidate({ status: 'no_show', startTime: daysAgo(5), hasFutureAppt: false, now })).toBe(true)
  })

  it('does NOT flag when the patient already has a future appointment', () => {
    expect(isRebookingCandidate({ status: 'cancelled', startTime: daysAgo(10), hasFutureAppt: true, now })).toBe(false)
  })

  it('does NOT flag scheduled / confirmed / completed visits', () => {
    for (const status of ['scheduled', 'confirmed', 'completed'] as const) {
      expect(isRebookingCandidate({ status, startTime: daysAgo(10), hasFutureAppt: false, now })).toBe(false)
    }
  })

  it('does NOT flag a cancellation older than 60 days', () => {
    expect(isRebookingCandidate({ status: 'cancelled', startTime: daysAgo(75), hasFutureAppt: false, now })).toBe(false)
  })

  it('includes a cancellation exactly within the 60-day window', () => {
    expect(isRebookingCandidate({ status: 'cancelled', startTime: daysAgo(59), hasFutureAppt: false, now })).toBe(true)
  })
})
