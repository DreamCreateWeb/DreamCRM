import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE REBOOK NUDGE EXECUTOR (ML-29). The yes sends ONCE through the clinic
 * sender with the disclosed "Book a time" button; live staleness at the tap
 * retires (booked since, visit un-done, opted out, campaign this month); a
 * missing booking page REOPENS; a transport failure reopens with deliver()'s words.
 */

const db = vi.hoisted(() => ({ queues: {} as Record<string, unknown[][]> }))
vi.mock('@/lib/db', () => {
  const schema = new Proxy({}, {
    get: (_t, table: string) => new Proxy({ __name: table }, { get: (o, c: string) => (c in o ? (o as Record<string, unknown>)[c] : { __col: c }) }),
  })
  const select = () => {
    let rows: unknown[] = []
    const api: Record<string, unknown> = {}
    for (const m of ['where', 'limit']) api[m] = () => api
    api.from = (t: { __name: string }) => {
      rows = (db.queues[t.__name] ?? []).shift() ?? []
      return api
    }
    api.then = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res)
    return api
  }
  return { db: { select }, schema }
})
vi.mock('drizzle-orm', () => ({ and: () => true, eq: () => true, gte: () => true, inArray: () => true }))

const mail = vi.hoisted(() => ({
  deliver: vi.fn(async (_m: Record<string, unknown>) => {}),
  throws: null as string | null,
  shell: vi.fn((o: Record<string, unknown>) => `<shell>${JSON.stringify(o)}</shell>`),
}))
vi.mock('@/lib/email', () => ({
  deliver: vi.fn(async (m: Record<string, unknown>) => {
    if (mail.throws) throw new Error(mail.throws)
    return mail.deliver(m)
  }),
  patientEmailShell: (o: Record<string, unknown>) => mail.shell(o),
}))
const SENDER = { from: 'Acme <a@x.example>', replyTo: 'front@acme.example', name: 'Acme Dental', timeZone: 'America/Chicago' }
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => SENDER) }))
const site = vi.hoisted(() => ({ url: 'https://acme.example/book' as string | null }))
vi.mock('@/lib/services/marketing-send', () => ({ resolveClinicBookingUrl: vi.fn(async () => site.url) }))
const outreach = vi.hoisted(() => ({ reached: new Set<string>() }))
vi.mock('@/lib/services/proposal-generators/rebook-nudge', () => ({
  patientsInOutreachThisMonth: vi.fn(async () => outreach.reached),
}))

import { executeRebookNudge } from '@/lib/services/proposal-executors/rebook-nudge'

const BODY = 'Hi Maya,\n\nThanks for coming in.\n\nTap below to grab a time.'
const proposal = (over: Record<string, unknown> = {}) =>
  ({ id: 'p1', organizationId: 'org_1', capability: 'rebook_nudge', patientId: 'pt1', body: BODY, payload: {}, decidedByUserId: 'u1', ...over }) as unknown as Parameters<typeof executeRebookNudge>[0]
const PAYLOAD = { appointmentId: 'a1', subject: 'Your next visit isn’t on the calendar yet' }
const YES = '— you approved it'

function seed(o: { visit?: Record<string, unknown> | null; patient?: Record<string, unknown> | null; future?: boolean } = {}) {
  db.queues = {
    appointment: [
      o.visit === null ? [] : [{ id: 'a1', patientId: 'pt1', status: 'completed', type: 'cleaning', ...o.visit }],
      o.future ? [{ id: 'f1' }] : [],
    ],
    patient: [o.patient === null ? [] : [{ id: 'pt1', firstName: 'Maya', email: 'maya@example.com', isActive: 1, marketingEmailOptIn: 1, ...o.patient }]],
  }
}

beforeEach(() => {
  mail.deliver.mockClear()
  mail.shell.mockClear()
  mail.throws = null
  site.url = 'https://acme.example/book'
  outreach.reached = new Set()
  seed()
})

describe('the yes', () => {
  it('sends ONCE with the disclosed button and the clinic sign-off, narrates once', async () => {
    const r = await executeRebookNudge(proposal(), PAYLOAD, YES)
    expect(r).toMatchObject({ ok: true, ledgerSummary: 'Nudged Maya to book their next cleaning — you approved it' })
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(mail.deliver.mock.calls[0][0]).toMatchObject({ to: 'maya@example.com', subject: PAYLOAD.subject, from: SENDER.from, replyTo: SENDER.replyTo })
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.cta).toEqual({ url: 'https://acme.example/book', label: 'Book a time' })
    expect(String(shell.body)).toContain('— Acme Dental')
  })
  it('staff who signed get no second sign-off; HTML is escaped', async () => {
    await executeRebookNudge(proposal({ body: 'Hi <b>Maya</b>\n\n— Dr. Reyes' }), PAYLOAD, YES)
    const body = String(mail.shell.mock.calls[0][0].body)
    expect(body).toContain('&lt;b&gt;')
    expect(body).not.toContain('— Acme Dental')
  })
  it('the machine’s own yes (no approver) sends like any other', async () => {
    const r = await executeRebookNudge(proposal({ decidedByUserId: null }), PAYLOAD, 'on its own')
    expect(r.ok).toBe(true)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
  })
  it('a transport failure comes back in deliver()’s words — reopen', async () => {
    mail.throws = 'Email is paused for this practice.'
    expect(await executeRebookNudge(proposal(), PAYLOAD, YES)).toEqual({ ok: false, error: 'Email is paused for this practice.' })
  })
  it('no live booking page -> REOPEN (not expired), nothing sent', async () => {
    site.url = null
    const r = await executeRebookNudge(proposal(), PAYLOAD, YES)
    expect(r).toMatchObject({ ok: false })
    expect((r as { expired?: boolean }).expired).toBeUndefined()
    expect(mail.deliver).not.toHaveBeenCalled()
  })
})

describe('live staleness at the tap — retires, never sends', () => {
  const retired = async () => {
    const r = await executeRebookNudge(proposal(), PAYLOAD, YES)
    expect(r).toMatchObject({ ok: false, expired: true })
    expect(mail.deliver).not.toHaveBeenCalled()
  }
  it('booked since', async () => {
    seed({ future: true })
    await retired()
  })
  it('visit gone / un-done', async () => {
    seed({ visit: null })
    await retired()
    seed({ visit: { status: 'scheduled' } })
    await retired()
  })
  it('patient archived, opted out or without email', async () => {
    seed({ patient: { isActive: 0 } })
    await retired()
    seed({ patient: { marketingEmailOptIn: 0 } })
    await retired()
    seed({ patient: { email: '' } })
    await retired()
  })
  it('a campaign reached them this month (mutual stand-down)', async () => {
    outreach.reached = new Set(['pt1'])
    await retired()
  })
  it('a payload without its visit reference is refused', async () => {
    expect(await executeRebookNudge(proposal(), {}, YES)).toMatchObject({ ok: false })
  })
})
