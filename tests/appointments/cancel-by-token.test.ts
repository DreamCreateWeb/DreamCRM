import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { rows: [] as unknown[][] }
const cancelAppointment = vi.fn(async () => {})

vi.mock('@/lib/db', () => {
  const chain: any = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => state.rows.shift() ?? []
  return {
    db: { select: () => chain },
    schema: {
      appointment: { id: 'id', organizationId: 'org', status: 'status', startTime: 'st', confirmToken: 'ct' },
    },
  }
})
vi.mock('drizzle-orm', () => ({ and: (...a: unknown[]) => a, eq: (...a: unknown[]) => a, isNull: (...a: unknown[]) => a }))
vi.mock('@/lib/services/pms', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/appointments', () => ({ cancelAppointment: (...a: unknown[]) => (cancelAppointment as any)(...a) }))

import { cancelVisitByToken } from '@/lib/services/appointment-confirm'

const future = new Date(Date.now() + 86_400_000 * 3)
const past = new Date(Date.now() - 86_400_000)

describe('cancelVisitByToken', () => {
  beforeEach(() => {
    state.rows = []
    cancelAppointment.mockClear()
  })

  it('cancels via the one path with the org from the token row and the link actor', async () => {
    state.rows = [[{ id: 'a1', organizationId: 'org1', status: 'confirmed', startTime: future }]]
    const r = await cancelVisitByToken('ct_abcdefgh')
    expect(r).toEqual({ ok: true, state: 'cancelled' })
    expect(cancelAppointment).toHaveBeenCalledWith('org1', 'a1', { via: 'confirm_link' })
  })

  it('is idempotent for an already-cancelled visit and never re-cancels', async () => {
    state.rows = [[{ id: 'a1', organizationId: 'org1', status: 'cancelled', startTime: future }]]
    expect(await cancelVisitByToken('ct_abcdefgh')).toEqual({ ok: true, state: 'cancelled' })
    expect(cancelAppointment).not.toHaveBeenCalled()
  })

  it('refuses a past visit and an unknown token', async () => {
    state.rows = [[{ id: 'a1', organizationId: 'org1', status: 'scheduled', startTime: past }], []]
    expect((await cancelVisitByToken('ct_abcdefgh')).ok).toBe(false)
    expect((await cancelVisitByToken('ct_zzzzzzzz')).ok).toBe(false)
    expect(cancelAppointment).not.toHaveBeenCalled()
  })
})
