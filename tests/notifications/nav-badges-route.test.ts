import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/nav-badges — sidebar unread-count source. Auth-gated via
 * getTenantContext; clinic tenants only; resilient (one failing count must not
 * blank the others).
 */

const { ctxMock, inboxMock, leadsMock } = vi.hoisted(() => ({
  ctxMock: vi.fn(),
  inboxMock: vi.fn(),
  leadsMock: vi.fn(),
}))

vi.mock('@/lib/auth/context', () => ({ getTenantContext: ctxMock }))
vi.mock('@/lib/services/patient-messaging', () => ({ getInboxStats: inboxMock }))
vi.mock('@/lib/services/leads', () => ({ getLeadCounts: leadsMock }))

const state = { orderCount: 0, orderThrows: false }
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (state.orderThrows) throw new Error('shop tables missing')
          return [{ c: state.orderCount }]
        },
      }),
    }),
  },
  schema: { shopOrder: { organizationId: 'org', status: 'status', fulfillmentStatus: 'fulfillment_status' } },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  count: vi.fn(() => ({ _: 'count' })),
  eq: vi.fn(() => ({ _: 'eq' })),
}))

import { GET } from '@/app/api/nav-badges/route'

const CLINIC_CTX = { tenantType: 'clinic', organizationId: 'org_1', userId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  state.orderCount = 0
  state.orderThrows = false
  ctxMock.mockResolvedValue(CLINIC_CTX)
  inboxMock.mockResolvedValue({ open: 5, unread: 3, snoozedAvailable: 0, archived: 0 })
  leadsMock.mockResolvedValue({ new: 2, contacted: 0, converted: 0, archived: 0, total: 2 })
  state.orderCount = 4
})

describe('GET /api/nav-badges', () => {
  it('returns the three counts for a clinic tenant', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ messages: 3, leads: 2, shop: 4 })
  })

  it('returns 401 + zeros when there is no session', async () => {
    ctxMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0 })
  })

  it('zeroes the badges for a non-clinic (platform) tenant', async () => {
    ctxMock.mockResolvedValue({ tenantType: 'platform', organizationId: 'plat', userId: 'u1' })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0 })
    // No count queries run for platform.
    expect(inboxMock).not.toHaveBeenCalled()
  })

  it('zeroes the badges for a patient tenant', async () => {
    ctxMock.mockResolvedValue({ tenantType: 'patient', organizationId: 'org_1', userId: 'u1', patientId: 'pat_1' })
    const res = await GET()
    expect(await res.json()).toEqual({ messages: 0, leads: 0, shop: 0 })
  })

  it('is resilient — one failing count zeroes only itself', async () => {
    state.orderThrows = true // shop count blows up
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ messages: 3, leads: 2, shop: 0 })
  })

  it('sets Cache-Control: no-store so badges never serve stale', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
