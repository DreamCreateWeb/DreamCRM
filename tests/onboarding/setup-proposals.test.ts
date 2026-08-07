import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * generateSetupProposals (onboarding overhaul: "setup asks ARE proposals").
 * Pins the filing predicates: each ask files exactly while its fact is
 * still unanswered, and never once the fact exists — however it got set.
 */

const profile: Record<string, unknown> = {}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.limit = async () => (Object.keys(profile).length ? [profile] : [])
    return api
  }
  return {
    db: { select: () => chain() },
    schema: {
      clinicProfile: {
        hours: {},
        hoursSource: {},
        chairCount: {},
        selfBookingEnabled: {},
        siteLiveAt: {},
        organizationId: {},
      },
    },
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

const SEED_WEEK = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { open: null, close: null },
  sun: { open: null, close: null },
}

function setProfile(over: Record<string, unknown>) {
  for (const k of Object.keys(profile)) delete profile[k]
  Object.assign(
    profile,
    {
      hours: structuredClone(SEED_WEEK),
      hoursSource: 'seeded',
      chairCount: null,
      selfBookingEnabled: true,
      siteLiveAt: null,
    },
    over,
  )
}

function filedCapabilities(): string[] {
  return fileProposalMock.mock.calls.map(
    (c) => (c[0] as { capability: string }).capability,
  )
}

beforeEach(() => {
  fileProposalMock.mockClear()
  setProfile({})
})

describe('generateSetupProposals', () => {
  it('a day-0 org gets all three asks', async () => {
    const n = await generateSetupProposals('org_1')
    expect(n).toBe(3)
    expect(filedCapabilities()).toEqual(['setup_hours', 'setup_chairs', 'setup_booking_mode'])
  })

  it('a fully-answered org gets nothing', async () => {
    setProfile({ hoursSource: 'confirmed', chairCount: 4, siteLiveAt: new Date() })
    expect(await generateSetupProposals('org_1')).toBe(0)
  })

  it('hours: seeded source asks; google/confirmed/human-shaped manual do not', async () => {
    setProfile({ hoursSource: 'google' })
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).not.toContain('setup_hours')

    fileProposalMock.mockClear()
    setProfile({ hoursSource: 'manual' }) // legacy rows: manual + still the seed shape
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).toContain('setup_hours')

    fileProposalMock.mockClear()
    setProfile({
      hoursSource: 'manual',
      hours: { ...structuredClone(SEED_WEEK), mon: { open: '08:00', close: '16:00' } },
    })
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).not.toContain('setup_hours')
  })

  it('booking mode: never asked once live, or once request mode was chosen by hand', async () => {
    setProfile({ siteLiveAt: new Date() })
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).not.toContain('setup_booking_mode')

    fileProposalMock.mockClear()
    setProfile({ selfBookingEnabled: false })
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).not.toContain('setup_booking_mode')
  })

  it('chairs: only while unset', async () => {
    setProfile({ chairCount: 2 })
    await generateSetupProposals('org_1')
    expect(filedCapabilities()).not.toContain('setup_chairs')
  })

  it('the hours card shows the actual stored week, day by day', async () => {
    await generateSetupProposals('org_1')
    const hoursCall = fileProposalMock.mock.calls
      .map((c) => c[0] as { capability: string; body: string })
      .find((c) => c.capability === 'setup_hours')!
    expect(hoursCall.body).toContain('Monday: 09:00–17:00')
    expect(hoursCall.body).toContain('Saturday: closed')
  })
})
