import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE INQUIRY FOLLOW-UP GENERATOR (ML-22 — the second touch, under ML-11's
 * lane convention). Pins:
 *  - the selection rule: status 'contacted' with an email, contacted at
 *    least 3 clinic-local DAYS ago (a day boundary on the practice's
 *    calendar, not 72 UTC hours), within the 14-day window, never followed
 *    up, not parked by the desk for today or later; phone-only, new,
 *    converted and archived inquiries file nothing;
 *  - dedupe before any AI spend: one second touch per inquiry, ever
 *    (sourceKey = inquiry_followup:<leadId>; a declined card is the answer);
 *  - the per-pass cap; AI off → nothing filed; tenant scoping;
 *  - the filed artifact: the draft as the body, the inquiry quoted as
 *    context, a 7-day expiry, the subject the executor sends;
 *  - the prompt is honest: it carries what we actually replied the first
 *    time and offers the booking button only when a site resolves;
 *  - soft failures: a provider break reports to the driver once; an
 *    allowance miss ends the pass; an unusable draft skips only itself.
 */

const ai = vi.hoisted(() => ({ configured: true }))
vi.mock('@/lib/ai', () => ({ aiConfigured: () => ai.configured }))
vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: 'Voice rules.' }))

const store = vi.hoisted(() => ({
  leads: [] as Array<Record<string, unknown>>,
  proposals: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === 'lead') return store.leads
    if (name === 'proposal') return store.proposals
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
      lead: t('lead', 'id', 'organizationId', 'name', 'email', 'message', 'preferredDate', 'status', 'contactedAt', 'callBackAt', 'followedUpAt'),
      proposal: t('proposal', 'id', 'organizationId', 'capability', 'status', 'sourceKey', 'payload'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  isNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] == null,
  asc: () => 'asc',
}))

const filed = vi.hoisted(() => ({ inputs: [] as Array<Record<string, unknown>> }))
const sent = vi.hoisted(() => ({ firstReply: null as Record<string, unknown> | null }))
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
  getSentInquiryReply: vi.fn(async () => sent.firstReply),
}))

const drafting = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ organizationId: string; system: string; user: string }>,
}))
vi.mock('@/lib/services/proposal-generators', () => ({
  draftText: vi.fn(async (organizationId: string, opts: { system: string; user: string }) => {
    drafting.calls.push({ organizationId, ...opts })
    return drafting.results.shift() ?? { ok: true, text: 'Hi Marcus — still happy to get that crown looked at whenever suits you.' }
  }),
}))

const site = vi.hoisted(() => ({ bookingUrl: 'https://acme.dreamcreatestudio.com/book' as string | null }))
vi.mock('@/lib/services/marketing-send', () => ({
  resolveClinicBookingUrl: vi.fn(async () => site.bookingUrl),
}))

import {
  generateInquiryFollowupProposals,
  INQUIRY_FOLLOWUP_AFTER_DAYS,
  INQUIRY_FOLLOWUP_WINDOW_DAYS,
  MAX_INQUIRY_FOLLOWUPS_PER_RUN,
} from '@/lib/services/proposal-generators/inquiry-followup'

const ORG = 'org_1'
const CLINIC = 'Acme Dental'
const TZ = 'America/Chicago'
// Thursday 2026-07-30, 10 AM Chicago (15:00Z) — the pass that opens the desk's day.
const THU = new Date('2026-07-30T15:00:00Z')
const WED = new Date('2026-07-29T15:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

let seq = 0
function seedLead(opts: {
  contactedAt?: Date | null
  status?: string
  email?: string | null
  callBackAt?: Date | null
  followedUpAt?: Date | null
  org?: string
  message?: string | null
}): string {
  const id = `lead_${++seq}`
  store.leads.push({
    id,
    organizationId: opts.org ?? ORG,
    name: `Marcus Johnson ${seq}`,
    email: opts.email === undefined ? `marcus${seq}@example.com` : opts.email,
    message: opts.message === undefined ? 'Need crown work, had a temporary fall out.' : opts.message,
    preferredDate: null,
    status: opts.status ?? 'contacted',
    contactedAt: opts.contactedAt === undefined ? new Date(THU.getTime() - 4 * DAY) : opts.contactedAt,
    callBackAt: opts.callBackAt ?? null,
    followedUpAt: opts.followedUpAt ?? null,
  })
  return id
}

beforeEach(() => {
  ai.configured = true
  store.leads.length = 0
  store.proposals.length = 0
  filed.inputs.length = 0
  drafting.results.length = 0
  drafting.calls.length = 0
  sent.firstReply = null
  site.bookingUrl = 'https://acme.dreamcreatestudio.com/book'
  seq = 0
})

describe('selection — contacted, quiet for 3 clinic-local days', () => {
  it('files ONE drafted second touch for a contacted inquiry that went quiet', async () => {
    const id = seedLead({})
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(1)
    const input = filed.inputs[0]
    expect(input.capability).toBe('inquiry_followup')
    expect(input.sourceKey).toBe(`inquiry_followup:${id}`)
    expect(String(input.title)).toContain('Marcus')
    expect(input.body).toBe('Hi Marcus — still happy to get that crown looked at whenever suits you.')
    const payload = input.payload as Record<string, unknown>
    expect(payload.leadId).toBe(id)
    expect(payload.subject).toBe(`Checking in from ${CLINIC}`)
    expect(payload.context).toEqual({
      kind: 'inquiry',
      author: `Marcus Johnson 1`,
      text: 'Need crown work, had a temporary fall out.',
      preferredDate: null,
    })
    const expiresAt = input.expiresAt as Date
    expect(expiresAt.getTime() - THU.getTime()).toBe(7 * DAY)
  })

  it('the floor is a DAY on the clinic’s calendar: contacted Monday → Thursday’s pass files, Wednesday’s does not', async () => {
    // Monday 3 PM Chicago.
    seedLead({ contactedAt: new Date('2026-07-27T20:00:00Z') })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, WED, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(1)
  })

  it('a late-Monday contact (11:30 PM Chicago, already Tuesday in UTC) is still Monday’s — Thursday files it', async () => {
    seedLead({ contactedAt: new Date('2026-07-28T04:30:00Z') })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(1)
    expect(INQUIRY_FOLLOWUP_AFTER_DAYS).toBe(3)
  })

  it('an inquiry that sat past the window is the desk’s to archive, not a "just checking in"', async () => {
    seedLead({ contactedAt: new Date(THU.getTime() - (INQUIRY_FOLLOWUP_WINDOW_DAYS + 1) * DAY) })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })

  it('phone-only, new, converted, archived and already-followed-up inquiries file nothing', async () => {
    seedLead({ email: null })
    seedLead({ email: '  ' })
    seedLead({ status: 'new' })
    seedLead({ status: 'converted' })
    seedLead({ status: 'archived' })
    seedLead({ followedUpAt: new Date(THU.getTime() - DAY) })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })

  it('a call-back parked for today or later means the desk has a plan — skipped; a call-back that slipped is drafted', async () => {
    // Noon today / tomorrow, Chicago.
    seedLead({ callBackAt: new Date('2026-07-30T17:00:00Z') })
    seedLead({ callBackAt: new Date('2026-07-31T17:00:00Z') })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    // Yesterday's call-back day came and went.
    const slipped = seedLead({ callBackAt: new Date('2026-07-29T17:00:00Z') })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(1)
    expect((filed.inputs[0].payload as Record<string, unknown>).leadId).toBe(slipped)
  })

  it('another org’s inquiries are never read (tenant scoping)', async () => {
    seedLead({ org: 'org_2' })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
  })

  it('AI off → nothing filed, nothing drafted', async () => {
    ai.configured = false
    seedLead({})
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })
})

describe('dedupe — one second touch per inquiry, before any AI spend', () => {
  it('a declined (or any) card for the inquiry never re-asks', async () => {
    const id = seedLead({})
    store.proposals.push({ id: 'prop_no', organizationId: ORG, capability: 'inquiry_followup', status: 'declined', sourceKey: `inquiry_followup:${id}`, payload: { leadId: id } })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(0)
  })

  it('a second pass over the same quiet inquiry files nothing more', async () => {
    seedLead({})
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(1)
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(0)
    expect(drafting.calls).toHaveLength(1)
  })
})

describe('the per-pass cap', () => {
  it(`files at most ${MAX_INQUIRY_FOLLOWUPS_PER_RUN} per org per pass`, async () => {
    for (let i = 0; i < MAX_INQUIRY_FOLLOWUPS_PER_RUN + 2; i++) seedLead({ contactedAt: new Date(THU.getTime() - (4 + i) * DAY) })
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)).toBe(MAX_INQUIRY_FOLLOWUPS_PER_RUN)
    expect(drafting.calls).toHaveLength(MAX_INQUIRY_FOLLOWUPS_PER_RUN)
  })
})

describe('the prompt is honest about what the practice offers', () => {
  it('carries what we actually replied the first time, and names the day we reached out in the clinic’s calendar', async () => {
    sent.firstReply = { subject: 'Your question for Acme Dental', body: 'Yes — we do crowns, and we can usually fit a temp repair in the same week.', sentAt: new Date(), simulated: false }
    seedLead({ contactedAt: new Date('2026-07-27T20:00:00Z') })
    await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)
    const call = drafting.calls[0]
    expect(call.organizationId).toBe(ORG)
    expect(call.user).toContain('we can usually fit a temp repair in the same week')
    expect(call.system).toContain('Jul 27, 2026')
    expect(call.system).toContain('Only repeat what our first reply actually offered')
    expect(call.system).toContain('"Book a time" button')
    expect(String(filed.inputs[0].title)).toContain('Jul 27, 2026')
  })

  it('with no first reply on record it says so; with no site to book on it offers a reply or a call, never a link', async () => {
    site.bookingUrl = null
    seedLead({})
    await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ)
    const call = drafting.calls[0]
    expect(call.user).toContain('no written reply on record')
    expect(call.system).toContain('reply to this email or call the office')
    expect(call.system).not.toContain('"Book a time" button')
  })
})

describe('soft failures', () => {
  it('a PROVIDER break reports to the driver once and the pass moves on; an unusable draft skips silently', async () => {
    seedLead({ contactedAt: new Date(THU.getTime() - 4 * DAY) })
    seedLead({ contactedAt: new Date(THU.getTime() - 5 * DAY) })
    seedLead({ contactedAt: new Date(THU.getTime() - 6 * DAY) })
    drafting.results.push({ ok: false, reason: 'failed' }, { ok: false, reason: 'unusable' })
    const soft = vi.fn()
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ, soft)).toBe(1)
    expect(soft).toHaveBeenCalledTimes(1)
    expect(drafting.calls).toHaveLength(3)
  })

  it('an exhausted draft allowance ends the pass — no further drafts attempted', async () => {
    seedLead({})
    seedLead({ contactedAt: new Date(THU.getTime() - 5 * DAY) })
    drafting.results.push({ ok: false, reason: 'no_allowance' })
    const soft = vi.fn()
    expect(await generateInquiryFollowupProposals(ORG, CLINIC, THU, TZ, soft)).toBe(0)
    expect(drafting.calls).toHaveLength(1)
    expect(soft).not.toHaveBeenCalled()
  })
})
