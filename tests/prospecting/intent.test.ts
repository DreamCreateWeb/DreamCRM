import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Intent detection — reply matching + classification side effects
 * (interested → call list w/ talking points; unsubscribe → permanent
 * suppression; OOO → week-long pause + auto-resume; wrong_person →
 * disqualified), per-message idempotency, and the engagement rollup
 * (click or 3+ opens promotes contacted → engaged, never past a reply).
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updateReturning: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          state.inserts.push({ table: (table as { _n: string })._n, values })
          const p: any = Promise.resolve(undefined)
          p.onConflictDoNothing = () => Promise.resolve(undefined)
          return p
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: (..._args: unknown[]) => {
            state.updates.push({ table: (table as { _n: string })._n, values })
            const p: any = Promise.resolve(undefined)
            p.returning = async () => state.updateReturning.shift() ?? []
            return p
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', email: 'email', status: 'status' },
      outreachEnrollment: { _n: 'outreach_enrollment', prospectId: 'pid', status: 'status', nextSendAt: 'next' },
      outreachEvent: { _n: 'outreach_event', prospectId: 'pid', type: 'type', meta: 'meta' },
      prospectSuppression: { _n: 'prospect_suppression', email: 'email' },
      emailMessage: { _n: 'email_message', accountId: 'aid', folder: 'folder', createdAt: 'c' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

const { aiMock, bumpMock, notifyMock, briefMock } = vi.hoisted(() => ({
  aiMock: vi.fn(),
  bumpMock: vi.fn(async () => {}),
  notifyMock: vi.fn(async () => {}),
  briefMock: vi.fn(async () => null),
}))
vi.mock('@/lib/ai', () => ({ runClaudeJson: aiMock, aiConfigured: () => true }))
vi.mock('@/lib/services/prospecting', () => ({
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
}))
// Dynamically imported by the alert + pre-warm path.
vi.mock('@/lib/services/gsc', () => ({ getPlatformOrgId: async () => 'org_platform' }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyMock }))
vi.mock('@/lib/services/demo-brief', () => ({ generateDemoBrief: briefMock }))

import {
  processInboundForOutreach,
  rollupEngagementSignals,
  promoteProspectByEmail,
} from '@/lib/services/prospect-intent'

const MSG = {
  id: 'em_1',
  fromEmail: 'Doc@LoneStarDental.com',
  subject: 'Re: Quick question',
  bodyText: 'Sure, tell me more — what does this cost?',
  snippet: 'Sure, tell me more',
}
const PROSPECT = { id: 'pros_1', name: 'Lone Star Dental', email: 'doc@lonestardental.com', status: 'contacted' }

function queueSweep(msg = MSG, prospect: Record<string, unknown> | null = PROSPECT) {
  state.selectQueue.push([msg]) // inbound messages
  state.selectQueue.push(prospect ? [prospect] : []) // prospect match
  if (prospect) state.selectQueue.push([]) // no prior reply event (idempotency check)
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.updateReturning = []
  vi.clearAllMocks()
  vi.stubEnv('OUTREACH_GMAIL_ACCOUNT_ID', 'ea_outreach')
})
afterEach(() => vi.unstubAllEnvs())

describe('processInboundForOutreach', () => {
  it('skips entirely without an outreach mailbox configured', async () => {
    vi.stubEnv('OUTREACH_GMAIL_ACCOUNT_ID', '')
    const r = await processInboundForOutreach()
    expect(r.skipped).toBe('no_outreach_account')
  })

  it('interested reply → sequence stopped, prospect on the call list with talking points', async () => {
    queueSweep()
    aiMock.mockResolvedValue({
      classification: 'question',
      summary: 'Asked about pricing.',
      talkingPoints: ['They asked about cost — lead with the $150 plan.'],
    })
    const r = await processInboundForOutreach()
    expect(r).toMatchObject({ matched: 1, classified: 1, callList: 1 })
    // (the sweep's first enrollment update is the OOO auto-resume pass)
    const stop = state.updates.find(
      (u) => u.table === 'outreach_enrollment' && u.values.status === 'stopped_reply',
    )
    expect(stop).toBeDefined()
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({
      status: 'call_list',
      intentSignal: 'reply_question',
      intentSummary: 'Asked about pricing.',
    })
    const evt = state.inserts.find((i) => i.table === 'outreach_event')
    expect(evt!.values).toMatchObject({ type: 'reply' })
    // Owner alerted (forced email) + demo brief pre-warmed.
    expect(notifyMock).toHaveBeenCalledWith(
      'org_platform',
      expect.objectContaining({ type: 'prospect_call_list', forceEmail: true }),
      { roles: ['owner', 'admin'] },
    )
    // The brief pre-warm is fire-and-forget — let its microtask settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(briefMock).toHaveBeenCalledWith('pros_1')
  })

  it('question reply stores an AI reply draft when the model returns one', async () => {
    queueSweep()
    // classify call, then draftReply call — return the draft on the 2nd.
    aiMock
      .mockResolvedValueOnce({ classification: 'question', summary: 'Asked cost.', talkingPoints: [] })
      .mockResolvedValueOnce({ draft: 'Happy to explain — plans start at $150/mo. Want a quick call?' })
    await processInboundForOutreach()
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(String(flip!.values.replyDraft)).toContain('$150')
  })

  it('not_interested fires NO owner alert', async () => {
    queueSweep()
    aiMock.mockResolvedValue({ classification: 'not_interested', summary: 'Not now.', talkingPoints: [] })
    await processInboundForOutreach()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('unsubscribe reply → permanent suppression + suppressed status', async () => {
    queueSweep()
    aiMock.mockResolvedValue({ classification: 'unsubscribe', summary: 'Told us to stop.', talkingPoints: [] })
    const r = await processInboundForOutreach()
    expect(r.suppressed).toBe(1)
    const sup = state.inserts.find((i) => i.table === 'prospect_suppression')
    expect(sup!.values).toMatchObject({ email: 'doc@lonestardental.com', reason: 'unsub' })
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ status: 'suppressed' })
  })

  it('out-of-office → paused a week (and lapsed pauses auto-resume)', async () => {
    state.updateReturning.push([{ id: 'oenr_9' }]) // one lapsed OOO resumes
    queueSweep()
    aiMock.mockResolvedValue({ classification: 'out_of_office', summary: 'On vacation.', talkingPoints: [] })
    const r = await processInboundForOutreach()
    expect(r.resumed).toBe(1)
    const pause = state.updates.filter((u) => u.table === 'outreach_enrollment').at(-1)
    expect(pause!.values.status).toBe('paused_ooo')
    expect(pause!.values.nextSendAt).toBeInstanceOf(Date)
  })

  it('wrong person → disqualified, never suppressed', async () => {
    queueSweep()
    aiMock.mockResolvedValue({ classification: 'wrong_person', summary: 'Practice was sold.', talkingPoints: [] })
    await processInboundForOutreach()
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ status: 'disqualified' })
    expect(state.inserts.find((i) => i.table === 'prospect_suppression')).toBeUndefined()
  })

  it('acts once per message (a recorded reply event skips re-processing)', async () => {
    state.selectQueue.push([MSG])
    state.selectQueue.push([PROSPECT])
    state.selectQueue.push([{ id: 'oevt_prev' }]) // already handled
    const r = await processInboundForOutreach()
    expect(r.classified).toBe(0)
    expect(aiMock).not.toHaveBeenCalled()
  })

  it('mail from strangers (no prospect / never contacted) is ignored', async () => {
    queueSweep(MSG, null)
    const r = await processInboundForOutreach()
    expect(r.matched).toBe(0)
    state.selectQueue = []
    queueSweep(MSG, { ...PROSPECT, status: 'discovered' })
    const r2 = await processInboundForOutreach()
    expect(r2.matched).toBe(0)
  })
})

describe('rollupEngagementSignals', () => {
  it('a click promotes contacted → engaged/clicked', async () => {
    state.selectQueue.push([{ id: 'pros_1' }]) // contacted candidates
    state.selectQueue.push([{ type: 'click', n: 1 }, { type: 'open', n: 1 }])
    const r = await rollupEngagementSignals()
    expect(r.promoted).toBe(1)
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ status: 'engaged', intentSignal: 'clicked' })
  })

  it('3+ opens promote; fewer do not', async () => {
    state.selectQueue.push([{ id: 'pros_1' }, { id: 'pros_2' }])
    state.selectQueue.push([{ type: 'open', n: 3 }])
    state.selectQueue.push([{ type: 'open', n: 2 }])
    const r = await rollupEngagementSignals()
    expect(r.promoted).toBe(1)
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ intentSignal: 'opens' })
  })

  it('emits ONE aggregate bell for the whole rollup (no forceEmail)', async () => {
    state.selectQueue.push([{ id: 'pros_1', name: 'Alpha' }, { id: 'pros_2', name: 'Beta' }])
    state.selectQueue.push([{ type: 'click', n: 1 }]) // pros_1 promotes
    state.selectQueue.push([{ type: 'click', n: 1 }]) // pros_2 promotes
    await rollupEngagementSignals()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const payload = (notifyMock.mock.calls[0] as unknown[])[1] as Record<string, any>
    expect(payload).toMatchObject({ type: 'prospect_engaged' })
    expect(payload.forceEmail).toBeUndefined()
    expect(payload.title).toContain('2 prospects')
  })

  it('no promotions → no aggregate bell', async () => {
    state.selectQueue.push([{ id: 'pros_1', name: 'Alpha' }])
    state.selectQueue.push([{ type: 'open', n: 1 }]) // below threshold
    await rollupEngagementSignals()
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('promoteProspectByEmail', () => {
  it('jumps a matching prospect straight to the call list', async () => {
    state.selectQueue.push([{ id: 'pros_1', status: 'contacted' }])
    expect(await promoteProspectByEmail('doc@lonestardental.com', 'demo_request')).toBe(true)
    const flip = state.updates.find((u) => u.table === 'prospect')
    expect(flip!.values).toMatchObject({ status: 'call_list', intentSignal: 'demo_request' })
  })

  it('never resurrects retired prospects', async () => {
    state.selectQueue.push([{ id: 'pros_1', status: 'suppressed' }])
    expect(await promoteProspectByEmail('doc@lonestardental.com', 'demo_request')).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})
