import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE FEEDBACK-REPLY GENERATOR (ML-21 — the second generator under ML-11's
 * lane convention). Pins:
 *  - the selection rule: a 1–2★ (or unrated) private note, or a detractor
 *    survey (≤ 6/10, comment or none), from the last 7 days, for an active
 *    patient with an email; a 3★+ note, a 7+ survey, a no-email or
 *    inactive patient, an older row file nothing;
 *  - dedupe before any AI spend: the sourceKey names the NOTE (one ask per
 *    note, for good — a decline is a "no" about that note) and one OPEN
 *    card per patient (a note + a survey = one apology);
 *  - worst first, then newest; the per-pass cap; AI off → nothing filed;
 *  - the filed artifact: the draft as the body, the patient's own words as
 *    the one quoted turn in the clinic's wall clock, the subject disclosed,
 *    the email the yes will send to;
 *  - soft failures: a provider break reports to the driver once; an
 *    exhausted allowance ends the pass; an unusable draft skips the note.
 */

const ai = vi.hoisted(() => ({
  configured: true,
  results: [] as Array<unknown | (() => never)>,
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/ai', () => ({
  aiConfigured: () => ai.configured,
  runClaudeJson: vi.fn(async (req: Record<string, unknown>) => {
    ai.calls.push(req)
    const next = ai.results.shift()
    if (typeof next === 'function') return (next as () => never)()
    return next ?? { text: 'We’re sorry Tuesday wasn’t what it should have been. Someone from the office would like to hear more and will call.' }
  }),
}))

const usage = vi.hoisted(() => ({ over: false, bumps: 0 }))
vi.mock('@/lib/services/ai-usage', () => ({
  isAiUsageOverCap: vi.fn(async () => usage.over),
  bumpAiUsage: vi.fn(async () => {
    usage.bumps++
  }),
}))
// The driver file is the cap's home; importing it here would load every
// generator's dependencies. The cycle is safe at call time (the value is
// read inside the function), and the test needs only the number.
vi.mock('@/lib/services/proposal-generators', () => ({ PROPOSAL_DRAFT_MONTHLY_CAP: 300 }))

const store = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}))

vi.mock('@/lib/db', () => {
  type Col = { __table: string; __col: string }
  type Joined = Record<string, Record<string, unknown>>
  const col = (table: string, name: string): Col => ({ __table: table, __col: name })
  const t = (name: string, ...names: string[]) =>
    Object.assign({ __name: name }, Object.fromEntries(names.map((c) => [c, col(name, c)])))
  const rowsOf = (name: string) => store.tables[name] ?? []
  function select(cols?: Record<string, Col>) {
    let rows: Joined[] = []
    const filters: Array<(r: Joined) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (tbl: { __name: string }) => {
      rows = rowsOf(tbl.__name).map((r) => ({ [tbl.__name]: r }))
      return api
    }
    api.innerJoin = (tbl: { __name: string }, pred: (r: Joined) => boolean) => {
      const right = rowsOf(tbl.__name)
      const out: Joined[] = []
      for (const l of rows) for (const r of right) {
        const merged = { ...l, [tbl.__name]: r }
        if (pred(merged)) out.push(merged)
      }
      rows = out
      return api
    }
    api.where = (preds: unknown) => {
      for (const p of Array.isArray(preds) ? preds : [preds]) if (typeof p === 'function') filters.push(p as never)
      return api
    }
    const result = () =>
      rows
        .filter((r) => filters.every((f) => f(r)))
        .map((r) => (cols ? Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, r[c.__table]?.[c.__col]])) : r))
    api.orderBy = () => api
    api.limit = async (n: number) => result().slice(0, n)
    api.then = (resolve: (v: unknown) => void) => resolve(result())
    return api
  }
  return {
    db: { select },
    schema: {
      reviewRequest: t('review_request', 'id', 'organizationId', 'patientId', 'privateFeedback', 'rating', 'completedAt'),
      npsResponse: t('nps_response', 'id', 'organizationId', 'patientId', 'comment', 'score', 'respondedAt'),
      patient: t('patient', 'id', 'organizationId', 'firstName', 'lastName', 'email', 'isActive'),
      proposal: t('proposal', 'id', 'organizationId', 'capability', 'status', 'sourceKey', 'patientId'),
      clinicProfile: t('clinic_profile', 'organizationId', 'displayName'),
    },
  }
})

vi.mock('drizzle-orm', () => {
  type Col = { __table: string; __col: string }
  type Joined = Record<string, Record<string, unknown>>
  const read = (r: Joined, c: Col) => r[c.__table]?.[c.__col]
  const isCol = (v: unknown): v is Col => !!v && typeof v === 'object' && '__col' in (v as object)
  return {
    eq: (a: Col, b: unknown) => (r: Joined) => read(r, a) === (isCol(b) ? read(r, b) : b),
    and: (...preds: unknown[]) => preds.flat().filter(Boolean),
    gte: (a: Col, v: Date) => (r: Joined) => {
      const av = read(r, a)
      return av instanceof Date && av.getTime() >= v.getTime()
    },
    lte: (a: Col, v: number) => (r: Joined) => {
      const av = read(r, a)
      return typeof av === 'number' && av <= v
    },
    isNotNull: (a: Col) => (r: Joined) => read(r, a) != null,
  }
})

const filed = vi.hoisted(() => ({ inputs: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async (input: Record<string, unknown>) => {
    filed.inputs.push(input)
    const proposals = (store.tables.proposal ??= [])
    proposals.push({
      id: `prop_${proposals.length + 1}`,
      organizationId: input.organizationId,
      capability: input.capability,
      sourceKey: input.sourceKey,
      patientId: input.patientId,
      status: 'open',
    })
    return { filed: true, id: `prop_${proposals.length}` }
  }),
}))

import {
  generateFeedbackReplyProposals,
  MAX_FEEDBACK_REPLIES_PER_RUN,
  FEEDBACK_LOOKBACK_DAYS,
} from '@/lib/services/proposal-generators/feedback-reply'

const ORG = 'org_1'
const TZ = 'America/Chicago'
// 3 PM UTC = 10 AM Chicago.
const NOW = new Date('2026-07-27T15:00:00Z')
const DAY = 24 * 3_600_000

let seq = 0
function seedPatient(over: Record<string, unknown> = {}): string {
  const id = `pat_${++seq}`
  ;(store.tables.patient ??= []).push({
    id,
    organizationId: ORG,
    firstName: 'Mia',
    lastName: 'Chen',
    email: `mia${seq}@example.com`,
    isActive: 1,
    ...over,
  })
  return id
}
function seedNote(patientId: string, over: Record<string, unknown> = {}): string {
  const id = `rr_${++seq}`
  ;(store.tables.review_request ??= []).push({
    id,
    organizationId: ORG,
    patientId,
    privateFeedback: 'The wait was over an hour and nobody told me why.',
    rating: 2,
    completedAt: new Date(NOW.getTime() - 2 * DAY),
    ...over,
  })
  return id
}
function seedSurvey(patientId: string, over: Record<string, unknown> = {}): string {
  const id = `nps_${++seq}`
  ;(store.tables.nps_response ??= []).push({
    id,
    organizationId: ORG,
    patientId,
    comment: 'Felt rushed.',
    score: 4,
    respondedAt: new Date(NOW.getTime() - 1 * DAY),
    ...over,
  })
  return id
}

beforeEach(() => {
  seq = 0
  store.tables = { clinic_profile: [{ organizationId: ORG, displayName: 'Dream Dental' }] }
  filed.inputs = []
  ai.configured = true
  ai.results = []
  ai.calls = []
  usage.over = false
  usage.bumps = 0
})

describe('selection', () => {
  it('files a drafted note back for a 2★ private note', async () => {
    const pat = seedPatient()
    const rr = seedNote(pat)
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(1)
    expect(filed.inputs[0]).toMatchObject({
      organizationId: ORG,
      capability: 'feedback_reply',
      sourceKey: `feedback_reply:review:${rr}`,
      patientId: pat,
      title: 'Write back to Mia — they told you privately their visit fell short',
    })
    expect(usage.bumps).toBe(1)
  })

  it('files for a detractor survey, quoting the score when there is no comment', async () => {
    const a = seedPatient()
    const s1 = seedSurvey(a, { score: 3, comment: null })
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(1)
    const p = filed.inputs[0] as { title: string; sourceKey: string; payload: { thread: { messages: Array<{ text: string; whenLabel: string }> } } }
    expect(p.sourceKey).toBe(`feedback_reply:nps:${s1}`)
    expect(p.title).toBe('Write back to Mia — they scored their visit 3/10')
    expect(p.payload.thread.messages[0].text).toContain('3/10')
    expect(p.payload.thread.messages[0].whenLabel).toContain('3/10 survey')
  })

  it('a 3★+ private note and a 7+ survey are left alone; an unrated note is answered', async () => {
    seedNote(seedPatient(), { rating: 4 })
    seedSurvey(seedPatient(), { score: 8 })
    const unrated = seedPatient()
    seedNote(unrated, { rating: null })
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(1)
    expect(filed.inputs[0]).toMatchObject({ patientId: unrated })
  })

  it('no email, an inactive patient, an older row or another org file nothing — no AI spend', async () => {
    seedNote(seedPatient({ email: null }))
    seedNote(seedPatient({ isActive: 0 }))
    seedNote(seedPatient(), { completedAt: new Date(NOW.getTime() - (FEEDBACK_LOOKBACK_DAYS + 1) * DAY) })
    seedSurvey(seedPatient(), { respondedAt: new Date(NOW.getTime() - (FEEDBACK_LOOKBACK_DAYS + 1) * DAY) })
    seedNote(seedPatient({ organizationId: 'org_2' }), { organizationId: 'org_2' })
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(0)
    expect(ai.calls).toHaveLength(0)
  })

  it('AI off → nothing filed, nothing drafted', async () => {
    ai.configured = false
    seedNote(seedPatient())
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(ai.calls).toHaveLength(0)
  })
})

describe('dedupe — before any AI spend', () => {
  it('the sourceKey names the NOTE: an already-asked note (any status) never re-asks', async () => {
    const pat = seedPatient()
    const rr = seedNote(pat)
    store.tables.proposal = [
      { id: 'old', organizationId: ORG, capability: 'feedback_reply', sourceKey: `feedback_reply:review:${rr}`, patientId: pat, status: 'declined' },
    ]
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(ai.calls).toHaveLength(0)
  })

  it('one OPEN card per patient: a note plus a survey from the same person is one draft, not two', async () => {
    const pat = seedPatient()
    seedNote(pat)
    seedSurvey(pat)
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ)).toBe(1)
    expect(ai.calls).toHaveLength(1)
  })

  it('a second pass over the same rows files nothing more', async () => {
    seedNote(seedPatient())
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ)).toBe(1)
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ)).toBe(0)
    expect(ai.calls).toHaveLength(1)
  })
})

describe('order and cap', () => {
  it(`worst first, newest second, at most ${MAX_FEEDBACK_REPLIES_PER_RUN} per org per pass`, async () => {
    const six = seedPatient()
    seedSurvey(six, { score: 6 })
    const two = seedPatient()
    seedNote(two, { rating: 2 })
    const one = seedPatient()
    seedNote(one, { rating: 1 })
    const three = seedPatient()
    seedSurvey(three, { score: 3 })
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ)
    expect(n).toBe(MAX_FEEDBACK_REPLIES_PER_RUN)
    expect(filed.inputs.map((p) => p.patientId)).toEqual([one, two, three])
  })
})

describe('the filed artifact', () => {
  it('quotes the patient’s words in the clinic’s wall clock, nests the draft, discloses the subject and the address', async () => {
    const pat = seedPatient({ firstName: 'Noah', lastName: 'Reyes', email: 'noah@example.com' })
    seedNote(pat, { completedAt: new Date('2026-07-25T20:12:00Z') })
    ai.results.push({ text: 'We’re sorry Friday wasn’t what it should have been.' })
    await generateFeedbackReplyProposals(ORG, NOW, TZ)
    const p = filed.inputs[0] as Record<string, unknown>
    expect(p.body).toBe('We’re sorry Friday wasn’t what it should have been.')
    expect(p.payload).toMatchObject({
      source: 'review',
      patientId: pat,
      subject: 'About your recent visit',
      context: { kind: 'thread', author: 'Noah Reyes' },
      thread: {
        toLine: 'Noah Reyes · noah@example.com',
        messages: [{ from: 'patient', author: 'Noah Reyes', text: 'The wait was over an hour and nobody told me why.' }],
      },
    })
    const when = (p.payload as { thread: { messages: Array<{ whenLabel: string }> } }).thread.messages[0].whenLabel
    // 20:12 UTC on July 25 is 3:12 PM in Chicago — the tz law.
    expect(when).toMatch(/3:12\s?PM/)
    expect(when).toContain('2★ private note')
    expect((p.expiresAt as Date).getTime()).toBe(NOW.getTime() + 7 * DAY)
    // The prompt carries the words and the practice's name, never a greeting instruction the shell already adds.
    const req = ai.calls[0] as { system: string; messages: Array<{ content: string }> }
    expect(req.messages[0].content).toContain('The wait was over an hour')
    expect(req.system).toContain('Dream Dental')
    expect(req.system).toContain('Do NOT open with a greeting')
  })
})

describe('soft failures', () => {
  it('a PROVIDER break reports to the driver once and the pass moves on; an unusable draft skips silently', async () => {
    seedNote(seedPatient(), { rating: 1 })
    seedNote(seedPatient(), { rating: 2 })
    seedNote(seedPatient(), { rating: 2, completedAt: new Date(NOW.getTime() - 3 * DAY) })
    ai.results.push(() => {
      throw new Error('529 overloaded')
    })
    ai.results.push({ nope: true })
    const soft = vi.fn()
    const n = await generateFeedbackReplyProposals(ORG, NOW, TZ, soft)
    expect(soft).toHaveBeenCalledTimes(1)
    expect(n).toBe(1)
    expect(ai.calls).toHaveLength(3)
  })

  it('an exhausted draft allowance ends the pass — no drafts attempted', async () => {
    usage.over = true
    seedNote(seedPatient())
    seedNote(seedPatient())
    const soft = vi.fn()
    expect(await generateFeedbackReplyProposals(ORG, NOW, TZ, soft)).toBe(0)
    expect(ai.calls).toHaveLength(0)
    expect(soft).not.toHaveBeenCalled()
  })
})
