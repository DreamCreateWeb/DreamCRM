import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NPS surveys — the send engine (opt-in, demo skip, per-appointment + per-
 * patient throttles), the token landing writes (score bounds, comment only
 * after a score), and the detractor escalation.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ values: Record<string, unknown> }>,
  updateReturning: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table: (table as { _n: string })._n, values })
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            state.updates.push({ values })
            const p: any = Promise.resolve(undefined)
            p.returning = async () => state.updateReturning.shift() ?? []
            return p
          },
        }),
      }),
    },
    schema: {
      clinicReviewConfig: { organizationId: 'org', npsEnabled: 'nps' },
      organization: { id: 'id', isDemo: 'demo' },
      appointment: { id: 'id', organizationId: 'org', patientId: 'pid', status: 's', completedAt: 'c' },
      patient: { id: 'id', firstName: 'fn', lastName: 'ln', email: 'e', isActive: 'a' },
      npsResponse: {
        _n: 'nps_response', organizationId: 'org', patientId: 'pid', appointmentId: 'aid',
        token: 'token', score: 'score', comment: 'comment', sentAt: 'sentAt', respondedAt: 'ra', id: 'id',
      },
      clinicProfile: { organizationId: 'org', displayName: 'dn', brandColor: 'bc', logoUrl: 'lu' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})), eq: vi.fn(() => ({})), gte: vi.fn(() => ({})), lte: vi.fn(() => ({})),
  ne: vi.fn(() => ({})), desc: vi.fn(() => ({})), inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
}))

const { deliverMock, notifyMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(async () => {}),
  notifyMock: vi.fn(async () => {}),
}))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: vi.fn(() => '<html>survey</html>'),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental', from: 'Acme <a@x.com>', replyTo: null, gmail: null, timeZone: 'America/Chicago',
  })),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyMock }))

import { runDueNpsSurveys, recordNpsScore, recordNpsComment } from '@/lib/services/nps'

const NOW = new Date('2026-07-02T15:00:00Z')

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.updateReturning = []
  vi.clearAllMocks()
})

describe('runDueNpsSurveys', () => {
  it('sends one survey per eligible visit, throttling repeats', async () => {
    state.selectQueue.push([{ organizationId: 'org_1' }]) // enabled configs
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([
      { appointmentId: 'a1', patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' },
      { appointmentId: 'a2', patientId: 'p2', firstName: 'Noah', email: 'noah@x.com' },
      { appointmentId: 'a3', patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' }, // second visit, same patient
    ])
    state.selectQueue.push([{ appointmentId: 'a2' }]) // a2 already surveyed
    state.selectQueue.push([]) // no patients inside the 180d throttle

    const r = await runDueNpsSurveys({ now: NOW })
    expect(r).toMatchObject({ orgsScanned: 1, candidates: 3, sent: 1, skipped: 1, throttled: 1 })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(state.inserts).toHaveLength(1)
    expect(String(state.inserts[0].values.token)).toMatch(/^nps_/)
  })

  it('demo orgs never send', async () => {
    state.selectQueue.push([{ organizationId: 'org_demo' }])
    state.selectQueue.push([{ isDemo: true }])
    const r = await runDueNpsSurveys({ now: NOW })
    expect(r.orgsScanned).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
  })
})

describe('recordNpsScore', () => {
  it('rejects out-of-range scores without touching the db', async () => {
    expect(await recordNpsScore('t', 11)).toBe(false)
    expect(await recordNpsScore('t', -1)).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('records a promoter quietly (no escalation)', async () => {
    state.updateReturning.push([{ id: 'n1', organizationId: 'org_1', patientId: 'p1' }])
    expect(await recordNpsScore('tok', 10)).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('escalates a detractor to staff', async () => {
    state.updateReturning.push([{ id: 'n1', organizationId: 'org_1', patientId: 'p1' }])
    state.selectQueue.push([{ firstName: 'Ethan', lastName: 'Ward' }])
    expect(await recordNpsScore('tok', 3)).toBe(true)
    expect(notifyMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ title: expect.stringContaining('3/10') }),
      expect.anything(),
    )
  })

  it('unknown token → false', async () => {
    state.updateReturning.push([])
    expect(await recordNpsScore('nope', 8)).toBe(false)
  })
})

describe('recordNpsComment', () => {
  it('attaches only after a score exists (WHERE score not null)', async () => {
    state.updateReturning.push([{ id: 'n1' }])
    expect(await recordNpsComment('tok', '  Great team!  ')).toBe(true)
    expect(state.updates[0].values.comment).toBe('Great team!')
  })

  it('empty comments are a no-op', async () => {
    expect(await recordNpsComment('tok', '   ')).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})
