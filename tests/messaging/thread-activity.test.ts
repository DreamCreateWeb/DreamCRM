import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The thread-activity marker service — the read-time merge that makes every
 * automated touch observable inside the /messages thread. Pins the Jason
 * case (campaign send + opened → one enriched marker), the appointment
 * lifecycle markers (incl. the cancellation actor from the 2026-07-22
 * mixup rule), chronological ordering, and the empty case.
 */

interface State {
  appts: unknown[]
  reminders: unknown[]
  reviews: unknown[]
  campaignEvents: unknown[]
  balReqs: unknown[]
  balPays: unknown[]
  nps: unknown[]
  forms: unknown[]
  users: unknown[]
}
const state: State = {
  appts: [],
  reminders: [],
  reviews: [],
  campaignEvents: [],
  balReqs: [],
  balPays: [],
  nps: [],
  forms: [],
  users: [],
}

vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: async () => 'America/Chicago',
}))

vi.mock('@/lib/db', async () => {
  const clinic = await import('@/lib/db/schema/clinic')
  const domain = await import('@/lib/db/schema/domain')
  const auth = await import('@/lib/db/schema/auth')
  const rowsFor = (t: unknown): unknown[] => {
    if (t === clinic.appointment) return state.appts
    if (t === clinic.appointmentReminderLog) return state.reminders
    if (t === clinic.reviewRequest) return state.reviews
    if (t === domain.campaignEvents) return state.campaignEvents
    if (t === clinic.balancePaymentRequest) return state.balReqs
    if (t === clinic.patientBalancePayment) return state.balPays
    if (t === clinic.npsResponse) return state.nps
    if (t === clinic.formSubmission) return state.forms
    if (t === auth.user) return state.users
    return []
  }
  // Thenable chain: every step returns itself; awaiting any step (or the
  // final .limit()) resolves the rows — mirrors drizzle's lazy builder.
  const chain = (rows: unknown[]) => {
    const p = {
      innerJoin: () => p,
      leftJoin: () => p,
      where: () => p,
      orderBy: () => p,
      limit: async () => rows,
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(res, rej),
    }
    return p
  }
  return {
    db: { select: () => ({ from: (t: unknown) => chain(rowsFor(t)) }) },
    schema: { ...clinic, ...domain, user: auth.user },
  }
})

import { listThreadActivity } from '@/lib/services/thread-activity'

beforeEach(() => {
  state.appts = []
  state.reminders = []
  state.reviews = []
  state.campaignEvents = []
  state.balReqs = []
  state.balPays = []
  state.nps = []
  state.forms = []
  state.users = []
})

const at = (iso: string) => new Date(iso)

describe('listThreadActivity', () => {
  it('returns [] when the patient has no automated touches', async () => {
    expect(await listThreadActivity('org_1', 'pat_1')).toEqual([])
  })

  it('the Jason case: campaign sent + opened → one marker with the opened signal', async () => {
    state.campaignEvents = [
      { id: 11, type: 'sent', occurredAt: at('2026-07-20T15:00:00Z'), campaignId: 7, campaignName: 'Reactivation — we miss you' },
      { id: 12, type: 'open', occurredAt: at('2026-07-20T16:00:00Z'), campaignId: 7, campaignName: 'Reactivation — we miss you' },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    expect(markers).toHaveLength(1)
    expect(markers[0].kind).toBe('campaign')
    expect(markers[0].label).toBe('Received “Reactivation — we miss you”')
    expect(markers[0].detail).toBe('opened ✓')
    expect(markers[0].href).toBe('/growth/campaigns/7')
  })

  it('appointment lifecycle: booked + cancelled markers, cancellation names the channel', async () => {
    state.appts = [
      {
        id: 'a1',
        type: 'cleaning',
        status: 'cancelled',
        startTime: at('2026-08-06T19:00:00Z'),
        createdAt: at('2026-07-01T12:00:00Z'),
        confirmedAt: null,
        cancelledAt: at('2026-07-21T12:00:00Z'),
        completedAt: null,
        noShowedAt: null,
        cancelledVia: 'portal',
        cancelledByUserId: null,
        source: 'booking_widget',
      },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    expect(markers.map((m) => m.id)).toEqual(['appt_booked_a1', 'appt_cancelled_a1'])
    expect(markers[0].label).toBe('Cleaning booked')
    expect(markers[0].detail).toContain('online')
    expect(markers[1].label).toBe('Cleaning cancelled')
    expect(markers[1].detail).toContain('patient portal')
    // Booked marker sits at creation time, cancel marker at the cancel stamp.
    expect(markers[0].occurredAt).toEqual(at('2026-07-01T12:00:00Z'))
    expect(markers[1].occurredAt).toEqual(at('2026-07-21T12:00:00Z'))
  })

  it('open/click signals attribute PER SEND — last year’s open never marks this year’s send', async () => {
    state.campaignEvents = [
      // Recurring birthday automation, same campaignId across years.
      { id: 21, type: 'sent', occurredAt: at('2025-07-20T15:00:00Z'), campaignId: 9, campaignName: 'Birthday treat' },
      { id: 22, type: 'open', occurredAt: at('2025-07-20T16:00:00Z'), campaignId: 9, campaignName: 'Birthday treat' },
      { id: 23, type: 'sent', occurredAt: at('2026-07-20T15:00:00Z'), campaignId: 9, campaignName: 'Birthday treat' },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    expect(markers.find((m) => m.id === 'camp_21')!.detail).toBe('opened ✓')
    expect(markers.find((m) => m.id === 'camp_23')!.detail).toBeNull()
  })

  it('a click outranks an open on the same send', async () => {
    state.campaignEvents = [
      { id: 31, type: 'sent', occurredAt: at('2026-07-20T15:00:00Z'), campaignId: 5, campaignName: 'Recall' },
      { id: 32, type: 'open', occurredAt: at('2026-07-20T16:00:00Z'), campaignId: 5, campaignName: 'Recall' },
      { id: 33, type: 'click', occurredAt: at('2026-07-20T16:05:00Z'), campaignId: 5, campaignName: 'Recall' },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    expect(markers.find((m) => m.id === 'camp_31')!.detail).toBe('clicked ✓')
  })

  it('legacy rows without lifecycle stamps never mint a FUTURE-dated marker', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000)
    state.appts = [
      {
        id: 'a3',
        type: 'cleaning',
        status: 'cancelled',
        startTime: future,
        createdAt: at('2026-07-01T12:00:00Z'),
        confirmedAt: null,
        cancelledAt: null, // pre-0133 row — no cancel stamp
        completedAt: null,
        noShowedAt: null,
        cancelledVia: null,
        cancelledByUserId: null,
        source: null,
      },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    const cancel = markers.find((m) => m.id === 'appt_cancelled_a3')!
    expect(cancel.occurredAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('staff cancellations name the staff member (one name lookup)', async () => {
    state.appts = [
      {
        id: 'a2',
        type: 'checkup',
        status: 'cancelled',
        startTime: at('2026-08-06T19:00:00Z'),
        createdAt: at('2026-07-01T12:00:00Z'),
        confirmedAt: null,
        cancelledAt: at('2026-07-21T12:00:00Z'),
        completedAt: null,
        noShowedAt: null,
        cancelledVia: 'staff',
        cancelledByUserId: 'u9',
        source: null,
      },
    ]
    state.users = [{ id: 'u9', name: 'Maria Vega' }]
    const markers = await listThreadActivity('org_1', 'pat_1')
    const cancel = markers.find((m) => m.id === 'appt_cancelled_a2')!
    expect(cancel.detail).toContain('Maria Vega')
  })

  it('merges every source and sorts oldest → newest', async () => {
    state.reminders = [
      { id: 'r1', channel: 'email', sentAt: at('2026-07-19T09:00:00Z'), appointmentId: 'a1', apptStart: at('2026-07-20T14:00:00Z'), apptType: 'cleaning' },
    ]
    state.reviews = [
      { id: 'rv1', status: 'completed', sentAt: at('2026-07-21T10:00:00Z'), completedAt: at('2026-07-21T11:00:00Z'), rating: 5, selectedSite: 'google' },
    ]
    state.balReqs = [
      { id: 'b1', sentAt: at('2026-07-18T10:00:00Z'), balanceCentsAtSend: 12000, source: 'auto' },
    ]
    state.balPays = [
      { id: 'p1', amountCents: 12000, paidAt: at('2026-07-18T15:00:00Z') },
    ]
    state.nps = [
      { id: 'n1', sentAt: at('2026-07-20T18:00:00Z'), respondedAt: at('2026-07-20T19:00:00Z'), score: 9 },
    ]
    state.forms = [
      { id: 'f1', formTitle: 'New patient intake', submittedAt: at('2026-07-17T10:00:00Z') },
    ]
    const markers = await listThreadActivity('org_1', 'pat_1')
    const times = markers.map((m) => m.occurredAt.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(markers.map((m) => m.kind)).toEqual([
      'form', // completed intake
      'balance', // reminder sent
      'balance', // paid online
      'reminder', // appointment reminder
      'survey', // sent
      'survey', // answered 9/10
      'review', // request sent
      'review', // 5★ left
    ])
    expect(markers.find((m) => m.id === 'bal_sent_b1')!.detail).toBe('$120 · auto')
    expect(markers.find((m) => m.id === 'bal_paid_p1')!.label).toBe('Paid $120 online')
    expect(markers.find((m) => m.id === 'nps_done_n1')!.label).toBe('Survey answered · 9/10')
    expect(markers.find((m) => m.id === 'rr_done_rv1')!.label).toBe('Left a 5★ review')
    expect(markers.find((m) => m.id === 'form_f1')!.label).toBe('Completed “New patient intake”')
    expect(markers.find((m) => m.id === 'rem_r1')!.label).toBe('Cleaning reminder sent')
  })
})
