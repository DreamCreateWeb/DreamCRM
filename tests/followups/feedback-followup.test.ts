import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * ML-21 — the follow-up beside the bell. `autoCreateFeedbackFollowup` files
 * "Call <first> about their visit" (kind 'feedback', due tomorrow on the
 * CLINIC's calendar, assigned to nobody) exactly once per note:
 *  - keyed on the visit the feedback is about when the row knows it (any
 *    status — a re-submitted note after the call never re-opens the task);
 *  - otherwise one OPEN 'feedback' follow-up per patient;
 *  - narrates under followup_rule (an auto capability with a ledger writer);
 *  - never throws into the bell.
 */

const store = vi.hoisted(() => ({
  followups: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  selectThrows: false,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const t = (name: string, ...names: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(names.map((c) => [c, col(c)])))
  function select(cols?: Record<string, { __col: string }>) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = (preds: unknown) => {
      if (store.selectThrows) throw new Error('db down')
      for (const p of Array.isArray(preds) ? preds : [preds]) if (typeof p === 'function') filters.push(p as never)
      return api
    }
    const rows = () =>
      store.followups
        .filter((r) => filters.every((f) => f(r)))
        .map((r) => (cols ? Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, r[c.__col]])) : r))
    api.limit = async (n: number) => rows().slice(0, n)
    return api
  }
  return {
    db: {
      select,
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          store.inserts.push(v)
          store.followups.push(v)
        },
      }),
    },
    schema: {
      patientFollowup: t('patient_followup', 'id', 'organizationId', 'patientId', 'kind', 'status', 'sourceAppointmentId'),
      patient: t('patient', 'id', 'organizationId', 'firstName', 'lastName'),
      member: t('member', 'id', 'organizationId', 'userId'),
      user: t('user', 'id', 'name'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  asc: () => 'asc',
  desc: () => 'desc',
  gte: () => () => true,
  inArray: () => () => true,
  isNotNull: () => () => true,
  ne: () => () => true,
  sql: Object.assign(() => 'sql', { raw: () => 'raw' }),
}))

vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

const ledger = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: vi.fn(async (input: Record<string, unknown>) => {
    ledger.entries.push(input)
    return true
  }),
}))

import { autoCreateFeedbackFollowup } from '@/lib/services/patient-followups'

const ORG = 'org_1'
// 03:30 UTC on July 2 = 10:30 PM on July 1 in Chicago: "tomorrow" on the
// clinic's calendar is July 2, not the server's July 3.
const NOW = new Date('2026-07-02T03:30:00Z')

beforeEach(() => {
  store.followups = []
  store.inserts = []
  store.selectThrows = false
  ledger.entries = []
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('what gets filed', () => {
  it('"Call <first> about their visit", kind feedback, due tomorrow clinic-local, unassigned, narrated under followup_rule', async () => {
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', {
      kind: 'review',
      reviewRequestId: 'rr_1',
      appointmentId: 'appt_1',
      rating: 2,
    })
    expect(r).toMatchObject({ created: true })
    expect(store.inserts).toHaveLength(1)
    expect(store.inserts[0]).toMatchObject({
      organizationId: ORG,
      patientId: 'pat_1',
      title: 'Call Mia about their visit',
      kind: 'feedback',
      dueDate: '2026-07-02',
      assignedUserId: null,
      createdBy: null,
      status: 'open',
      sourceAppointmentId: 'appt_1',
    })
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]).toMatchObject({
      capability: 'followup_rule',
      patientId: 'pat_1',
      detail: { rule: 'feedback', reviewRequestId: 'rr_1', rating: 2 },
    })
    expect(String(ledger.entries[0].summary)).toContain('call Mia')
  })

  it('a survey detractor reads as a survey in the ledger line; a missing first name never blanks the title', async () => {
    await autoCreateFeedbackFollowup(ORG, 'pat_1', null, { kind: 'nps', npsResponseId: 'n_1', score: 4 })
    expect(store.inserts[0]).toMatchObject({ title: 'Call this patient about their visit', sourceAppointmentId: null })
    expect(String(ledger.entries[0].summary)).toContain('4/10 survey')
    expect(ledger.entries[0].detail).toMatchObject({ rule: 'feedback', npsResponseId: 'n_1', score: 4 })
  })
})

describe('one follow-up per note', () => {
  it('the same visit never earns a second follow-up — even after the first was closed', async () => {
    store.followups.push({
      id: 'fu_done',
      organizationId: ORG,
      patientId: 'pat_1',
      kind: 'feedback',
      status: 'done',
      sourceAppointmentId: 'appt_1',
    })
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', {
      kind: 'review',
      reviewRequestId: 'rr_1',
      appointmentId: 'appt_1',
      rating: 1,
    })
    expect(r).toEqual({ id: 'fu_done', created: false })
    expect(store.inserts).toHaveLength(0)
    expect(ledger.entries).toHaveLength(0)
  })

  it('without a visit on the row, an OPEN feedback follow-up for the patient is joined, not doubled', async () => {
    store.followups.push({
      id: 'fu_open',
      organizationId: ORG,
      patientId: 'pat_1',
      kind: 'feedback',
      status: 'open',
      sourceAppointmentId: null,
    })
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', { kind: 'nps', npsResponseId: 'n_1', score: 3 })
    expect(r).toEqual({ id: 'fu_open', created: false })
    expect(store.inserts).toHaveLength(0)
  })

  it('a closed one (no visit) means a NEW note is a new thing to look at', async () => {
    store.followups.push({
      id: 'fu_done',
      organizationId: ORG,
      patientId: 'pat_1',
      kind: 'feedback',
      status: 'done',
      sourceAppointmentId: null,
    })
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', { kind: 'nps', npsResponseId: 'n_2', score: 3 })
    expect(r).toMatchObject({ created: true })
    expect(store.inserts).toHaveLength(1)
  })

  it('another patient’s open feedback follow-up, or another kind for this patient, does not count', async () => {
    store.followups.push(
      { id: 'fu_other', organizationId: ORG, patientId: 'pat_2', kind: 'feedback', status: 'open', sourceAppointmentId: null },
      { id: 'fu_rebook', organizationId: ORG, patientId: 'pat_1', kind: 'rebook', status: 'open', sourceAppointmentId: null },
    )
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', { kind: 'nps', npsResponseId: 'n_1', score: 3 })
    expect(r).toMatchObject({ created: true })
  })

  it('tenant-scoped: an identical row in another org is invisible', async () => {
    store.followups.push({
      id: 'fu_elsewhere',
      organizationId: 'org_2',
      patientId: 'pat_1',
      kind: 'feedback',
      status: 'open',
      sourceAppointmentId: 'appt_1',
    })
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', {
      kind: 'review',
      reviewRequestId: 'rr_1',
      appointmentId: 'appt_1',
      rating: 2,
    })
    expect(r).toMatchObject({ created: true })
    expect(store.inserts[0]).toMatchObject({ organizationId: ORG })
  })
})

describe('never into the bell', () => {
  it('a database failure returns null — the bell still rings', async () => {
    store.selectThrows = true
    const r = await autoCreateFeedbackFollowup(ORG, 'pat_1', 'Mia', { kind: 'nps', npsResponseId: 'n_1', score: 3 })
    expect(r).toBeNull()
    expect(store.inserts).toHaveLength(0)
  })
})
