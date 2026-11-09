import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE FEEDBACK-REPLY EXECUTOR (ML-21). Pins the executor's own contract —
 * the approve wrapper's narrate-once / reopen / atomic-claim laws are
 * pinned through approveProposal in tests/journey/proposals-service.test.ts:
 *  - the yes sends ONCE through sendNotificationEmail WITH the clinic's
 *    sender (the branded patient shell), to the patient's LIVE email, with
 *    the subject the card disclosed and the card's body;
 *  - then mirrors a CommLog note (best-effort — a failed mirror never
 *    reopens a delivered email);
 *  - live staleness at the tap: the note / survey / patient gone → retire;
 *  - no email NOW → reopen with advice, nothing sent;
 *  - a failed send reopens with deliver()'s own words, no mirror;
 *  - no approver (the lane is not grantable) → refuse before any read.
 */

const store = vi.hoisted(() => ({
  reviewRequests: [] as Array<Record<string, unknown>>,
  npsResponses: [] as Array<Record<string, unknown>>,
  patients: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const t = (name: string, ...names: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(names.map((c) => [c, col(c)])))
  const rowsOf = (name: string) => {
    if (name === 'review_request') return store.reviewRequests
    if (name === 'nps_response') return store.npsResponses
    if (name === 'patient') return store.patients
    return []
  }
  function select(cols: Record<string, { __col: string }>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (tbl: { __name: string }) => {
      table = tbl.__name
      return api
    }
    api.where = (preds: unknown) => {
      for (const p of Array.isArray(preds) ? preds : [preds]) if (typeof p === 'function') filters.push(p as never)
      return api
    }
    api.limit = async (n: number) =>
      rowsOf(table)
        .filter((r) => filters.every((f) => f(r)))
        .slice(0, n)
        .map((r) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, r[c.__col]])))
    return api
  }
  return {
    db: { select },
    schema: {
      reviewRequest: t('review_request', 'id', 'organizationId', 'patientId', 'privateFeedback'),
      npsResponse: t('nps_response', 'id', 'organizationId', 'patientId', 'score'),
      patient: t('patient', 'id', 'organizationId', 'firstName', 'lastName', 'email', 'isActive'),
      proposal: t('proposal', 'id'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
}))

const SENDER = {
  from: 'Dream Dental <hello@dreamcreatestudio.com>',
  replyTo: 'in+org_1@in.dreamcreatestudio.com',
  name: 'Dream Dental',
  timeZone: 'America/Chicago',
  brandColor: '#2a7f8c',
  logoUrl: null,
  gmail: null,
}
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => SENDER),
}))

const mail = vi.hoisted(() => ({
  sends: [] as Array<{ input: Record<string, unknown>; sender: unknown }>,
  throws: null as string | null,
}))
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(async (input: Record<string, unknown>, sender: unknown) => {
    if (mail.throws) throw new Error(mail.throws)
    mail.sends.push({ input, sender })
  }),
}))

const commlog = vi.hoisted(() => ({
  calls: [] as Array<unknown[]>,
  throws: false,
}))
vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(async (...args: unknown[]) => {
    if (commlog.throws) throw new Error('pms down')
    commlog.calls.push(args)
  }),
}))

import { executeFeedbackReply } from '@/lib/services/proposal-executors/feedback-reply'

const ORG = 'org_1'
const BODY = 'We’re sorry Tuesday wasn’t what it should have been. Someone from the office will call.'

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    organizationId: ORG,
    capability: 'feedback_reply',
    patientId: 'pat_1',
    sourceKey: 'feedback_reply:review:rr_1',
    title: 'Write back to Mia',
    body: BODY,
    payload: { source: 'review', feedbackId: 'rr_1', patientId: 'pat_1', subject: 'About your recent visit' },
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
  } as unknown as Parameters<typeof executeFeedbackReply>[0]
}

const SAID_YES = '— you approved it'

function run(p = proposal()) {
  return executeFeedbackReply(p, p.payload as Record<string, unknown>, SAID_YES)
}

beforeEach(() => {
  store.reviewRequests = [{ id: 'rr_1', organizationId: ORG, patientId: 'pat_1', privateFeedback: 'The wait was long.' }]
  store.npsResponses = [{ id: 'nps_1', organizationId: ORG, patientId: 'pat_1', score: 4 }]
  store.patients = [{ id: 'pat_1', organizationId: ORG, firstName: 'Mia', lastName: 'Chen', email: 'mia@example.com', isActive: 1 }]
  mail.sends = []
  mail.throws = null
  commlog.calls = []
  commlog.throws = false
})

describe('the yes', () => {
  it('sends ONCE through sendNotificationEmail with the clinic sender, the disclosed subject and the body, mirrors the CommLog, narrates under feedback_reply', async () => {
    const r = await run()
    expect(r).toMatchObject({ ok: true })
    expect(mail.sends).toHaveLength(1)
    expect(mail.sends[0].sender).toBe(SENDER)
    expect(mail.sends[0].input).toEqual({
      to: 'mia@example.com',
      name: 'Mia Chen',
      title: 'About your recent visit',
      body: BODY,
    })
    expect(commlog.calls).toHaveLength(1)
    expect(commlog.calls[0]).toEqual([
      ORG,
      'pat_1',
      expect.objectContaining({ mode: 'Email', sentOrReceived: 'Sent', note: expect.stringContaining('private note') }),
    ])
    if (r.ok) {
      expect(r.ledgerSummary).toBe('Wrote back to Mia about their private note by email — you approved it')
      expect(r.ledgerDetail).toMatchObject({ source: 'review', feedbackId: 'rr_1', patientId: 'pat_1', channel: 'email' })
    }
  })

  it('a survey answer reads as the survey it was', async () => {
    const r = await run(proposal({ payload: { source: 'nps', feedbackId: 'nps_1', patientId: 'pat_1', subject: 'About your recent visit' } }))
    expect(r).toMatchObject({ ok: true, ledgerSummary: expect.stringContaining('4/10 survey') })
    expect(mail.sends).toHaveLength(1)
  })

  it('an older card without a subject sends the default one', async () => {
    const r = await run(proposal({ payload: { source: 'review', feedbackId: 'rr_1' } }))
    expect(r).toMatchObject({ ok: true })
    expect(mail.sends[0].input.title).toBe('About your recent visit')
  })

  it('a failed CommLog mirror never turns a delivered email into a reopen', async () => {
    commlog.throws = true
    const r = await run()
    expect(r).toMatchObject({ ok: true })
    expect(mail.sends).toHaveLength(1)
  })
})

describe('live staleness at the tap', () => {
  it('the note is gone → retire, nothing sent', async () => {
    store.reviewRequests = []
    const r = await run()
    expect(r).toMatchObject({ ok: false, expired: true })
    expect(mail.sends).toHaveLength(0)
  })

  it('the note was withdrawn (no words on file) → retire', async () => {
    store.reviewRequests[0].privateFeedback = null
    expect(await run()).toMatchObject({ ok: false, expired: true })
  })

  it('the survey is gone → retire', async () => {
    store.npsResponses = []
    const r = await run(proposal({ payload: { source: 'nps', feedbackId: 'nps_1' } }))
    expect(r).toMatchObject({ ok: false, expired: true })
  })

  it('a note in ANOTHER org is invisible — tenant-scoped at the tap', async () => {
    store.reviewRequests[0].organizationId = 'org_2'
    expect(await run()).toMatchObject({ ok: false, expired: true })
    expect(mail.sends).toHaveLength(0)
  })

  it('the patient is gone or inactive → retire', async () => {
    store.patients[0].isActive = 0
    expect(await run()).toMatchObject({ ok: false, expired: true })
    store.patients = []
    expect(await run()).toMatchObject({ ok: false, expired: true })
    expect(mail.sends).toHaveLength(0)
  })

  it('no email NOW → reopen with advice (not a retire), nothing sent', async () => {
    store.patients[0].email = null
    const r = await run()
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('give them a call') })
    expect(r).not.toHaveProperty('expired')
    expect(mail.sends).toHaveLength(0)
  })
})

describe('refusals and failures', () => {
  it('no approver (the lane is not grantable) → refuse before any read or send', async () => {
    const r = await run(proposal({ decidedByUserId: null }))
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('approves it') })
    expect(mail.sends).toHaveLength(0)
  })

  it('a card missing its feedback reference refuses', async () => {
    expect(await run(proposal({ payload: { source: 'review' } }))).toMatchObject({ ok: false })
    expect(await run(proposal({ payload: { source: 'tweet', feedbackId: 'x' } }))).toMatchObject({ ok: false })
  })

  it('a failed send reopens with deliver()’s own words — no mirror, no narration', async () => {
    mail.throws = 'The clinic’s sender address is not verified yet.'
    const r = await run()
    expect(r).toEqual({ ok: false, error: 'The clinic’s sender address is not verified yet.' })
    expect(commlog.calls).toHaveLength(0)
  })
})
