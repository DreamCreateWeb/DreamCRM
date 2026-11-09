import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE POST-OP CHECK-IN GENERATOR (ML-28 — ask-first, grantable, under
 * ML-11's lane convention). Pins:
 *  - the selection rule: a 'completed' visit of a type flagged "check in
 *    the day after" (extraction / root canal / implant by default; the
 *    practice's own flags win), started on a PRIOR clinic-local day within
 *    the 2-day lookback, whose patient is active with their own email;
 *    today's visit, an older one, an unflagged type, no email, an inactive
 *    patient, another org — none file;
 *  - dedupe: one card per visit, ever (sourceKey = postop_checkin:<apptId>)
 *    and one OPEN card per patient; the per-pass cap;
 *  - the filed artifact: AI-free, the two lines pinned by words, the
 *    patient on the row, the subject disclosed, the visit as context, a
 *    3-day expiry; "yesterday" vs the dated wording.
 */

const store = vi.hoisted(() => ({
  profiles: [] as Array<Record<string, unknown>>,
  visits: [] as Array<Record<string, unknown>>,
  proposals: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === 'clinic_profile') return store.profiles
    if (name === 'appointment') return store.visits
    if (name === 'proposal') return store.proposals
    return []
  }
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.innerJoin = () => api
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rowsFor = () => {
      let out = tableRows(table).filter((r) => filters.every((f) => f(r)))
      if (cols) out = out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]])))
      return out
    }
    api.orderBy = () => api
    api.limit = async (n?: number) => (typeof n === 'number' ? rowsFor().slice(0, n) : rowsFor())
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }
  const t = (name: string, ...names: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(names.map((c) => [c, col(c)])))
  return {
    db: { select },
    schema: {
      clinicProfile: t('clinic_profile', 'organizationId', 'visitTypeSettings'),
      appointment: t('appointment', 'id', 'organizationId', 'patientId', 'type', 'status', 'startTime'),
      patient: t('patient', 'id', 'organizationId', 'firstName', 'lastName', 'email', 'isActive'),
      proposal: t('proposal', 'id', 'organizationId', 'capability', 'status', 'sourceKey', 'payload', 'patientId'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) => vals.includes(r[col.__col]),
  asc: () => 'asc',
}))

const filed = vi.hoisted(() => ({ inputs: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async (input: Record<string, unknown>) => {
    filed.inputs.push(input)
    store.proposals.push({
      id: `prop_${store.proposals.length + 1}`,
      organizationId: input.organizationId,
      capability: input.capability,
      sourceKey: input.sourceKey,
      status: 'open',
      payload: input.payload,
      patientId: input.patientId,
    })
    return { filed: true, id: `prop_${store.proposals.length}` }
  }),
}))

import {
  generatePostopCheckinProposals,
  postopCheckinBody,
  MAX_POSTOP_CHECKINS_PER_RUN,
  POSTOP_CHECKIN_LOOKBACK_DAYS,
} from '@/lib/services/proposal-generators/postop-checkin'

const ORG = 'org_1'
const TZ = 'America/Chicago'
// Friday 2026-07-31, 9 AM Chicago (CDT) — the morning after.
const FRI_9AM = new Date('2026-07-31T14:00:00Z')
const THU_2PM = new Date('2026-07-30T19:00:00Z') // yesterday
const WED_2PM = new Date('2026-07-29T19:00:00Z') // the day before yesterday — still in the lookback
const TUE_2PM = new Date('2026-07-28T19:00:00Z') // too old
const FRI_8AM = new Date('2026-07-31T13:00:00Z') // today — tonight's aftercare, not a question yet

let seq = 0
function seedVisit(opts: {
  type?: string
  status?: string
  startTime?: Date
  email?: string | null
  isActive?: number
  org?: string
  patientId?: string
}): string {
  const id = `appt_${++seq}`
  store.visits.push({
    id,
    organizationId: opts.org ?? ORG,
    patientId: opts.patientId ?? `pat_${seq}`,
    type: opts.type ?? 'extraction',
    status: opts.status ?? 'completed',
    startTime: opts.startTime ?? THU_2PM,
    firstName: 'Maria',
    lastName: 'Lopez',
    email: opts.email === undefined ? `maria${seq}@example.com` : opts.email,
    isActive: opts.isActive ?? 1,
  })
  return id
}

beforeEach(() => {
  store.profiles = [{ organizationId: ORG, visitTypeSettings: null }]
  store.visits.length = 0
  store.proposals.length = 0
  filed.inputs.length = 0
  seq = 0
})

describe('the day after', () => {
  it('files ONE "How are you feeling?" card for yesterday’s extraction — AI-free, the patient on the row, the visit as context', async () => {
    const id = seedVisit({})
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    expect(filed.inputs).toHaveLength(1)
    const card = filed.inputs[0]
    expect(card).toMatchObject({
      organizationId: ORG,
      capability: 'postop_checkin',
      sourceKey: `postop_checkin:${id}`,
      patientId: 'pat_1',
      title: 'Check in on Maria after yesterday’s extraction',
      body: postopCheckinBody('Maria', 'extraction', 'yesterday'),
    })
    expect(String(card.body)).toContain('How are you feeling?')
    expect(String(card.body)).toContain('reply to this email or give us a call')
    expect(String(card.body)).not.toMatch(/\btext(s|ing)?\b/i)
    expect(card.payload).toMatchObject({
      appointmentId: id,
      patientId: 'pat_1',
      visitType: 'extraction',
      visitLabel: 'extraction',
      subject: 'How are you feeling, Maria?',
      context: { kind: 'visit', author: 'Maria Lopez' },
    })
    expect(String((card.payload as Record<string, unknown> & { context: { text: string } }).context.text)).toContain('Extraction')
    expect((card.expiresAt as Date).getTime()).toBe(FRI_9AM.getTime() + 3 * 24 * 3_600_000)
  })

  it('the day before yesterday still qualifies (a missed tick), worded with the date; older does not; today does not', async () => {
    seedVisit({ startTime: WED_2PM })
    seedVisit({ startTime: TUE_2PM })
    seedVisit({ startTime: FRI_8AM })
    expect(POSTOP_CHECKIN_LOOKBACK_DAYS).toBe(2)
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    expect(filed.inputs[0]).toMatchObject({ sourceKey: 'postop_checkin:appt_1', title: 'Check in on Maria after their extraction' })
    expect(String(filed.inputs[0].body)).toMatch(/after your extraction on \w+/)
    expect(String(filed.inputs[0].body)).not.toContain('yesterday')
  })

  it('only the flagged types: a cleaning files nothing by default; the practice’s own flags win', async () => {
    seedVisit({ type: 'cleaning' })
    seedVisit({ type: 'root_canal' })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    expect(filed.inputs[0]).toMatchObject({ sourceKey: 'postop_checkin:appt_2', title: 'Check in on Maria after yesterday’s root canal' })

    // The practice turned the extraction check-in OFF and a custom type ON.
    filed.inputs.length = 0
    store.proposals.length = 0
    store.visits.length = 0
    store.profiles = [
      {
        organizationId: ORG,
        visitTypeSettings: [
          { id: 'extraction', label: 'Extraction', durationMinutes: 45, checkInAfter: false },
          { id: 'deep_cleaning', label: 'Deep cleaning', durationMinutes: 60, checkInAfter: true },
        ],
      },
    ]
    seedVisit({ type: 'extraction' })
    seedVisit({ type: 'deep_cleaning' })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    expect(filed.inputs[0]).toMatchObject({ title: 'Check in on Maria after yesterday’s deep cleaning' })
  })

  it('an un-done visit, no email, an inactive patient, another org — none file', async () => {
    seedVisit({ status: 'no_show' })
    seedVisit({ status: 'scheduled' })
    seedVisit({ email: null })
    seedVisit({ email: ' ' })
    seedVisit({ isActive: 0 })
    seedVisit({ org: 'org_2' })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(0)
    expect(filed.inputs).toHaveLength(0)
  })
})

describe('dedupe and the cap', () => {
  it('one card per visit, ever — the second pass files nothing', async () => {
    seedVisit({})
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(0)
    expect(filed.inputs).toHaveLength(1)
  })

  it('a declined card is the answer about that visit: a closed row with the sourceKey blocks a re-ask', async () => {
    const id = seedVisit({})
    store.proposals.push({ id: 'old', organizationId: ORG, capability: 'postop_checkin', sourceKey: `postop_checkin:${id}`, status: 'declined', payload: {} })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(0)
  })

  it('one OPEN card per patient: two procedures in one afternoon earn one question', async () => {
    seedVisit({ patientId: 'pat_same', type: 'extraction' })
    seedVisit({ patientId: 'pat_same', type: 'root_canal' })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(1)
    // A card already open for the patient (from an earlier pass) blocks a second.
    store.visits.length = 0
    seedVisit({ patientId: 'pat_same', type: 'root_canal', startTime: WED_2PM })
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(0)
  })

  it('at most MAX_POSTOP_CHECKINS_PER_RUN per pass', async () => {
    for (let i = 0; i < MAX_POSTOP_CHECKINS_PER_RUN + 2; i++) seedVisit({})
    expect(await generatePostopCheckinProposals(ORG, FRI_9AM, TZ)).toBe(MAX_POSTOP_CHECKINS_PER_RUN)
  })
})
