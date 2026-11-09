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
  /** The clinic's email_automations jsonb (null = every email on, default copy). */
  automations: null as unknown,
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
  const db: any = {
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
  }
  // proposePaymentPlan claims "one open plan per patient" inside ONE
  // transaction behind a per-patient advisory lock, so the open-plan check and
  // the insert can no longer interleave. The handle mirrors `db`; `execute` is
  // the lock statement, which is a no-op with a single caller.
  db.transaction = (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ execute: async () => [], select: db.select, insert: db.insert, update: db.update })
  return {
    db,
    schema: {
      patient: {
        _n: 'patient', id: 'id', organizationId: 'org', firstName: 'fn', lastName: 'ln',
        email: 'email', isActive: 'active', pmsBalanceCents: 'bal',
      },
      paymentPlan: {
        _n: 'payment_plan', id: 'id', organizationId: 'org', patientId: 'pid', token: 'token', status: 'status',
        nextChargeAt: 'next', installmentsPaid: 'paid', cardUpdateSentAt: 'card_update_sent_at',
      },
      patientBalancePayment: { _n: 'patient_balance_payment', id: 'id' },
      shopConfig: { _n: 'shop_config', organizationId: 'org', stripeAccountId: 'acct', stripeAccountStatus: 'status', chargesEnabled: 'charges', currency: 'currency' },
      organization: { _n: 'organization', id: 'id', isDemo: 'isDemo' },
      clinicProfile: { _n: 'clinic_profile', organizationId: 'org', email: 'email', phone: 'phone' },
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
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
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
  patientEmailShell: vi.fn((o: { title?: string; body?: string; cta?: { url: string; label: string }; footnoteHtml?: string }) => `<html>${o?.title ?? ''}${o?.body ?? ''}${o?.cta ? `<a href="${o.cta.url}">${o.cta.label}</a>` : ''}${o?.footnoteHtml ?? ''}</html>`),
  deliver: deliverMock,
  sendNotificationEmail: vi.fn(async () => {}),
  // Captures its options so a test can read the rendered intro/button.
  authEmailShell: vi.fn((o: { introHtml?: string }) => `<html>${o?.introHtml ?? 'plan'}</html>`),
}))
vi.mock('@/lib/services/balance-payments', () => ({ canTakeBalancePayments: canPayMock }))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental', from: 'Acme <a@x.com>', replyTo: null, gmail: null, timeZone: 'America/Chicago',
  })),
}))
// The patient's decline email renders through the real registry + resolver
// over the clinic's (mocked) stored config — so "off in the hub" is the
// genuine `enabled:false` path, not a stub.
vi.mock('@/lib/services/email-automations', async () => {
  const types = await import('@/lib/types/email-automations')
  const actual = await vi.importActual<typeof import('@/lib/services/email-automations')>('@/lib/services/email-automations')
  return {
    ...actual,
    renderAutomatedEmail: async (
      _org: string,
      key: import('@/lib/types/email-automations').EmailAutomationKey,
      fields: Record<string, string | null | undefined>,
    ) => actual.renderFromResolved(key, types.resolveEmailAutomations(state.automations)[key], fields),
  }
})
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => {}) }))
const { recordActionMock } = vi.hoisted(() => ({
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
}))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: recordActionMock }))

import {
  planInstallmentCents,
  planAmountForInstallment,
  proposePaymentPlan,
  runDuePlanCharges,
  cancelPaymentPlan,
  createPlanSetupCheckout,
  finalizePlanSetup,
} from '@/lib/services/payment-plans'
import { notifyOrgMembers } from '@/lib/services/notifications'
import { patientEmailShell } from '@/lib/email'

const NOW = new Date('2026-07-02T15:00:00Z')

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.updateReturning = []
  vi.clearAllMocks()
  canPayMock.mockResolvedValue(true)
  state.automations = null
  vi.useRealTimers()
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
    nextChargeAt: new Date('2026-07-01T00:00:00Z'), failedAttempts: 0, lastError: null, cardUpdateSentAt: null,
  }

  it('charges a due installment: payment row + counter + next month', async () => {
    state.selectQueue.push([DUE_PLAN]) // due plans
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd', platformFeeBps: 100 }]) // shop config
    state.selectQueue.push([]) // receipt: patient email lookup
    state.selectQueue.push([]) // receipt: clinic email lookup
    state.selectQueue.push([{ firstName: 'Marcus' }]) // ledger: patient name

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ scanned: 1, charged: 1, failed: 0 })
    // The machine charged a card on its own — ALWAYS reported in the ledger.
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('payment_autocharge')
    expect(entry.patientId).toBe('pat_1')
    expect(String(entry.summary)).toMatch(/Charged Marcus.s card \$100\.00 — installment 3 of 6/)
    expect(paymentIntentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10_000,
        off_session: true,
        confirm: true,
        customer: 'cus_1',
        // 1% platform fee rides every installment.
        application_fee_amount: 100,
      }),
      // Deterministic per (plan, installment) — a retry/race reuses the charge.
      { stripeAccount: 'acct_1', idempotencyKey: 'ppl_ppl_1_2_pm_1' },
    )
    const payment = state.inserts.find((i) => i.table === 'patient_balance_payment')
    expect(payment!.values).toMatchObject({
      amountCents: 10_000,
      status: 'paid',
      note: 'Payment plan installment 3 of 6',
    })
    const update = state.updates.find((u) => u.table === 'payment_plan')
    // A success ends any decline streak: strikes AND the card-update stamp clear.
    expect(update!.values).toMatchObject({ installmentsPaid: 3, status: 'active', failedAttempts: 0, cardUpdateSentAt: null })
  })

  it('records no second payment row when the counter CAS loses (duplicate/racing charge)', async () => {
    state.selectQueue.push([DUE_PLAN]) // due plans
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd', platformFeeBps: 100 }]) // shop config
    // The CAS advance loses — another writer already recorded this installment.
    state.updateReturning.push([])

    const r = await runDuePlanCharges({ now: NOW })
    // The charge still fired once, but with the SAME idempotency key it is the
    // same PaymentIntent — Stripe does not double-charge.
    expect(paymentIntentCreateMock).toHaveBeenCalledTimes(1)
    expect(paymentIntentCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      { stripeAccount: 'acct_1', idempotencyKey: 'ppl_ppl_1_2_pm_1' },
    )
    // …and losing the CAS, it writes NO second balance-payment row.
    expect(state.inserts.find((i) => i.table === 'patient_balance_payment')).toBeUndefined()
    expect(r).toMatchObject({ scanned: 1 })
  })

  it('the FINAL installment ledgers the actual remainder amount, not the even split (round-5 close-out)', async () => {
    // $500 over 3 → $166.66 + $166.66 + $166.68 (the last takes the remainder).
    state.selectQueue.push([{
      ...DUE_PLAN,
      totalCents: 50_000, installments: 3, installmentCents: 16_666, installmentsPaid: 2,
    }])
    state.selectQueue.push([{ isDemo: false }])
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd', platformFeeBps: 100 }])
    state.selectQueue.push([]) // receipt: patient email lookup
    state.selectQueue.push([]) // receipt: clinic email lookup
    state.selectQueue.push([{ firstName: 'Marcus' }]) // ledger: patient name

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ charged: 1, completed: 1 })
    // Stripe charged the remainder…
    expect(paymentIntentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 16_668 }),
      // Deterministic per (plan, installment) — a retry/race reuses the charge.
      { stripeAccount: 'acct_1', idempotencyKey: 'ppl_ppl_1_2_pm_1' },
    )
    // …and the ledger reports THAT amount (the money statement must match the
    // charge), never the even-split installmentCents.
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(String(entry.summary)).toMatch(/\$166\.68 — installment 3 of 3 \(plan complete\)/)
    expect((entry.detail as Record<string, unknown>).installmentCents).toBe(16_668)
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
    // A DECLINED charge must never narrate "Charged X's card" — the ledger is
    // a money statement (round-2 audit pin for the `if (ok)` gate).
    expect(recordActionMock).not.toHaveBeenCalled()
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
    // No charge happened → no ledger claim that one did.
    expect(recordActionMock).not.toHaveBeenCalled()
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

// ── ML-15: the patient hears on the first decline; "Update my card" works ──

const STREAK_PLAN = {
  id: 'ppl_1', organizationId: 'org_1', patientId: 'pat_1', token: 'pl_x',
  totalCents: 60_000, installmentCents: 10_000, installments: 6, installmentsPaid: 2,
  status: 'active', stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1', stripeSetupSessionId: 'cs_old',
  nextChargeAt: new Date('2026-07-01T00:00:00Z'), failedAttempts: 0, lastError: null, cardUpdateSentAt: null,
}
const CFG = { accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd', platformFeeBps: 100 }

/** The decline cron pass: due → org → cfg → (charge throws) → the patient
 *  read + clinic phone for the email → the staff notify's two lookups. */
function queueDecline(plan: Record<string, unknown>, patient: unknown[] = [{ firstName: 'Marcus', email: 'marcus@x.com' }]) {
  state.selectQueue.push([plan])
  state.selectQueue.push([{ isDemo: false }])
  state.selectQueue.push([CFG])
  state.selectQueue.push(patient) // notifyPatientCardUpdate: the patient
  state.selectQueue.push([{ phone: '(555) 000-1111' }]) // notifyPatientCardUpdate: clinic phone
  state.selectQueue.push([]) // notifyPlanEvent: patient email (exclude)
  state.selectQueue.push([{ email: 'desk@acme.com' }]) // notifyPlanEvent: clinic inbox
  paymentIntentCreateMock.mockRejectedValueOnce(new Error('card_declined'))
}
const staffBody = () => String((vi.mocked(notifyOrgMembers).mock.calls.at(-1)![1] as { body: string }).body)
const shellOpts = () => vi.mocked(patientEmailShell).mock.calls.at(-1)![0] as unknown as { title: string; body: string; cta?: { url: string; label: string }; footnoteHtml?: string }
const stampUpdates = () => state.updates.filter((u) => u.table === 'payment_plan' && 'cardUpdateSentAt' in u.values && u.values.cardUpdateSentAt instanceof Date)

describe('a decline tells the patient — once per streak', () => {
  it('the FIRST decline emails "Update my card" with the retry day in the clinic tz, stamps the plan, and tells staff', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    queueDecline(STREAK_PLAN)

    const r = await runDuePlanCharges({ now: NOW })
    expect(r).toMatchObject({ failed: 1 })

    // past_due + the 3-day retry (attempt 1 of 3).
    const first = state.updates.find((u) => u.table === 'payment_plan')!
    expect(first.values).toMatchObject({ status: 'past_due', failedAttempts: 1 })
    expect(first.values.nextChargeAt).toEqual(new Date('2026-07-05T15:00:00Z'))

    // ONE patient email, from the clinic, to the plan's own page.
    expect(deliverMock).toHaveBeenCalledTimes(1)
    const sent = (deliverMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0]
    expect(sent.to).toBe('marcus@x.com')
    expect(sent.from).toBe('Acme <a@x.com>')
    expect(sent.subject).toBe('Your $100.00 payment to Acme Dental didn’t go through')
    const opts = shellOpts()
    expect(opts.cta?.label).toBe('Update my card')
    expect(opts.cta?.url).toMatch(/\/i\/pl_x$/)
    expect(opts.body).toMatch(/^Hi Marcus — the \$100\.00 payment on your plan with Acme Dental didn’t go through\./)
    // 2026-07-05T15:00Z is Jul 5 in Chicago — the clinic's wall-clock, never the server's.
    expect(opts.body).toMatch(/We’ll try again on <strong>Jul 5, 2026<\/strong>/)
    expect(opts.body).not.toMatch(/paused/)

    // The stamp — set only after the send, org-scoped (tests/tenant-scoping pins the clause).
    expect(stampUpdates()).toHaveLength(1)

    // Staff keep their title and learn the patient was told.
    const staff = vi.mocked(notifyOrgMembers).mock.calls.at(-1)![1] as { title: string; body: string }
    expect(staff.title).toBe('Payment plan charge failed (attempt 1 of 3)')
    expect(staff.body).toBe('We’ll retry automatically in 3 days. We emailed Marcus a link to update their card.')
  })

  it('a LATER strike in the same streak sends nothing and says nothing about an email', async () => {
    queueDecline({ ...STREAK_PLAN, failedAttempts: 1, cardUpdateSentAt: new Date('2026-06-29T15:00:00Z') })

    await runDuePlanCharges({ now: NOW })
    expect(deliverMock).not.toHaveBeenCalled()
    expect(stampUpdates()).toHaveLength(0)
    expect(staffBody()).toBe('We’ll retry automatically in 3 days.')
  })

  it('a parked first decline (no stamp yet) says the plan is paused — never "we’ll try again"', async () => {
    queueDecline({ ...STREAK_PLAN, failedAttempts: 2 })

    await runDuePlanCharges({ now: NOW })
    const first = state.updates.find((u) => u.table === 'payment_plan')!
    expect(first.values).toMatchObject({ status: 'past_due', failedAttempts: 3, nextChargeAt: null })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    expect(shellOpts().body).toMatch(/We’ve paused the plan for now/)
    expect(shellOpts().body).not.toMatch(/try again/)
    expect(staffBody()).toBe('We’ve stopped retrying — reach out to the patient for a new card. We emailed Marcus a link to update their card.')
  })

  it('off in the Emails hub → no email, no stamp, no claim to staff', async () => {
    state.automations = { payment_plan_card_update: { enabled: false } }
    queueDecline(STREAK_PLAN)

    await runDuePlanCharges({ now: NOW })
    expect(deliverMock).not.toHaveBeenCalled()
    expect(stampUpdates()).toHaveLength(0)
    expect(staffBody()).toBe('We’ll retry automatically in 3 days.')
  })

  it('every person-typed value is escaped in the HTML', async () => {
    queueDecline(STREAK_PLAN, [{ firstName: 'Mar<b>cus', email: 'marcus@x.com' }])

    await runDuePlanCharges({ now: NOW })
    expect(shellOpts().body).toContain('Hi Mar&lt;b&gt;cus')
    expect(shellOpts().body).not.toContain('<b>')
  })

  it('a patient with no email is simply not told (staff still hear, without the claim)', async () => {
    queueDecline(STREAK_PLAN, [{ firstName: 'Marcus', email: null }])

    await runDuePlanCharges({ now: NOW })
    expect(deliverMock).not.toHaveBeenCalled()
    expect(stampUpdates()).toHaveLength(0)
    expect(staffBody()).toBe('We’ll retry automatically in 3 days.')
  })
})

describe('"Update my card" — createPlanSetupCheckout for a past_due plan', () => {
  it('opens the same setup-mode Checkout on the saved customer and stores the new session', async () => {
    state.selectQueue.push([{ ...STREAK_PLAN, status: 'past_due', failedAttempts: 1 }]) // by token
    state.selectQueue.push([CFG])
    state.selectQueue.push([{ firstName: 'Marcus', lastName: 'Lee', email: 'marcus@x.com' }])

    const r = await createPlanSetupCheckout('pl_x')
    expect(r).toEqual({ ok: true, url: 'https://stripe.test/setup' })
    expect(customersCreateMock).not.toHaveBeenCalled()
    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'setup', customer: 'cus_1' }),
      { stripeAccount: 'acct_1' },
    )
    const update = state.updates.find((u) => u.table === 'payment_plan')!
    expect(update.values).toMatchObject({ stripeCustomerId: 'cus_1', stripeSetupSessionId: 'cs_1' })
  })

  it('still refuses a plan that is active, completed or canceled', async () => {
    for (const status of ['active', 'completed', 'canceled']) {
      state.selectQueue.push([{ ...STREAK_PLAN, status }])
      expect(await createPlanSetupCheckout('pl_x')).toEqual({ ok: false, error: 'This plan has already been set up.' })
    }
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })
})

describe('"Update my card" — finalizePlanSetup for a past_due plan', () => {
  const PAST_DUE = { ...STREAK_PLAN, status: 'past_due', failedAttempts: 2, lastError: 'card_declined', stripeSetupSessionId: 'cs_new', cardUpdateSentAt: new Date('2026-06-29T15:00:00Z') }

  it('swaps the card, clears the strikes + the stamp, charges the overdue installment NOW under a new idempotency key', async () => {
    state.selectQueue.push([PAST_DUE]) // by token
    state.selectQueue.push([CFG])
    state.selectQueue.push([{ ...PAST_DUE, status: 'active', stripePaymentMethodId: 'pm_new', failedAttempts: 0, cardUpdateSentAt: null }]) // fresh
    state.selectQueue.push([]) // receipt: patient email lookup
    state.selectQueue.push([]) // receipt: clinic email lookup
    sessionsRetrieveMock.mockResolvedValueOnce({ setup_intent: { status: 'succeeded', payment_method: 'pm_new' } })

    const r = await finalizePlanSetup('pl_x', 'cs_new')
    expect(r).toEqual({ ok: true, firstChargeOk: true, resumed: true })

    const cas = state.updates.find((u) => u.table === 'payment_plan')!
    expect(cas.values).toMatchObject({
      status: 'active', stripePaymentMethodId: 'pm_new', failedAttempts: 0, lastError: null, cardUpdateSentAt: null,
    })
    expect(cas.values.nextChargeAt).toBeInstanceOf(Date)

    // The overdue installment (index 2) charges on the NEW card right away —
    // and under a key the old decline cannot be replayed through.
    expect(paymentIntentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000, payment_method: 'pm_new', off_session: true, confirm: true }),
      { stripeAccount: 'acct_1', idempotencyKey: 'ppl_ppl_1_2_pm_new' },
    )
    expect(state.inserts.find((i) => i.table === 'patient_balance_payment')!.values).toMatchObject({ amountCents: 10_000, status: 'paid' })
  })

  it('refuses a session that is not the one just started (a reload of the ORIGINAL acceptance URL)', async () => {
    state.selectQueue.push([PAST_DUE])
    const r = await finalizePlanSetup('pl_x', 'cs_old')
    expect(r.ok).toBe(false)
    expect(sessionsRetrieveMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
    expect(paymentIntentCreateMock).not.toHaveBeenCalled()
  })

  it('a card that was not saved changes nothing', async () => {
    state.selectQueue.push([PAST_DUE])
    state.selectQueue.push([CFG])
    sessionsRetrieveMock.mockResolvedValueOnce({ setup_intent: { status: 'requires_payment_method', payment_method: null } } as never)
    const r = await finalizePlanSetup('pl_x', 'cs_new')
    expect(r).toEqual({ ok: false, error: 'The card wasn’t saved — please try again.' })
    expect(state.updates).toHaveLength(0)
  })

  it('the proposed acceptance path is untouched: any session id finalizes, status flips with acceptedAt', async () => {
    state.selectQueue.push([{ ...STREAK_PLAN, status: 'proposed', stripePaymentMethodId: null, installmentsPaid: 0, stripeSetupSessionId: 'cs_1' }])
    state.selectQueue.push([CFG])
    state.selectQueue.push([{ ...STREAK_PLAN, status: 'active', installmentsPaid: 0 }]) // fresh
    state.selectQueue.push([]) // receipt lookups
    state.selectQueue.push([])

    const r = await finalizePlanSetup('pl_x', 'cs_anything')
    expect(r).toEqual({ ok: true, firstChargeOk: true })
    const cas = state.updates.find((u) => u.table === 'payment_plan')!
    expect(cas.values).toMatchObject({ status: 'active', stripePaymentMethodId: 'pm_1' })
    expect(cas.values.acceptedAt).toBeInstanceOf(Date)
    expect(cas.values).not.toHaveProperty('failedAttempts')
  })
})
