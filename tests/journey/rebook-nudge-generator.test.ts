import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE REBOOK NUDGE GENERATOR (ML-29, G1-17). Pins: the clinic-local 7-day
 * window, dedupe per visit + one card per patient, the stand-downs (booked
 * since, an open card, a campaign this month or in flight), the consent /
 * email floor, and "no booking page -> nothing filed".
 */

const db = vi.hoisted(() => ({ queues: {} as Record<string, unknown[][]> }))
vi.mock('@/lib/db', () => {
  const schema = new Proxy({}, {
    get: (_t, table: string) => new Proxy({ __name: table }, { get: (o, c: string) => (c in o ? (o as Record<string, unknown>)[c] : { __col: c }) }),
  })
  const select = () => {
    let rows: unknown[] = []
    const api: Record<string, unknown> = {}
    for (const m of ['where', 'orderBy', 'innerJoin', 'limit']) api[m] = () => api
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
  and: () => true, eq: () => true, gte: () => true, lt: () => true, asc: () => true, inArray: () => true,
}))

const filed = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, ok: true }))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async (a: Record<string, unknown>) => {
    filed.calls.push(a)
    return { filed: filed.ok }
  }),
}))
const site = vi.hoisted(() => ({ url: 'https://acme.example/book' as string | null }))
vi.mock('@/lib/services/marketing-send', () => ({ resolveClinicBookingUrl: vi.fn(async () => site.url) }))
vi.mock('@/lib/services/clinic-cadence', () => ({ getClinicCadence: vi.fn(async () => ({ recallMonths: 6, lapsedMonths: 12 })) }))
const inflight = vi.hoisted(() => ({ recipients: [] as Array<{ patientId: string }> }))
vi.mock('@/lib/services/marketing-campaigns', () => ({ resolveCampaignRecipients: vi.fn(async () => inflight.recipients) }))

import { generateRebookNudgeProposals } from '@/lib/services/proposal-generators/rebook-nudge'

const ORG = 'org_1'
const TZ = 'America/Chicago'
const NOW = new Date('2026-11-09T15:00:00Z') // Mon Nov 9, 9am Central

const visit = (id: string, patientId: string, iso: string, type = 'cleaning') => ({ id, patientId, type, startTime: new Date(iso) })
const patient = (id: string, over: Record<string, unknown> = {}) => ({
  id, firstName: id.toUpperCase(), email: `${id}@example.com`, isActive: 1, marketingEmailOptIn: 1, recallIntervalMonths: null, ...over,
})

function seed(o: {
  visits: unknown[]; patients?: unknown[]; future?: string[]; openCards?: string[]; sentThisMonth?: string[]; taken?: string[]
}) {
  db.queues = {
    appointment: [o.visits, (o.future ?? []).map((patientId) => ({ patientId }))],
    patient: [o.patients ?? []],
    // first read = open cards; each later read = sourceKeyTaken
    proposal: [(o.openCards ?? []).map((patientId) => ({ patientId })), ...(o.taken ?? []).map(() => [{ id: 'x' }])],
    campaignEvents: [(o.sentThisMonth ?? []).map((patientId) => ({ patientId }))],
    campaigns: [[]],
  }
}

beforeEach(() => {
  filed.calls = []
  filed.ok = true
  site.url = 'https://acme.example/book'
  inflight.recipients = []
  db.queues = {}
})

describe('the window (clinic-local days)', () => {
  it('a hygiene visit a week ago with nothing booked -> ONE card with the booking-door payload', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(1)
    expect(filed.calls[0]).toMatchObject({
      organizationId: ORG, capability: 'rebook_nudge', sourceKey: 'rebook_nudge:a1', patientId: 'p1',
      payload: { appointmentId: 'a1', context: { kind: 'visit', author: 'P1' } },
    })
    expect(String(filed.calls[0].body)).toContain('isn’t on the calendar yet')
  })

  it('a visit only 5 days ago is too soon; one 40 days ago is the recall engine’s', async () => {
    seed({
      visits: [visit('a1', 'p1', '2026-11-04T16:00:00Z'), visit('a2', 'p2', '2026-09-30T16:00:00Z')],
      patients: [patient('p1'), patient('p2')],
    })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })

  it('the day boundary is the clinic’s: 9:30pm Central on day -7 (already the 3rd in UTC) still counts', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-03T03:30:00Z')], patients: [patient('p1')] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(1)
  })

  it('non-hygiene visits never nudge', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z', 'extraction')], patients: [patient('p1')] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
})

describe('dedupe', () => {
  it('a visit already carded (sourceKey taken) is never carded again', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')], taken: ['a1'] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('two visits of one patient in the window earn ONE note', async () => {
    seed({
      visits: [visit('a1', 'p1', '2026-10-25T16:00:00Z'), visit('a2', 'p1', '2026-11-02T16:00:00Z', 'checkup')],
      patients: [patient('p1')],
    })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(1)
  })
  it('a patient with an open card already is skipped', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')], openCards: ['p1'] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
})

describe('stand-downs', () => {
  it('booked since -> no card', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')], future: ['p1'] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('a campaign wrote to them this month -> no card', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')], sentThisMonth: ['p1'] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('a campaign scheduled or sending right now that includes them -> no card', async () => {
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')] })
    db.queues.campaigns = [[{ id: 'c1' }]]
    inflight.recipients = [{ patientId: 'p1' }]
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('opted out, no email, or archived -> no card (consent is louder)', async () => {
    seed({
      visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z'), visit('a2', 'p2', '2026-11-02T16:00:00Z'), visit('a3', 'p3', '2026-11-02T16:00:00Z')],
      patients: [patient('p1', { marketingEmailOptIn: 0 }), patient('p2', { email: ' ' }), patient('p3', { isActive: 0 })],
    })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
  })
  it('no booking page resolves -> nothing filed (a nudge with no door is a nag)', async () => {
    site.url = null
    seed({ visits: [visit('a1', 'p1', '2026-11-02T16:00:00Z')], patients: [patient('p1')] })
    expect(await generateRebookNudgeProposals(ORG, NOW, TZ)).toBe(0)
    expect(filed.calls).toHaveLength(0)
  })
})
