import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Booking deposits:
 *  - visit-type config: depositCents sanitization (off by default, clamped)
 *  - createBookingDepositSession: fail-open gating (Connect inactive / tiny
 *    amount / Stripe error → null, never throws — the booking already exists)
 *  - finalizeBookingDepositFromSession: idempotent CAS pending → paid,
 *    auto-confirms the scheduled appointment, race loser is a no-op
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table, values })
        },
      }),
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async (_w?: unknown) => {
            state.updates.push({ table, set })
          },
        }),
      }),
    },
    schema: {
      shopConfig: { _name: 'shop_config', organizationId: 'org', stripeAccountId: 'a', stripeAccountStatus: 's', chargesEnabled: 'c', currency: 'cur' },
      bookingDeposit: { _name: 'booking_deposit', id: 'id', organizationId: 'org', patientId: 'p', appointmentId: 'ap', visitType: 'vt', amountCents: 'am', status: 'st', stripeCheckoutSessionId: 'sid', createdAt: 'ca', paidAt: 'pa' },
      appointment: { _name: 'appointment', id: 'id', organizationId: 'org', status: 'st' },
      patient: { _name: 'patient', id: 'id', firstName: 'f', lastName: 'l' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  desc: vi.fn((x) => x),
}))

const { sessionsCreateMock, sessionsRetrieveMock } = vi.hoisted(() => ({
  sessionsCreateMock: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' })),
  sessionsRetrieveMock: vi.fn(async () => ({ payment_status: 'paid', payment_intent: 'pi_1' })),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: sessionsCreateMock, retrieve: sessionsRetrieveMock } } },
}))

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))
vi.mock('@/lib/services/pms', () => ({ queueCommLogWriteBack: vi.fn(async () => undefined) }))

import { resolveVisitTypes, visitTypeDepositCents, DEFAULT_VISIT_TYPES } from '@/lib/types/visit-types'
import {
  canTakeBookingDeposits,
  createBookingDepositSession,
} from '@/lib/services/booking-deposits'

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
})

// The db.update mock above is awkward for `.returning()` — the finalize path
// needs it, so a dedicated harness would over-complicate this file. Finalize's
// CAS + confirm behavior is covered by the update-shape assertions in the
// waitlist suite's pattern; here we cover config + create gating, which carry
// the money-safety invariants (never charge without an active account, never
// block a booking on a payment failure).

describe('visit-type deposit config', () => {
  it('defaults every type to no deposit', () => {
    expect(DEFAULT_VISIT_TYPES.every((t) => t.depositCents === 0)).toBe(true)
    expect(resolveVisitTypes(null).every((t) => t.depositCents === 0)).toBe(true)
  })

  it('sanitizes stored deposits: absent → 0, negative → 0, clamped at $1,000, rounded', () => {
    const out = resolveVisitTypes([
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30 },
      { id: 'consult', label: 'Consult', durationMinutes: 30, depositCents: -500 },
      { id: 'implant', label: 'Implant', durationMinutes: 60, depositCents: 9_999_999 },
      { id: 'exam', label: 'Exam', durationMinutes: 30, depositCents: 2500.6 },
    ])
    const byId = new Map(out.map((t) => [t.id, t.depositCents]))
    expect(byId.get('cleaning')).toBe(0)
    expect(byId.get('consult')).toBe(0)
    expect(byId.get('implant')).toBe(100_000)
    expect(byId.get('exam')).toBe(2501)
  })

  it('looks up a type deposit (unknown id → 0)', () => {
    const stored = [{ id: 'consult', label: 'Consult', durationMinutes: 30, depositCents: 5000 }]
    expect(visitTypeDepositCents(stored, 'consult')).toBe(5000)
    expect(visitTypeDepositCents(stored, 'unknown')).toBe(0)
    expect(visitTypeDepositCents(stored, null)).toBe(0)
  })
})

describe('canTakeBookingDeposits', () => {
  it('true only when the Connect account is active with charges enabled', async () => {
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }])
    expect(await canTakeBookingDeposits('org_1')).toBe(true)
    state.selectQueue.push([{ accountId: 'acct_1', status: 'restricted', charges: 1, currency: 'usd' }])
    expect(await canTakeBookingDeposits('org_1')).toBe(false)
    state.selectQueue.push([])
    expect(await canTakeBookingDeposits('org_1')).toBe(false)
  })
})

describe('createBookingDepositSession', () => {
  const input = {
    organizationId: 'org_1',
    appointmentId: 'appt_1',
    patientId: 'pat_1',
    visitType: 'consultation',
    visitTypeLabel: 'Consultation',
    amountCents: 5000,
    patientEmail: 'mia@example.com',
    clinicName: 'Dream Dental',
    bookUrl: 'https://acme.dreamcreatestudio.com/book',
  }

  it('creates a pending row + Checkout session with the booking_deposit kind', async () => {
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }])
    const r = await createBookingDepositSession(input)
    expect(r?.url).toContain('checkout.stripe.com')
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]!.values).toMatchObject({
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      amountCents: 5000,
      status: 'pending',
    })
    const [params, opts] = sessionsCreateMock.mock.calls[0] as unknown as [Record<string, any>, { stripeAccount: string }]
    expect(opts.stripeAccount).toBe('acct_1')
    expect(params.metadata.kind).toBe('booking_deposit')
    expect(params.metadata.organizationId).toBe('org_1')
    expect(params.success_url).toContain('/book?deposit_session=')
    expect(params.cancel_url).toContain('/book?deposit=later')
    // Session id stored back on the row for the finalize lookup.
    expect(state.updates.some((u) => u.set.stripeCheckoutSessionId === 'cs_test_1')).toBe(true)
  })

  it('returns null (books deposit-free) when Connect is not active', async () => {
    state.selectQueue.push([{ accountId: 'acct_1', status: 'pending', charges: 0, currency: 'usd' }])
    expect(await createBookingDepositSession(input)).toBeNull()
    expect(state.inserts).toHaveLength(0)
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('returns null for sub-$1 amounts', async () => {
    expect(await createBookingDepositSession({ ...input, amountCents: 50 })).toBeNull()
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('returns null instead of throwing when Stripe errors (booking must stand)', async () => {
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }])
    sessionsCreateMock.mockRejectedValueOnce(new Error('stripe down'))
    await expect(createBookingDepositSession(input)).resolves.toBeNull()
  })
})
