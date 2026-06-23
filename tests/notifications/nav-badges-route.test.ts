import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/nav-badges — sidebar unread-count source. Auth-gated via
 * getTenantContext; clinic tenants only; resilient (one failing count must not
 * blank the others).
 */

const { ctxMock, inboxMock, leadsMock, followupsMock } = vi.hoisted(() => ({
  ctxMock: vi.fn(),
  inboxMock: vi.fn(),
  leadsMock: vi.fn(),
  followupsMock: vi.fn(),
}))

vi.mock('@/lib/auth/context', () => ({ getTenantContext: ctxMock }))
vi.mock('@/lib/services/patient-messaging', () => ({ getInboxStats: inboxMock }))
vi.mock('@/lib/services/leads', () => ({ getLeadCounts: leadsMock }))
vi.mock('@/lib/services/patient-followups', () => ({ countFollowupsDue: followupsMock }))

// Per-table count mock so the leads "since" branch (queries schema.lead) and
// the shop count (queries schema.shopOrder) are distinguishable.
const state = { orderCount: 0, leadSinceCount: 0, apptCount: 0, orderThrows: false, apptThrows: false, lastTable: '' as string }
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: { _name: string }) => {
        state.lastTable = t?._name ?? ''
        return {
          where: async () => {
            if (state.lastTable === 'shopOrder') {
              if (state.orderThrows) throw new Error('shop tables missing')
              return [{ c: state.orderCount }]
            }
            if (state.lastTable === 'lead') return [{ c: state.leadSinceCount }]
            if (state.lastTable === 'appointment') {
              if (state.apptThrows) throw new Error('appointment tables missing')
              return [{ c: state.apptCount }]
            }
            return [{ c: 0 }]
          },
        }
      },
    }),
  },
  schema: {
    shopOrder: { _name: 'shopOrder', organizationId: 'org', status: 'status', fulfillmentStatus: 'fulfillment_status', paidAt: 'paid_at' },
    lead: { _name: 'lead', organizationId: 'org', status: 'status', createdAt: 'created_at' },
    appointment: { _name: 'appointment', organizationId: 'org', status: 'status', startTime: 'start_time' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  count: vi.fn(() => ({ _: 'count' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  gt: vi.fn(() => ({ _: 'gt' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
}))

import { GET } from '@/app/api/nav-badges/route'

const CLINIC_CTX = { tenantType: 'clinic', organizationId: 'org_1', userId: 'u1' }
const req = (qs = '') => new Request(`http://localhost/api/nav-badges${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  state.orderCount = 4
  state.leadSinceCount = 0
  state.apptCount = 6
  state.orderThrows = false
  state.apptThrows = false
  ctxMock.mockResolvedValue(CLINIC_CTX)
  inboxMock.mockResolvedValue({ open: 5, unread: 3, snoozedAvailable: 0, archived: 0 })
  leadsMock.mockResolvedValue({ new: 2, contacted: 0, converted: 0, archived: 0, total: 2 })
  followupsMock.mockResolvedValue(7)
})

describe('GET /api/nav-badges', () => {
  it('returns the five counts for a clinic tenant (no since → totals)', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ messages: 3, leads: 2, shop: 4, followups: 7, appointments: 6 })
    // No since → leads come from getLeadCounts (the total backlog).
    expect(leadsMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces the unconfirmed-next-48h appointments count', async () => {
    state.apptCount = 9
    const body = await (await GET(req())).json()
    expect(body.appointments).toBe(9)
  })

  it('a failing appointments count zeroes only itself', async () => {
    state.apptThrows = true
    const body = await (await GET(req())).json()
    expect(body).toEqual({ messages: 3, leads: 2, shop: 4, followups: 7, appointments: 0 })
  })

  it('surfaces the follow-ups-due count (overdue + due today)', async () => {
    followupsMock.mockResolvedValue(3)
    const body = await (await GET(req())).json()
    expect(body.followups).toBe(3)
    expect(followupsMock).toHaveBeenCalledWith('org_1')
  })

  it('counts only leads created since ?leadsSince (the "new since you looked" nudge)', async () => {
    state.leadSinceCount = 1
    const res = await GET(req('?leadsSince=1700000000000'))
    const body = await res.json()
    // getLeadCounts is bypassed; the since-scoped query drives the count.
    expect(leadsMock).not.toHaveBeenCalled()
    expect(body.leads).toBe(1)
  })

  it('an up-to-date ?leadsSince yields a zero leads badge', async () => {
    state.leadSinceCount = 0
    const body = await (await GET(req('?leadsSince=1700000000000'))).json()
    expect(body.leads).toBe(0)
  })

  it('ignores a malformed ?leadsSince (falls back to totals)', async () => {
    const body = await (await GET(req('?leadsSince=notanumber'))).json()
    expect(leadsMock).toHaveBeenCalledTimes(1)
    expect(body.leads).toBe(2)
  })

  it('returns 401 + zeros when there is no session', async () => {
    ctxMock.mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0, followups: 0, appointments: 0 })
  })

  it('zeroes the badges for a non-clinic (platform) tenant', async () => {
    ctxMock.mockResolvedValue({ tenantType: 'platform', organizationId: 'plat', userId: 'u1' })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0, followups: 0, appointments: 0 })
    expect(inboxMock).not.toHaveBeenCalled()
    expect(followupsMock).not.toHaveBeenCalled()
  })

  it('zeroes the badges for a patient tenant', async () => {
    ctxMock.mockResolvedValue({ tenantType: 'patient', organizationId: 'org_1', userId: 'u1', patientId: 'pat_1' })
    const res = await GET(req())
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0, followups: 0, appointments: 0 })
  })

  it('is resilient — one failing count zeroes only itself', async () => {
    state.orderThrows = true // shop count blows up
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: 3, leads: 2, shop: 0, followups: 7, appointments: 6 })
  })

  it('a failing follow-ups count zeroes only itself', async () => {
    followupsMock.mockRejectedValue(new Error('followup tables missing'))
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: 3, leads: 2, shop: 4, followups: 0, appointments: 6 })
  })

  it('sets Cache-Control: no-store so badges never serve stale', async () => {
    const res = await GET(req())
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
