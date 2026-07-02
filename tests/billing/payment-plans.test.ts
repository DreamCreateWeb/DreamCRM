import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Payment plans — installment math, propose guards, the off-session charge
 * loop (success → payment row + advance; decline → past_due + 3-day retry;
 * park after 3 strikes), and the demo/missing-card skips.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updateReturning: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
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
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const name = (table as { _n: string })._n
          for (const v of Array.isArray(values) ? values : [values]) {
            state.inserts.push({ table: name, values: v })
          }
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
            const p: any = Promise.resolve(undefined)
            p.returning = async () => state.updateReturning.shift() ?? [{ id: 'row' }]
            return p
          },
        }),
      }),
    },
    schema: {
      patient: {
        _n: 'patient', id: 'id', organizationId: 'org', firstName: 'fn', lastName: 'ln',
        email: 'email', isActive: 'active', pmsBalanceCents: 'bal',
      },
      paymentPlan: { _n: 'payment_plan', id: 'id', organizationId: 'org', patientId: 'pid', token: 'token', status: 'status', nextChargeAt: 'next' },
      patientBalancePayment: { _n: 'patient_balance_payment', id: 'id' },
      shopConfig: { _n: 'shop_config', organizationId: 'org', stripeAccountId: 'acct', stripeAccountStatus: 'status', chargesEnabled: 'charges', currency: 'currency' },
      organization: { _n: 'organization', id: 'id', isDemo: 'isDemo' },
      clinicProfile: { _n: 'clinic_profile', organizationId: 'org', email: 'email' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
}))

const { paymentIntentCreateMock, customersCreateMock, sessionsCreateMock, sessionsRetrieveMock } =
  vi.hoisted(() => ({
    paymentIntentCreateMock: vi.fn(async () => ({ id: 'pi_1' })),
    customersCreateMock: vi.fn(async () => ({ id: 'cus_1' })),
    sessionsCreateMock: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe.test/setup' })),
    sessionsRetrieveMock: vi.fn(async () => ({
      setup_intent: { status: 'succeeded', payment_method: 'pm_1' },
    })),
  }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: paymentIntentCreateMock },
    customers: { create: customersCreateMock },
    checkout: { sessions: { create: sessionsCreateMock, retrieve: sessionsRetrieveMock } },
  },
}))

const { deliverMock, canPayMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(async () => {}),
  canPayMock: vi.fn(async () => true),
}))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  sendNotificationEmail: vi.fn(async () => {}),
  authEmailShell: vi.fn(() => '<html>plan</html>'),
}))
vi.mock('@/lib/services/balance-payments', () => ({ canTakeBalancePayments: canPayMock }))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental', from: 'Acme <a@x.com>', replyTo: null, gmail: null, timeZone: 'America/Chicago',
  })),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => {}) }))

import {
  planInstallmentCents,
  planAmountForInstallment,
  proposePaymentPlan,
  runDuePlanCharges,
  cancelPaymentPlan,
} from '@/lib/services/payment-plans'

const NOW = new Date('2026-07-02T15:00:00Z')

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.updateReturning = []
  vi.clearAllMocks()
  canPayMock.mockResolvedValue(true)
})

describe('installment math', () => {
  it('splits evenly with the remainder on the LAST installment', () => {
    // $500 over 6 → 5 × $83.33 + final $83.35; sum is exact.
    expect(planInstallmentCents(50_000, 6)).toBe(8_333)
    expect(planAmountForInstallment(50_000, 6, 0)).toBe(8_333)
    expect(planAmountForInstallment(50_000, 6, 5)).toBe(50_000 - 8_333 * 5)
    const sum = Array.from({ length: 6 }, (_, i) => planAmountForInstallment(50_000, 6, i)).reduce((a, b) => a + b)
    expect(sum).toBe(50_000)
  })
})

describe('proposePaymentPlan', () => {
  const PATIENT = { firstName: 'Marcus', email: 'm@x.com', balance: 60_000, isActive: 1 }

  it('creates the plan and emails the acceptance link', async () => {
    state.selectQueue.push([PATIENT]) // patient
    state.selectQueue.push([]) // no open plan
    const r = await proposePaymentPlan('org_1', 'pat_1', { totalCents: 60_000, installments: 6 }, 'user_1')
    expect(r).toMatchObject({ ok: true })
    const plan = state.inserts.find((i) => i.table === 'payment_plan')
    expect(plan!.values).toMatchObject({
      totalCents: 60_000,
      installments: 6,
      installmentCents: 10_000,
      status: 'proposed',
      proposedByUserId: 'user_1',
    })
    expect(String(plan!.values.token)).toMatch(/^pl_/)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a second open plan for the same patient', async () => {
    state.selectQueue.push([PATIENT])
    state.selectQueue.push([{ id: 'ppl_existing' }]) // open plan
    const r = await proposePaymentPlan('org_1', 'pat_1', { totalCents: 60_000, installments: 6 }, 'user_1')
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('already has an open') })
    expect(state.inserts).toHaveLength(0)
  })

  it('guards the floors: total, months range, per-installment minimum', async () => {
    expect(await proposePaymentPlan('org_1', 'p', { totalCents: 5_000, installments: 3 }, 'u')).toMatchObject({ ok: false })
    expect(await proposePaymentPlan('org_1', 'p', { totalCents: 60_000, installments: 13 }, 'u')).toMatchObject({ ok: false })
    // $120 over 12 → $10/month, below the $25 floor.
    expect(await proposePaymentPlan('org_1', 'p', { totalCents: 12_000, installments: 12 }, 'u')).toMatchObject({
      ok: false,
      error: expect.stringContaining('at least'),
    })
    expect(state.selectQueue).toHaveLength(0) // all rejected before any query
  })

  it('cannot exceed the live balance', async () => {
    state.selectQueue.push([{ ...PATIENT, balance: 30_000 }])
    const r = await proposePaymentPlan('org_1', 'pat_1', { totalCents: 60_000, installments: 6 }, 'user_1')
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('balance') })
  })
})

describe('runDuePlanCharges', () => {
  const DUE_PLAN = {
    id: 'ppl_1', organizationId: 'org_1', patientId: 'pat_1', token: 'pl_x',
    totalCents: 60_000, installmentCents: 10_000, installments: 6, installmentsPaid: 2,
    status: 'active', stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1',
    nextChargeAt: new Date('2026-07-01T00:00:00Z'), failedAttempts: 0, lastError: null,
  }

  it('charges a due installment: payment row + counter + next month', async () => {
    state.selectQueue.push([DUE_PLAN]) // due plans
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }]) // shop config
    state.selectQueue.push([]) // notify: clinic email lookup

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ scanned: 1, charged: 1, failed: 0 })
    expect(paymentIntentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000, off_session: true, confirm: true, customer: 'cus_1' }),
      { stripeAccount: 'acct_1' },
    )
    const payment = state.inserts.find((i) => i.table === 'patient_balance_payment')
    expect(payment!.values).toMatchObject({
      amountCents: 10_000,
      status: 'paid',
      note: 'Payment plan installment 3 of 6',
    })
    const update = state.updates.find((u) => u.table === 'payment_plan')
    expect(update!.values).toMatchObject({ installmentsPaid: 3, status: 'active', failedAttempts: 0 })
  })

  it('a decline goes past_due with a 3-day retry (parked after 3 strikes)', async () => {
    state.selectQueue.push([{ ...DUE_PLAN, failedAttempts: 2 }])
    state.selectQueue.push([{ isDemo: false }])
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }])
    state.selectQueue.push([]) // notify lookup
    paymentIntentCreateMock.mockRejectedValueOnce(new Error('card_declined'))

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ charged: 0, failed: 1 })
    const update = state.updates.find((u) => u.table === 'payment_plan')
    expect(update!.values).toMatchObject({ status: 'past_due', failedAttempts: 3, nextChargeAt: null }) // parked
    expect(state.inserts.find((i) => i.table === 'patient_balance_payment')).toBeUndefined()
  })

  it('never touches demo plans or plans without a saved card', async () => {
    state.selectQueue.push([
      { ...DUE_PLAN, id: 'ppl_demo_marcus', organizationId: 'org_demo', stripeCustomerId: null, stripePaymentMethodId: null },
      { ...DUE_PLAN, id: 'ppl_2', organizationId: 'org_demo' },
    ])
    state.selectQueue.push([{ isDemo: true }]) // org_demo lookup (cached for both)

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ scanned: 2, charged: 0, failed: 0 })
    expect(paymentIntentCreateMock).not.toHaveBeenCalled()
  })
})

describe('cancelPaymentPlan', () => {
  it('cancels an open plan', async () => {
    state.updateReturning.push([{ id: 'ppl_1' }])
    expect(await cancelPaymentPlan('org_1', 'ppl_1')).toEqual({ ok: true })
    expect(state.updates[0].values).toMatchObject({ status: 'canceled', nextChargeAt: null })
  })

  it('refuses when nothing matched (already completed/canceled)', async () => {
    state.updateReturning.push([])
    expect(await cancelPaymentPlan('org_1', 'ppl_done')).toMatchObject({ ok: false })
  })
})
