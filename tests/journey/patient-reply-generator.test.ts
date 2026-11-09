import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PATIENT-REPLY GENERATOR (ML-12 — the first generator under ML-11's
 * lane convention). Pins:
 *  - the selection rule: lib/waiting-threads.ts's ONE predicate with a
 *    3-hour floor; an answered, snoozed or archived thread files nothing;
 *  - dedupe per thread (one OPEN card) and per MESSAGE (the sourceKey names
 *    the patient's last message, so a declined card is a "no" about that
 *    message and a new message is a new ask) — both before any AI spend;
 *  - the per-pass cap; AI off → nothing filed;
 *  - the filed artifact: the draft as the body, the conversation quoted in
 *    the clinic's wall clock, the composer's own channel choice disclosed;
 *  - soft failures: a provider break reports to the driver once; an
 *    allowance miss ends the pass; a per-thread miss skips only that thread;
 *  - an assigned thread is still waiting — drafted like any other.
 */

const ai = vi.hoisted(() => ({ configured: true }))
vi.mock('@/lib/ai', () => ({ aiConfigured: () => ai.configured }))

const store = vi.hoisted(() => ({
  threads: [] as Array<Record<string, unknown>>,
  proposals: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === 'patient_thread') return store.threads
    if (name === 'proposal') return store.proposals
    if (name === 'clinic_profile') return store.profiles
    return []
  }
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
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
      patientThread: t('patient_thread', 'id', 'organizationId', 'patientId', 'status', 'lastMessageDirection', 'lastMessageAt', 'urgency'),
      proposal: t('proposal', 'id', 'organizationId', 'capability', 'status', 'sourceKey', 'payload'),
      clinicProfile: t('clinic_profile', 'organizationId', 'planTier'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  lte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) <= val,
  asc: () => 'asc',
  sql: () => 'sql',
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
    })
    return { filed: true, id: `prop_${store.proposals.length}` }
  }),
}))

const drafting = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/services/message-ai', () => ({
  draftPatientReply: vi.fn(async (input: Record<string, unknown>) => {
    drafting.calls.push(input)
    return drafting.results.shift() ?? { ok: true, draft: 'Hi — yes, we can see you Thursday at 2. Does that work?', remaining: 9 }
  }),
}))

const messaging = vi.hoisted(() => ({
  threads: new Map<string, Record<string, unknown>>(),
  messages: new Map<string, Array<Record<string, unknown>>>(),
}))
vi.mock('@/lib/services/patient-messaging', () => ({
  getPatientThreadById: vi.fn(async (_org: string, id: string) => messaging.threads.get(id) ?? null),
  listMessagesInThread: vi.fn(async (_org: string, id: string) => messaging.messages.get(id) ?? []),
}))

import {
  generatePatientReplyProposals,
  PATIENT_REPLY_WAITING_HOURS,
  MAX_PATIENT_REPLIES_PER_RUN,
} from '@/lib/services/proposal-generators/patient-reply'

const ORG = 'org_1'
const TZ = 'America/Chicago'
// 3 PM UTC = 10 AM Chicago — the pass that opens the desk's day.
const NOW = new Date('2026-07-27T15:00:00Z')
const HOUR = 3_600_000

let seq = 0
function seedThread(opts: {
  ageHours: number
  status?: string
  lastDirection?: 'inbound' | 'outbound'
  channel?: 'in_app' | 'email' | 'sms'
  email?: string | null
  assignedUserId?: string | null
  urgency?: 'urgent' | null
  extraInbound?: number
}): string {
  const id = `thr_${++seq}`
  const lastAt = new Date(NOW.getTime() - opts.ageHours * HOUR)
  const channel = opts.channel ?? 'in_app'
  store.threads.push({
    id,
    organizationId: ORG,
    patientId: `pat_${seq}`,
    status: opts.status ?? 'open',
    lastMessageDirection: opts.lastDirection ?? 'inbound',
    lastMessageAt: lastAt,
    urgency: opts.urgency ?? null,
  })
  messaging.threads.set(id, {
    id,
    patientId: `pat_${seq}`,
    patientFirstName: 'Mia',
    patientLastName: 'Chen',
    patientEmail: opts.email === undefined ? 'mia@example.com' : opts.email,
    status: opts.status ?? 'open',
    assignedUserId: opts.assignedUserId ?? null,
    lastMessageAt: lastAt,
    lastMessageDirection: opts.lastDirection ?? 'inbound',
  })
  const msgs: Array<Record<string, unknown>> = [
    { id: `m_${id}_out`, direction: 'outbound', channel, body: 'Your cleaning is booked for the 30th.', sentAt: new Date(lastAt.getTime() - 2 * HOUR), sentByUserName: 'Dana' },
  ]
  for (let i = 0; i < (opts.extraInbound ?? 0); i++) {
    msgs.push({ id: `m_${id}_in${i}`, direction: 'inbound', channel, body: `Earlier question ${i}`, sentAt: new Date(lastAt.getTime() - HOUR) })
  }
  msgs.push({ id: `m_${id}_last`, direction: opts.lastDirection ?? 'inbound', channel, body: 'Can I move it to Thursday afternoon?', sentAt: lastAt })
  messaging.messages.set(id, msgs)
  return id
}

beforeEach(() => {
  ai.configured = true
  store.threads.length = 0
  store.proposals.length = 0
  store.profiles.length = 0
  store.profiles.push({ organizationId: ORG, planTier: 'premium' })
  filed.inputs.length = 0
  drafting.results.length = 0
  drafting.calls.length = 0
  messaging.threads.clear()
  messaging.messages.clear()
  seq = 0
})

describe('selection — the waiting predicate with a 3-hour floor', () => {
  it('files a drafted reply for a thread whose patient has waited 3+ hours', async () => {
    const id = seedThread({ ageHours: 9 })
    const n = await generatePatientReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(1)
    const input = filed.inputs[0]
    expect(input.capability).toBe('patient_reply')
    expect(input.sourceKey).toBe(`patient_reply:${id}:m_${id}_last`)
    expect(input.patientId).toBe('pat_1')
    expect(String(input.title)).toContain('Mia')
    expect(input.body).toBe('Hi — yes, we can see you Thursday at 2. Does that work?')
    expect(drafting.calls[0]).toMatchObject({ organizationId: ORG, threadId: id, planTier: 'premium' })
  })

  it('a thread under the floor is left alone — no card, no AI spend', async () => {
    seedThread({ ageHours: PATIENT_REPLY_WAITING_HOURS - 0.5 })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
    expect(filed.inputs).toHaveLength(0)
  })

  it('exactly at the floor counts as waiting', async () => {
    seedThread({ ageHours: PATIENT_REPLY_WAITING_HOURS })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(1)
  })

  it('a thread the clinic answered last, or one snoozed/archived, is not waiting', async () => {
    seedThread({ ageHours: 20, lastDirection: 'outbound' })
    seedThread({ ageHours: 20, status: 'snoozed' })
    seedThread({ ageHours: 20, status: 'archived' })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })

  it('an ASSIGNED thread is still waiting — drafted like any other', async () => {
    seedThread({ ageHours: 12, assignedUserId: 'user_9' })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(1)
  })

  it('AI off → nothing filed, nothing drafted', async () => {
    ai.configured = false
    seedThread({ ageHours: 12 })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })
})

describe('dedupe — before any AI spend', () => {
  it('one OPEN card per thread: a thread with a card already waiting is skipped', async () => {
    const id = seedThread({ ageHours: 12 })
    store.proposals.push({ id: 'prop_open', organizationId: ORG, capability: 'patient_reply', status: 'open', sourceKey: `patient_reply:${id}:older`, payload: { threadId: id } })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })

  it('the sourceKey names the MESSAGE: a declined card for the same message never re-asks, a newer message is a new ask', async () => {
    const id = seedThread({ ageHours: 12 })
    store.proposals.push({ id: 'prop_no', organizationId: ORG, capability: 'patient_reply', status: 'declined', sourceKey: `patient_reply:${id}:m_${id}_last`, payload: { threadId: id } })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
    // The patient writes again (a new last message id) → a fresh ask.
    messaging.messages.get(id)!.push({ id: `m_${id}_newer`, direction: 'inbound', channel: 'in_app', body: 'Any update?', sentAt: new Date(NOW.getTime() - 4 * HOUR) })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(1)
    expect(filed.inputs[0].sourceKey).toBe(`patient_reply:${id}:m_${id}_newer`)
  })

  it('a second pass over the same waiting thread files nothing more', async () => {
    seedThread({ ageHours: 12 })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(1)
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(1)
  })
})

describe('the per-pass cap', () => {
  it(`files at most ${MAX_PATIENT_REPLIES_PER_RUN} per org per pass`, async () => {
    for (let i = 0; i < MAX_PATIENT_REPLIES_PER_RUN + 2; i++) seedThread({ ageHours: 6 + i })
    expect(await generatePatientReplyProposals(ORG, NOW, TZ)).toBe(MAX_PATIENT_REPLIES_PER_RUN)
    expect(drafting.calls).toHaveLength(MAX_PATIENT_REPLIES_PER_RUN)
  })
})

describe('the filed artifact', () => {
  it('quotes the conversation in the clinic’s wall clock, nests the draft, and discloses the composer’s channel choice', async () => {
    const id = seedThread({ ageHours: 12, channel: 'email', email: 'mia@example.com' })
    await generatePatientReplyProposals(ORG, NOW, TZ)
    const payload = filed.inputs[0].payload as Record<string, unknown>
    expect(payload.threadId).toBe(id)
    expect(payload.messageId).toBe(`m_${id}_last`)
    expect(payload.channel).toBe('email')
    expect(payload.context).toEqual({ kind: 'thread', author: 'Mia Chen' })
    const thread = payload.thread as { messages: Array<Record<string, unknown>>; toLine: string }
    expect(thread.toLine).toBe('Mia Chen · mia@example.com')
    const last = thread.messages[thread.messages.length - 1]
    expect(last).toMatchObject({ from: 'patient', author: 'Mia Chen', text: 'Can I move it to Thursday afternoon?' })
    // 3 AM UTC = 10 PM Chicago the evening before — the tz law, not UTC.
    expect(last.whenLabel).toMatch(/10:00 PM/)
    expect(thread.messages[0]).toMatchObject({ from: 'clinic', author: 'Dana' })
    expect(String(filed.inputs[0].title)).toMatch(/10:00 PM/)
    // A patient's question goes stale in a week.
    const expiresAt = filed.inputs[0].expiresAt as Date
    expect(expiresAt.getTime() - NOW.getTime()).toBe(7 * 24 * HOUR)
  })

  it('a texted-in patient with no email is answered in the portal (SMS is not sendable yet)', async () => {
    seedThread({ ageHours: 12, channel: 'sms', email: null })
    await generatePatientReplyProposals(ORG, NOW, TZ)
    const payload = filed.inputs[0].payload as Record<string, unknown>
    expect(payload.channel).toBe('in_app')
    expect((payload.thread as { toLine: string }).toLine).toBe('Mia Chen · in the patient portal')
  })
})

describe('soft failures', () => {
  it('a PROVIDER break reports to the driver once and the pass moves on; a per-thread miss skips silently', async () => {
    seedThread({ ageHours: 12 })
    seedThread({ ageHours: 11 })
    seedThread({ ageHours: 10 })
    drafting.results.push({ ok: false, reason: 'failed' }, { ok: false, reason: 'no_messages' })
    const soft = vi.fn()
    expect(await generatePatientReplyProposals(ORG, NOW, TZ, soft)).toBe(1)
    expect(soft).toHaveBeenCalledTimes(1)
    expect(drafting.calls).toHaveLength(3)
  })

  it('an exhausted draft allowance ends the pass — no further drafts attempted', async () => {
    seedThread({ ageHours: 12 })
    seedThread({ ageHours: 11 })
    drafting.results.push({ ok: false, reason: 'no_allowance' })
    const soft = vi.fn()
    expect(await generatePatientReplyProposals(ORG, NOW, TZ, soft)).toBe(0)
    expect(drafting.calls).toHaveLength(1)
    expect(soft).not.toHaveBeenCalled()
  })
})
