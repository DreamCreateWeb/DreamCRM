import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * ML-51's first-week ask — "Which holidays is the office closed for?" — files
 * ONCE, only while the practice has stated no closure and a usual holiday is
 * within ~4 months, and carries preset KEYS (never raw dates) in its payload.
 */

const profile: Record<string, unknown> = {}
const closures = { list: [] as Array<{ id: string; startsOn: string; endsOn: string; label: string }>, throws: false }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.limit = async () => [profile]
    return api
  }
  return {
    db: { select: () => chain() },
    schema: {
      clinicProfile: { hours: {}, hoursSource: {}, chairCount: {}, selfBookingEnabled: {}, siteLiveAt: {}, timezone: {}, organizationId: {} },
      clinicSmsConfig: { a2pStatus: {}, organizationId: {} },
    },
  }
})
vi.mock('@/lib/services/closures', async () => {
  const real = await vi.importActual<typeof import('@/lib/closures')>('@/lib/closures')
  void real
  return {
    clinicDayKeyFor: (now: Date) => now.toISOString().slice(0, 10),
    listUpcomingClosures: vi.fn(async () => {
      if (closures.throws) throw new Error('db down')
      return closures.list
    }),
  }
})

const { fileProposalMock } = vi.hoisted(() => ({
  fileProposalMock: vi.fn(async (_input: Record<string, unknown>) => ({ filed: true, id: 'p1' })),
}))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: fileProposalMock,
  expireStaleProposals: vi.fn(async () => 0),
  reconcileStrandedApprovals: vi.fn(async () => undefined),
  closeRecoveredProposal: vi.fn(async () => undefined),
  listOpenProposals: vi.fn(async () => []),
  countOpenProposals: vi.fn(async () => 0),
  resolveGrantedCapabilities: vi.fn(() => []),
  autoExecuteProposal: vi.fn(async () => ({ ok: true })),
}))
vi.mock('drizzle-orm', () => ({
  eq: () => () => true,
  and: (...p: unknown[]) => p,
  desc: () => undefined,
  gte: () => () => true,
  inArray: () => () => true,
  isNull: () => () => true,
  or: (...p: unknown[]) => p,
  sql: Object.assign(() => '', { raw: () => '' }),
}))

import { generateSetupProposals } from '@/lib/services/proposal-generators'

function filed(): Array<{ capability: string; sourceKey: string; body: string; payload?: { proposed: string[] } }> {
  return fileProposalMock.mock.calls.map((c) => c[0] as never)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-09T15:00:00Z'))
  fileProposalMock.mockClear()
  closures.list = []
  closures.throws = false
  for (const k of Object.keys(profile)) delete profile[k]
  // Everything else answered, so only the closures ask is in play.
  Object.assign(profile, { hours: { mon: { open: '08:00', close: '16:00' } }, hoursSource: 'confirmed', chairCount: 3, selfBookingEnabled: true, siteLiveAt: new Date(), timezone: 'America/Chicago' })
})
afterEach(() => vi.useRealTimers())

describe('generateSetupProposals — setup_closures (ML-51)', () => {
  it('asks once, naming the next usual holidays, carrying preset keys', async () => {
    expect(await generateSetupProposals('org_1')).toBe(1)
    const [ask] = filed()
    expect(ask.capability).toBe('setup_closures')
    expect(ask.sourceKey).toBe('setup_closures:v1')
    expect(ask.body).toContain('Thanksgiving — Nov 26–27')
    expect(ask.body).toContain('Christmas Day — Dec 25')
    expect(ask.payload?.proposed).toEqual(['thanksgiving-2026', 'christmas-2026', 'new-years-day-2027'])
  })

  it('stays quiet once any closure is stated', async () => {
    closures.list = [{ id: 'c1', startsOn: '2026-12-24', endsOn: '2026-12-26', label: 'Winter break' }]
    expect(await generateSetupProposals('org_1')).toBe(0)
  })

  it('stays quiet when no usual holiday is near (early January: Memorial Day is 5 months out)', async () => {
    vi.setSystemTime(new Date('2027-01-05T15:00:00Z'))
    expect(await generateSetupProposals('org_1')).toBe(0)
  })

  it('an unreadable closure list never files a guess', async () => {
    closures.throws = true
    expect(await generateSetupProposals('org_1')).toBe(0)
  })
})
