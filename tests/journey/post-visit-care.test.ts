import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST-VISIT CARE (ML-28 — the first AUTO lane under ML-11's convention).
 * Pins the rule, not the plumbing (the claim statement Postgres receives is
 * pinned by post-visit-care-sql.test.ts):
 *  - the window: at or after 6 PM on the clinic's own clock, INSIDE quiet
 *    hours (8 PM and later send nothing), for visits that STARTED today
 *    clinic-local and are 'completed';
 *  - who: an active patient with their own email, a type with aftercare
 *    text (blank = the switch is off; the standard defaults fill an older
 *    settings blob); another org's visit never qualifies;
 *  - ONCE PER VISIT through the reminder log's claim (template
 *    'aftercare'); the second tick of the evening sends nothing twice;
 *  - the email: the clinic sender, the practice's words escaped, no texting
 *    copy; a transport failure releases the claim, narrates nothing and
 *    reports to the driver once;
 *  - NARRATE ONCE per note, under post_visit_care, with the patient — and
 *    only after the send; the CommLog mirror is best-effort;
 *  - the lane files no cards: the return is always 0.
 */

const store = vi.hoisted(() => ({
  profiles: [] as Array<Record<string, unknown>>,
  // appointment ⋈ patient, flattened (the join is a no-op in the mock).
  visits: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === 'clinic_profile') return store.profiles
    if (name === 'appointment') return store.visits
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
  asc: () => 'asc',
}))

// The reminder log's claim, modelled: one row per (appointment, template)
// while a claim is held; a second claim loses; a release frees it.
const claims = vi.hoisted(() => ({
  held: new Set<string>(),
  claim: vi.fn(),
  release: vi.fn(),
}))
vi.mock('@/lib/services/appointments', () => ({
  claimAutomatedReminder: vi.fn(async (input: { appointmentId: string; template: string; channel: string; organizationId: string }) => {
    claims.claim(input)
    const key = `${input.appointmentId}:${input.template}`
    if (claims.held.has(key)) return null
    claims.held.add(key)
    return { id: `rem_${claims.held.size}`, ...input }
  }),
  releaseReminderClaim: vi.fn(async (claim: { appointmentId: string; template: string }) => {
    claims.release(claim)
    claims.held.delete(`${claim.appointmentId}:${claim.template}`)
  }),
}))

const SENDER = {
  from: 'Acme Dental <acme@dreamcreatestudio.com>',
  replyTo: 'acme@in.dreamcreatestudio.com',
  name: 'Acme Dental',
  timeZone: 'America/Chicago',
}
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => SENDER) }))

const mail = vi.hoisted(() => ({
  deliver: vi.fn(async (_m: Record<string, unknown>) => {}),
  shell: vi.fn((opts: Record<string, unknown>) => `<shell>${JSON.stringify(opts)}</shell>`),
  deliverThrows: null as string | null,
}))
vi.mock('@/lib/email', () => ({
  deliver: vi.fn(async (m: Record<string, unknown>) => {
    if (mail.deliverThrows) throw new Error(mail.deliverThrows)
    return mail.deliver(m)
  }),
  patientEmailShell: (opts: Record<string, unknown>) => mail.shell(opts),
}))

const ledger = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: vi.fn(async (input: Record<string, unknown>) => {
    ledger.entries.push(input)
    return true
  }),
}))

const commlog = vi.hoisted(() => ({ calls: [] as unknown[][], throws: false }))
vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(async (...a: unknown[]) => {
    if (commlog.throws) throw new Error('pms down')
    commlog.calls.push(a)
  }),
}))

import { generatePostVisitCare, POST_VISIT_CARE_HOUR } from '@/lib/services/proposal-generators/post-visit-care'
import { AFTERCARE_TEMPLATE } from '@/lib/types/reminders'
import { DEFAULT_AFTERCARE_BY_ID } from '@/lib/types/visit-types'

const ORG = 'org_1'
const TZ = 'America/Chicago'
// Thursday 2026-07-30 in Chicago (CDT, UTC-5).
const SIX_THIRTY_PM = new Date('2026-07-30T23:30:00Z') // 6:30 PM local
const FIVE_PM = new Date('2026-07-30T22:00:00Z') // 5 PM local — not yet
const EIGHT_PM = new Date('2026-07-31T01:00:00Z') // 8 PM local — quiet hours
const TEN_AM = new Date('2026-07-30T15:00:00Z') // 10 AM local, today
const YESTERDAY_TEN_AM = new Date('2026-07-29T15:00:00Z')

let seq = 0
function seedVisit(opts: {
  type?: string
  status?: string
  startTime?: Date
  email?: string | null
  isActive?: number
  org?: string
  firstName?: string
}): string {
  const id = `appt_${++seq}`
  store.visits.push({
    id,
    organizationId: opts.org ?? ORG,
    patientId: `pat_${seq}`,
    type: opts.type ?? 'cleaning',
    status: opts.status ?? 'completed',
    startTime: opts.startTime ?? TEN_AM,
    firstName: opts.firstName ?? 'Maria',
    lastName: 'Lopez',
    email: opts.email === undefined ? `maria${seq}@example.com` : opts.email,
    isActive: opts.isActive ?? 1,
  })
  return id
}

beforeEach(() => {
  store.profiles = [{ organizationId: ORG, visitTypeSettings: null }]
  store.visits.length = 0
  claims.held.clear()
  claims.claim.mockClear()
  claims.release.mockClear()
  mail.deliver.mockClear()
  mail.shell.mockClear()
  mail.deliverThrows = null
  ledger.entries.length = 0
  commlog.calls.length = 0
  commlog.throws = false
  seq = 0
})

describe('the evening of the visit', () => {
  it('at 6:30 PM clinic-local, a cleaning completed today gets the practice’s aftercare — once, narrated once, mirrored', async () => {
    const id = seedVisit({})
    expect(POST_VISIT_CARE_HOUR).toBe(18)
    const filed = await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    // The lane files no cards.
    expect(filed).toBe(0)

    // The claim came FIRST, under the aftercare template, as an automated email touch.
    expect(claims.claim).toHaveBeenCalledTimes(1)
    expect(claims.claim.mock.calls[0][0]).toEqual({ organizationId: ORG, appointmentId: id, channel: 'email', template: AFTERCARE_TEMPLATE })
    expect(AFTERCARE_TEMPLATE).toBe('aftercare')

    expect(mail.deliver).toHaveBeenCalledTimes(1)
    const sent = mail.deliver.mock.calls[0][0]
    expect(sent).toMatchObject({ to: 'maria1@example.com', subject: 'After your cleaning today', from: SENDER.from, replyTo: SENDER.replyTo })
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.sender).toBe(SENDER)
    expect(String(shell.body)).toContain('Hi Maria,')
    // The practice's own words — the standard default for a cleaning.
    expect(String(shell.body)).toContain(DEFAULT_AFTERCARE_BY_ID.cleaning.slice(0, 40))
    expect(String(shell.body)).toContain('— Acme Dental')
    // No texting copy, anywhere.
    expect(JSON.stringify(shell)).not.toMatch(/\btext(s|ing)?\b/i)

    // NARRATE ONCE, with the patient, under the auto lane's own key.
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]).toMatchObject({
      organizationId: ORG,
      capability: 'post_visit_care',
      patientId: 'pat_1',
      summary: 'Sent Maria their aftercare after today’s cleaning',
      detail: { appointmentId: id, channel: 'email', template: 'aftercare', visitType: 'cleaning' },
    })
    expect(commlog.calls).toHaveLength(1)
    expect(commlog.calls[0][0]).toBe(ORG)
    expect(commlog.calls[0][1]).toBe('pat_1')
    expect(commlog.calls[0][2]).toMatchObject({ mode: 'Email', sentOrReceived: 'Sent' })
  })

  it('before 6 PM nothing is claimed, sent or narrated — the day is not done', async () => {
    seedVisit({})
    await generatePostVisitCare(ORG, FIVE_PM, TZ)
    expect(claims.claim).not.toHaveBeenCalled()
    expect(mail.deliver).not.toHaveBeenCalled()
    expect(ledger.entries).toHaveLength(0)
  })

  it('from 8 PM quiet hours hold — nothing goes out, and "today" is never widened to tomorrow', async () => {
    seedVisit({})
    await generatePostVisitCare(ORG, EIGHT_PM, TZ)
    expect(claims.claim).not.toHaveBeenCalled()
    expect(mail.deliver).not.toHaveBeenCalled()
    // 8 PM is still Thursday in Chicago; the visit is still "today" — the
    // only thing stopping it is quiet hours, so the next morning's tick
    // (a new day) finds nothing either. By design: aftercare a day late is
    // the wrong message.
    const NEXT_MORNING = new Date('2026-07-31T14:00:00Z')
    await generatePostVisitCare(ORG, NEXT_MORNING, TZ)
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('the second tick of the evening sends nothing twice — the reminder log’s claim is the dedupe', async () => {
    seedVisit({})
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    const SEVEN_THIRTY_PM = new Date('2026-07-31T00:30:00Z')
    await generatePostVisitCare(ORG, SEVEN_THIRTY_PM, TZ)
    expect(claims.claim).toHaveBeenCalledTimes(2)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(ledger.entries).toHaveLength(1)
  })
})

describe('who qualifies', () => {
  it('yesterday’s visit, an un-done visit, a type without aftercare, no email, an inactive patient, another org — none of them', async () => {
    seedVisit({ startTime: YESTERDAY_TEN_AM })
    seedVisit({ status: 'scheduled' })
    seedVisit({ status: 'no_show' })
    seedVisit({ type: 'checkup' }) // no default aftercare
    seedVisit({ email: null })
    seedVisit({ email: '   ' })
    seedVisit({ isActive: 0 })
    seedVisit({ org: 'org_2' })
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    expect(claims.claim).not.toHaveBeenCalled()
    expect(mail.deliver).not.toHaveBeenCalled()
    expect(ledger.entries).toHaveLength(0)
  })

  it('a stored blank is the switch: the practice emptied the cleaning text, so no cleaning note goes out', async () => {
    store.profiles = [
      {
        organizationId: ORG,
        visitTypeSettings: [
          { id: 'cleaning', label: 'Cleaning', durationMinutes: 30, aftercareInstructions: '' },
          { id: 'filling', label: 'Filling', durationMinutes: 30, aftercareInstructions: 'Our own words: wait for the numbness to pass.' },
        ],
      },
    ]
    seedVisit({ type: 'cleaning' })
    const filling = seedVisit({ type: 'filling' })
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(claims.claim.mock.calls[0][0]).toMatchObject({ appointmentId: filling })
    expect(String(mail.shell.mock.calls[0][0].body)).toContain('Our own words: wait for the numbness to pass.')
    expect(mail.deliver.mock.calls[0][0]).toMatchObject({ subject: 'After your filling today' })
  })

  it('an older settings blob with no aftercare key gets the standard default for its id', async () => {
    store.profiles = [
      { organizationId: ORG, visitTypeSettings: [{ id: 'extraction', label: 'Extraction', durationMinutes: 45 }] },
    ]
    seedVisit({ type: 'extraction' })
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(String(mail.shell.mock.calls[0][0].body)).toContain('no straws')
  })

  it('every value in the email is escaped — a patient named with angle brackets stays text', async () => {
    seedVisit({ firstName: 'Maria <3' })
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    const body = String(mail.shell.mock.calls[0][0].body)
    expect(body).toContain('Hi Maria &lt;3,')
    expect(body).not.toContain('<3')
  })
})

describe('when the email does not go out', () => {
  it('releases the claim, narrates nothing, mirrors nothing, and tells the driver once', async () => {
    const id = seedVisit({})
    mail.deliverThrows = 'provider down'
    const soft = vi.fn()
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ, soft)
    expect(claims.release).toHaveBeenCalledTimes(1)
    expect(claims.release.mock.calls[0][0]).toMatchObject({ appointmentId: id, template: 'aftercare' })
    expect(ledger.entries).toHaveLength(0)
    expect(commlog.calls).toHaveLength(0)
    expect(soft).toHaveBeenCalledTimes(1)
    // The claim is free again: the next tick inside the window tries again.
    mail.deliverThrows = null
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ, soft)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(ledger.entries).toHaveLength(1)
  })

  it('a failed CommLog mirror never un-sends: the note is out, the ledger has it', async () => {
    seedVisit({})
    commlog.throws = true
    await generatePostVisitCare(ORG, SIX_THIRTY_PM, TZ)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(ledger.entries).toHaveLength(1)
    expect(claims.release).not.toHaveBeenCalled()
  })
})
