import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE REFERRAL ASK (ML-39, G3-19): generator + executor. Pins: "happy" is a
 * promoter (NPS 9-10 or a 5-star review outcome, never a guess) inside 14
 * clinic-local days; opted-out / no-email / archived are skipped; ONE ask per
 * patient EVER (sourceKey); <=3 cards per pass, freshest first; the card
 * carries the patient's real share link; the yes sends ONCE through the
 * clinic shell and narrates once; staleness at the tap retires.
 */

const db = vi.hoisted(() => ({ queues: {} as Record<string, unknown[][]> }))
vi.mock('@/lib/db', () => {
  const schema = new Proxy({}, {
    get: (_t, table: string) => new Proxy({ __name: table }, { get: (o, c: string) => (c in o ? (o as Record<string, unknown>)[c] : { __col: c }) }),
  })
  const select = () => {
    let rows: unknown[] = []
    const api: Record<string, unknown> = {}
    for (const m of ['where', 'orderBy', 'limit']) api[m] = () => api
    api.from = (t: { __name: string }) => {
      rows = (db.queues[t.__name] ?? []).shift() ?? []
      return api
    }
    api.then = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res)
    return api
  }
  return { db: { select }, schema }
})
vi.mock('drizzle-orm', () => ({
  and: () => true, eq: () => true, gte: () => true, desc: () => true, inArray: () => true, isNotNull: () => true,
}))

const filed = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async (a: Record<string, unknown>) => {
    filed.calls.push(a)
    return { filed: true }
  }),
}))
const link = vi.hoisted(() => ({ throws: false }))
vi.mock('@/lib/services/patient-referrals', () => ({
  getOrCreateReferralLink: vi.fn(async (_o: string, p: string) => {
    if (link.throws) throw new Error('nope')
    return { token: `ref_${p}`, shareUrl: `https://acme.example/book?ref=ref_${p}` }
  }),
}))
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

import { generateReferralAskProposals } from '@/lib/services/proposal-generators/referral-ask'
import { executeReferralAsk } from '@/lib/services/proposal-executors/referral-ask'

const ORG = 'org_1'
const TZ = 'America/Chicago'
const NOW = new Date('2026-11-09T15:00:00Z')
const DAY = 86_400_000
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)

const nps = (patientId: string, score: number | null, d = 2) => ({ patientId, score, at: ago(d) })
const review = (patientId: string, rating: number | null, d = 2) => ({ patientId, rating, at: ago(d) })
const patient = (id: string, over: Record<string, unknown> = {}) => ({
  id, firstName: id.toUpperCase(), email: `${id}@example.com`, isActive: 1, marketingEmailOptIn: 1, mergedIntoPatientId: null, ...over,
})
function seed(o: { nps?: unknown[]; reviews?: unknown[]; patients?: unknown[]; asked?: string[] }) {
  db.queues = {
    npsResponse: [o.nps ?? []],
    reviewRequest: [o.reviews ?? []],
    patient: [o.patients ?? []],
    proposal: [(o.asked ?? []).map((p) => ({ sourceKey: `referral_ask:${p}` }))],
  }
}

beforeEach(() => {
  filed.calls = []
  link.throws = false
  mail.deliver.mockClear()
  mail.shell.mockClear()
  mail.throws = null
  db.queues = {}
})

describe('who is happy — a promoter, never a guess', () => {
  it('an NPS 9 or 10 files ONE card carrying the real share link', async () => {
    seed({ nps: [nps('p1', 10)], patients: [patient('p1')] })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(1)
    expect(filed.calls[0]).toMatchObject({
      organizationId: ORG, capability: 'referral_ask', sourceKey: 'referral_ask:p1', patientId: 'p1',
      payload: { shareUrl: 'https://acme.example/book?ref=ref_p1' },
    })
    expect(String(filed.calls[0].body)).toContain('https://acme.example/book?ref=ref_p1')
    expect(String(filed.calls[0].title)).toBe('Ask P1 to refer a friend — they just said they were happy')
  })
  it('a 5-star review-request outcome counts too', async () => {
    seed({ reviews: [review('p1', 5)], patients: [patient('p1')] })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(1)
  })
  it('a 7-8 NPS, a 4-star, an unanswered survey, or an answer older than 14 days never asks', async () => {
    seed({
      nps: [nps('p1', 8), nps('p2', null), nps('p3', 10, 20)],
      reviews: [review('p4', 4), review('p5', 5, 30)],
      patients: ['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => patient(p)),
    })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('the same person happy twice is still one card (one person, one ask)', async () => {
    seed({ nps: [nps('p1', 9)], reviews: [review('p1', 5)], patients: [patient('p1')] })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(1)
  })
})

describe('floors', () => {
  it('opted-out, no-email, archived and merged patients are skipped', async () => {
    seed({
      nps: ['p1', 'p2', 'p3', 'p4'].map((p) => nps(p, 10)),
      patients: [
        patient('p1', { marketingEmailOptIn: 0 }), patient('p2', { email: '' }),
        patient('p3', { isActive: 0 }), patient('p4', { mergedIntoPatientId: 'p9' }),
      ],
    })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('one ask per patient EVER — a card (open, done or declined) for the sourceKey stands the patient down', async () => {
    seed({ nps: [nps('p1', 10)], patients: [patient('p1')], asked: ['p1'] })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('at most 3 cards per org per pass, the freshest answers first', async () => {
    seed({
      nps: [nps('p1', 10, 9), nps('p2', 10, 1), nps('p3', 10, 5), nps('p4', 10, 3), nps('p5', 10, 7)],
      patients: ['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => patient(p)),
    })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(3)
    expect(filed.calls.map((c) => c.patientId)).toEqual(['p2', 'p4', 'p3'])
  })
  it('no share link, no card', async () => {
    link.throws = true
    seed({ nps: [nps('p1', 10)], patients: [patient('p1')] })
    expect(await generateReferralAskProposals(ORG, NOW, TZ)).toBe(0)
  })
})

describe('the yes', () => {
  const BODY = 'Hi Maya,\n\nPass us along:\n\nhttps://acme.example/book?ref=ref_pt1\n\nThank you.'
  const proposal = (over: Record<string, unknown> = {}) =>
    ({ id: 'p1', organizationId: ORG, capability: 'referral_ask', patientId: 'pt1', body: BODY, payload: {}, decidedByUserId: 'u1', ...over }) as unknown as Parameters<typeof executeReferralAsk>[0]
  const PAYLOAD = { patientId: 'pt1', subject: 'Know someone who’d like us?', shareUrl: 'https://acme.example/book?ref=ref_pt1' }
  const YES = '— you approved it'
  const seedPatient = (over: Record<string, unknown> | null = {}) => {
    db.queues = { patient: [over === null ? [] : [{ id: 'pt1', firstName: 'Maya', email: 'maya@example.com', isActive: 1, marketingEmailOptIn: 1, mergedIntoPatientId: null, ...over }]] }
  }

  it('sends ONCE through the clinic shell with the disclosed link, narrates once', async () => {
    seedPatient()
    const r = await executeReferralAsk(proposal(), PAYLOAD, YES)
    expect(r).toMatchObject({ ok: true, ledgerSummary: 'Asked Maya to refer a friend — you approved it' })
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    expect(mail.deliver.mock.calls[0][0]).toMatchObject({ to: 'maya@example.com', from: SENDER.from, replyTo: SENDER.replyTo })
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.cta).toEqual({ url: PAYLOAD.shareUrl, label: 'Share your link' })
    expect(String(shell.body)).toContain('— Acme Dental')
  })
  it('a link the card’s words do not show is never a button; HTML is escaped', async () => {
    seedPatient()
    await executeReferralAsk(proposal({ body: 'Hi <b>Maya</b>\n\n— Dr. Reyes' }), PAYLOAD, YES)
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.cta).toBeUndefined()
    expect(String(shell.body)).toContain('&lt;b&gt;')
    expect(String(shell.body)).not.toContain('— Acme Dental')
  })
  it('the machine’s own yes sends like any other', async () => {
    seedPatient()
    expect((await executeReferralAsk(proposal({ decidedByUserId: null }), PAYLOAD, 'on its own')).ok).toBe(true)
  })
  it('a transport failure reopens in deliver()’s words', async () => {
    seedPatient()
    mail.throws = 'Email is paused for this practice.'
    expect(await executeReferralAsk(proposal(), PAYLOAD, YES)).toEqual({ ok: false, error: 'Email is paused for this practice.' })
  })
  it('archived, merged, opted-out or email-less patients retire the card and nothing sends', async () => {
    for (const over of [null, { isActive: 0 }, { mergedIntoPatientId: 'x' }, { marketingEmailOptIn: 0 }, { email: '' }]) {
      seedPatient(over)
      expect(await executeReferralAsk(proposal(), PAYLOAD, YES)).toMatchObject({ ok: false, expired: true })
    }
    expect(mail.deliver).not.toHaveBeenCalled()
  })
})
