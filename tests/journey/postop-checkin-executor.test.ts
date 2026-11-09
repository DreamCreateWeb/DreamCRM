import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE POST-OP CHECK-IN EXECUTOR (ML-28). Pins the executor's own contract —
 * the approve wrapper's narrate-once / reopen / atomic-claim laws are pinned
 * through approveProposal in proposals-service.test.ts:
 *  - the yes sends ONCE through the clinic sender (patientEmailShell,
 *    deliver) with the sender's reply-to — the Messages inbox — and the
 *    clinic's sign-off unless staff signed; HTML in the body is escaped;
 *  - the CommLog mirror follows the send, best-effort;
 *  - the machine's own yes (no approver) is allowed — the lane is grantable;
 *  - live staleness at the tap: a vanished visit, one no longer 'completed',
 *    or one that belongs to another patient → retire; an inactive patient →
 *    retire; no email NOW → reopen with advice, never a retire;
 *  - a transport failure comes back as deliver()'s own words — reopen,
 *    nothing mirrored.
 */

const rows = vi.hoisted(() => ({
  visit: null as Record<string, unknown> | null,
  patient: null as Record<string, unknown> | null,
}))
vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const select = () => {
    let table = ''
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = () => api
    api.limit = async () => {
      const r = table === 'appointment' ? rows.visit : table === 'patient' ? rows.patient : null
      return r ? [r] : []
    }
    return api
  }
  const t = (name: string, ...names: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(names.map((c) => [c, col(c)])))
  return {
    db: { select },
    schema: {
      appointment: t('appointment', 'id', 'organizationId', 'status', 'patientId'),
      patient: t('patient', 'id', 'organizationId', 'firstName', 'lastName', 'email', 'isActive'),
    },
  }
})
vi.mock('drizzle-orm', () => ({ eq: () => true, and: () => true }))

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

const SENDER = {
  from: 'Acme Dental <acme@dreamcreatestudio.com>',
  replyTo: 'acme@in.dreamcreatestudio.com',
  name: 'Acme Dental',
  timeZone: 'America/Chicago',
}
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => SENDER) }))

const commlog = vi.hoisted(() => ({ calls: [] as unknown[][], throws: false }))
vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(async (...a: unknown[]) => {
    if (commlog.throws) throw new Error('pms down')
    commlog.calls.push(a)
  }),
}))

import { executePostopCheckin } from '@/lib/services/proposal-executors/postop-checkin'

const ORG = 'org_1'
const BODY = 'Hi Maria — just checking in after your extraction yesterday. How are you feeling?\n\nIf anything is sore, reply to this email or give us a call.'

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    organizationId: ORG,
    capability: 'postop_checkin',
    patientId: 'pat_1',
    sourceKey: 'postop_checkin:appt_1',
    title: 'Check in on Maria after yesterday’s extraction',
    body: BODY,
    payload: { appointmentId: 'appt_1', patientId: 'pat_1', visitLabel: 'extraction', subject: 'How are you feeling, Maria?' },
    originalBody: null,
    status: 'approved',
    decidedAt: new Date(),
    decidedByUserId: 'user_1',
    executedAt: null,
    expiresAt: null,
    isDemo: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as Parameters<typeof executePostopCheckin>[0]
}

const SAID_YES = '— you approved it'

beforeEach(() => {
  rows.visit = { id: 'appt_1', status: 'completed', patientId: 'pat_1' }
  rows.patient = { firstName: 'Maria', lastName: 'Lopez', email: 'maria@example.com', isActive: 1 }
  mail.deliver.mockClear()
  mail.shell.mockClear()
  mail.deliverThrows = null
  commlog.calls.length = 0
  commlog.throws = false
})

describe('the yes', () => {
  it('sends ONCE through the clinic sender with the Messages inbox as reply-to, signs off, mirrors to the CommLog and narrates once', async () => {
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toEqual({
      ok: true,
      ledgerSummary: 'Checked in on Maria after their extraction by email — you approved it',
      ledgerDetail: { appointmentId: 'appt_1', patientId: 'pat_1', channel: 'email', subject: 'How are you feeling, Maria?' },
    })
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    const sent = mail.deliver.mock.calls[0][0]
    expect(sent).toMatchObject({ to: 'maria@example.com', subject: 'How are you feeling, Maria?', from: SENDER.from, replyTo: SENDER.replyTo })
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.sender).toBe(SENDER)
    expect(shell.cta).toBeUndefined()
    expect(String(shell.body)).toContain('How are you feeling?')
    expect(String(shell.body)).toContain('— Acme Dental')
    expect(String(shell.footnoteHtml)).toContain('straight to our front desk')
    expect(commlog.calls).toHaveLength(1)
    expect(commlog.calls[0][0]).toBe(ORG)
    expect(commlog.calls[0][1]).toBe('pat_1')
    expect(commlog.calls[0][2]).toMatchObject({ mode: 'Email', sentOrReceived: 'Sent' })
    expect(String((commlog.calls[0][2] as { note: string }).note)).toContain('day after their extraction')
  })

  it('staff who signed the draft themselves get no second sign-off; HTML in the body is escaped', async () => {
    const p = proposal({ body: 'Feeling ok? <3\n\n— Dr. Reyes' })
    await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    const body = String(mail.shell.mock.calls[0][0].body)
    expect(body).toContain('— Dr. Reyes')
    expect(body).not.toContain('— Acme Dental')
    expect(body).toContain('&lt;3')
  })

  it('the machine’s own yes (no approver) sends — the lane is grantable', async () => {
    const p = proposal({ decidedByUserId: null })
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, '— handled on my own, as you asked')
    expect(r.ok).toBe(true)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
  })

  it('a failed CommLog mirror never fails the yes', async () => {
    commlog.throws = true
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(true)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
  })
})

describe('live staleness at the tap', () => {
  it('a vanished visit retires the card', async () => {
    rows.visit = null
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('a visit no longer marked done retires the card', async () => {
    rows.visit = { id: 'appt_1', status: 'no_show', patientId: 'pat_1' }
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true, error: expect.stringContaining('isn’t marked as done') })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('a visit that now belongs to another patient (a merge) retires the card', async () => {
    rows.visit = { id: 'appt_1', status: 'completed', patientId: 'pat_other' }
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true })
  })

  it('an inactive patient retires the card', async () => {
    rows.patient = { firstName: 'Maria', lastName: 'Lopez', email: 'maria@example.com', isActive: 0 }
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true })
  })

  it('no email NOW reopens with advice — the question is still good, the desk calls', async () => {
    rows.patient = { firstName: 'Maria', lastName: 'Lopez', email: null, isActive: 1 }
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(false)
    expect((r as { expired?: boolean }).expired).toBeUndefined()
    expect((r as { error: string }).error).toContain('give them a call')
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('a missing visit reference is a plain error', async () => {
    const p = proposal({ payload: { patientId: 'pat_1' } })
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('missing its visit reference') })
  })
})

describe('when the email does not go out', () => {
  it('passes deliver()’s own words through, mirrors nothing — the card reopens', async () => {
    mail.deliverThrows = 'The sending service refused the address.'
    const p = proposal()
    const r = await executePostopCheckin(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toEqual({ ok: false, error: 'The sending service refused the address.' })
    expect(commlog.calls).toHaveLength(0)
  })
})
