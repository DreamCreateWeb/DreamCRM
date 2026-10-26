import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /c/[token] one-click confirm: token mint/reuse + the confirm state machine
 * (pending → confirmed, idempotent re-click, cancelled/past report their
 * state and never mutate).
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ set })
          },
        }),
      }),
    },
    schema: {
      appointment: {
        id: 'id', organizationId: 'org', patientId: 'pid', status: 'status',
        startTime: 'startTime', endTime: 'endTime', type: 'type', providerId: 'providerId', confirmToken: 'confirmToken',
      },
      patient: { id: 'id', firstName: 'firstName' },
      clinicProvider: { id: 'id', displayName: 'displayName' },
      clinicProfile: {
        organizationId: 'org', displayName: 'displayName', brandColor: 'b', logoUrl: 'l', phone: 'p', timezone: 'tz', visitTypeSettings: 'vts',
        addressLine1: 'a1', city: 'city', state: 'state', postalCode: 'zip',
      },
      organization: { id: 'id', slug: 'slug', name: 'name' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
}))

const { commLogMock } = vi.hoisted(() => ({ commLogMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/pms', () => ({ queueCommLogWriteBack: commLogMock }))

import {
  getOrCreateConfirmToken,
  confirmVisitByToken,
  getConfirmContextByToken,
} from '@/lib/services/appointment-confirm'

const FUTURE = new Date(Date.now() + 30 * 60 * 60 * 1000)
const PAST = new Date(Date.now() - 2 * 60 * 60 * 1000)

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

describe('getOrCreateConfirmToken', () => {
  it('reuses an existing token (one link across every journey touch)', async () => {
    state.selectQueue.push([{ id: 'a1', confirmToken: 'ct_existing' }])
    expect(await getOrCreateConfirmToken('org_1', 'a1')).toBe('ct_existing')
    expect(state.updates).toHaveLength(0)
  })

  it('mints a ct_ token when none exists yet', async () => {
    state.selectQueue.push([{ id: 'a1', confirmToken: null }])
    state.selectQueue.push([]) // post-write re-read misses in this mock → falls back to the minted token
    const token = await getOrCreateConfirmToken('org_1', 'a1')
    expect(token).toMatch(/^ct_/)
    expect(state.updates[0]!.set.confirmToken).toBe(token)
  })

  it('returns null for an appointment outside the org (tenant scoping)', async () => {
    state.selectQueue.push([])
    expect(await getOrCreateConfirmToken('org_1', 'a_other')).toBeNull()
  })
})

describe('confirmVisitByToken', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    organizationId: 'org_1',
    patientId: 'pat_1',
    status: 'scheduled',
    startTime: FUTURE,
    ...over,
  })

  it('confirms a pending future visit (scheduled → confirmed via email)', async () => {
    state.selectQueue.push([row()])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: true, state: 'confirmed' })
    expect(state.updates[0]!.set).toMatchObject({ status: 'confirmed', confirmedVia: 'email' })
    expect(commLogMock).toHaveBeenCalled()
  })

  it('is idempotent on re-click of an already-confirmed visit', async () => {
    state.selectQueue.push([row({ status: 'confirmed' })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: true, state: 'confirmed' })
    expect(state.updates).toHaveLength(0) // no second write
  })

  it('reports cancelled without mutating', async () => {
    state.selectQueue.push([row({ status: 'cancelled' })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: false, state: 'cancelled' })
    expect(state.updates).toHaveLength(0)
  })

  it('reports past for a visit that already started', async () => {
    state.selectQueue.push([row({ startTime: PAST })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: false, state: 'past' })
    expect(state.updates).toHaveLength(0)
  })

  it('unknown token → not ok', async () => {
    state.selectQueue.push([])
    expect((await confirmVisitByToken('ct_nope')).ok).toBe(false)
  })
})

/**
 * The landing's Add-to-calendar used to hardcode a 30-minute block with no
 * address while the portal's own .ics for the SAME visit carried the real end
 * and the clinic's street address. The context now carries both.
 */
describe('getConfirmContextByToken — the calendar facts', () => {
  const END = new Date(FUTURE.getTime() + 60 * 60 * 1000)
  function queueRows(opts: { endTime: Date | null; address?: boolean }) {
    state.selectQueue = [
      [{ organizationId: 'org_1', status: 'scheduled', startTime: FUTURE, endTime: opts.endTime, type: 'root_canal', providerName: 'Dr. Reyes', firstName: 'Maria' }],
      [{
        displayName: 'Acme Dental', brandColor: null, logoUrl: null, phone: '(555) 555-0100', timezone: 'America/Chicago', visitTypeSettings: null,
        ...(opts.address === false
          ? { addressLine1: null, city: null, state: null, postalCode: null }
          : { addressLine1: '123 Main St', city: 'Springfield', state: 'IL', postalCode: '62701' }),
      }],
      [{ slug: 'acme', name: 'Acme Dental' }],
    ]
  }

  it('carries the visit\'s REAL end and the practice\'s address', async () => {
    queueRows({ endTime: END })
    const ctx = await getConfirmContextByToken('ct_x')
    expect(ctx).not.toBeNull()
    expect(ctx!.endTime?.toISOString()).toBe(END.toISOString())
    expect(ctx!.location).toBe('123 Main St, Springfield, IL, 62701')
    expect(ctx!.startTime.toISOString()).toBe(FUTURE.toISOString())
  })

  it('a row with no end and a practice with no address: honest nulls, not a fabricated block', async () => {
    queueRows({ endTime: null, address: false })
    const ctx = await getConfirmContextByToken('ct_x')
    expect(ctx!.endTime).toBeNull()
    expect(ctx!.location).toBe('')
  })
})
