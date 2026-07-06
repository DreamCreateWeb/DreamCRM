import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Order/payment finalizers must tell the clinic money came in — an in-app
 * notification to owners/admins + a best-effort email to the clinic's contact
 * address — but ONLY on the race-winning claim, and never let a notify failure
 * break the finalize.
 *
 * We drive finalizeBalancePaymentFromSession (the simplest finalizer): a queued
 * sequence of db.select() results + an update().returning() whose row count we
 * control to simulate winning / losing the compare-and-swap.
 */

const state = {
  selectQueue: [] as unknown[][],
  returningRows: [] as unknown[], // what update().returning() yields (CAS result)
  paymentStatus: 'paid' as string,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy']) obj[m] = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async () => {} }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => state.returningRows,
          }),
        }),
      }),
    },
    schema: new Proxy({}, { get: () => ({}) }),
  }
})

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: async () => ({ payment_status: state.paymentStatus, payment_intent: 'pi_1' }),
      },
    },
  },
}))

const { notifySpy, emailSpy } = vi.hoisted(() => ({
  notifySpy: vi.fn(async (..._args: unknown[]) => {}),
  emailSpy: vi.fn(async (..._args: unknown[]) => {}),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifySpy }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: emailSpy }))

import { finalizeBalancePaymentFromSession } from '@/lib/services/balance-payments'

const PENDING_PAYMENT = { id: 'bp_1', patientId: 'pat_1', amountCents: 12000, status: 'pending' }
const ACTIVE_CONFIG = { accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd' }
const PATIENT = { firstName: 'Mia', lastName: 'Hayes', email: 'mia@example.com' }
const CLINIC = { email: 'frontdesk@acme.example' }

beforeEach(() => {
  state.selectQueue.length = 0
  state.returningRows = []
  state.paymentStatus = 'paid'
  notifySpy.mockClear()
  emailSpy.mockClear()
})

describe('finalizeBalancePaymentFromSession notifications', () => {
  it('notifies owners/admins + emails the clinic when it wins the CAS claim', async () => {
    // select order: payment row → connectedAccount → (after CAS) patient → clinic profile
    state.selectQueue.push([PENDING_PAYMENT], [ACTIVE_CONFIG], [PATIENT], [CLINIC])
    state.returningRows = [{ id: 'bp_1' }] // we won the claim

    await finalizeBalancePaymentFromSession('org_1', 'cs_1')

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const [, payload, opts] = notifySpy.mock.calls[0]
    expect((payload as { title: string }).title).toContain('$120.00')
    expect(opts).toEqual({ roles: ['owner', 'admin'], excludeEmail: 'mia@example.com' })
    expect(emailSpy).toHaveBeenCalledTimes(1)
    expect((emailSpy.mock.calls[0][0] as { to: string }).to).toBe('frontdesk@acme.example')
  })

  it('does NOT notify when another finalize already won the claim', async () => {
    state.selectQueue.push([PENDING_PAYMENT], [ACTIVE_CONFIG])
    state.returningRows = [] // lost the claim (0 rows updated)

    await finalizeBalancePaymentFromSession('org_1', 'cs_1')

    expect(notifySpy).not.toHaveBeenCalled()
    expect(emailSpy).not.toHaveBeenCalled()
  })

  it('returns early (no notify) when the payment is already paid', async () => {
    state.selectQueue.push([{ ...PENDING_PAYMENT, status: 'paid' }])
    await finalizeBalancePaymentFromSession('org_1', 'cs_1')
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('a notify failure never throws out of finalize (best-effort)', async () => {
    state.selectQueue.push([PENDING_PAYMENT], [ACTIVE_CONFIG], [PATIENT], [CLINIC])
    state.returningRows = [{ id: 'bp_1' }]
    notifySpy.mockRejectedValueOnce(new Error('notify boom'))
    await expect(finalizeBalancePaymentFromSession('org_1', 'cs_1')).resolves.toBeUndefined()
  })
})
