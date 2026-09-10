import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLockingDb, schemaProxy, type LockingDb, type StoredRow } from '../helpers/locking-db'

/**
 * A patient gets ONE open payment plan, even under a race.
 *
 * `proposePaymentPlan` enforces "one open plan per patient" by SELECTing for an
 * open plan and then INSERTing — two separate statements. Two proposals fired
 * close together (a double-clicked "Propose", two staff on the same patient,
 * or the portal's patient-started path landing beside a staff one) both read
 * "no open plan" and both insert.
 *
 * That is a money bug, not just a bookkeeping one: every plan carries its own
 * `/i/[token]` acceptance link, and accepting charges the first installment
 * immediately. A patient sent two proposals for the same balance can accept
 * both and be charged for the balance twice over.
 *
 * The fix wraps the check and the insert in one transaction behind a
 * per-patient `pg_advisory_xact_lock` — the same idiom `insertAppointmentIfBookable`
 * uses against slot double-booking. The db fake here models transaction
 * isolation and real advisory locking (tests/helpers/locking-db.ts) so the two
 * requests genuinely interleave.
 */

const OPEN_STATUSES = ['proposed', 'active', 'past_due']

let fake: LockingDb

vi.mock('@/lib/db', () => ({
  get db() {
    return fake.db
  },
  schema: schemaProxy(),
}))

// Everything after the claim is delivery, not the race under test.
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/services/balance-payments', () => ({ canTakeBalancePayments: vi.fn(async () => true) }))
const deliver = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/email', () => ({
  deliver: (...args: unknown[]) => deliver(...(args as [])),
  authEmailShell: () => '<html></html>',
  sendNotificationEmail: vi.fn(),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme <acme@example.test>',
    replyTo: 'acme@example.test',
    gmail: null,
    name: 'Acme Dental',
    timeZone: 'America/New_York',
  })),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn() }))

import { proposePaymentPlan } from '@/lib/services/payment-plans'

function resolve(table: string, rows: StoredRow[]): unknown[] {
  if (table === 'patient') {
    return [{ firstName: 'Dana', email: 'dana@example.test', balance: 240_000, isActive: 1 }]
  }
  if (table === 'payment_plan') {
    return rows.filter((r) => OPEN_STATUSES.includes(String(r.status)))
  }
  return []
}

const propose = () =>
  proposePaymentPlan('org_1', 'pat_1', { totalCents: 120_000, installments: 6 }, 'usr_staff')

beforeEach(() => {
  fake = createLockingDb({ resolve })
  deliver.mockClear()
})

describe('proposePaymentPlan — concurrency', () => {
  it('two simultaneous proposals create exactly one plan', async () => {
    const [a, b] = await Promise.all([propose(), propose()])

    expect([a, b].filter((r) => r.ok)).toHaveLength(1)
    expect(fake.rows('payment_plan')).toHaveLength(1)

    const loser = [a, b].find((r) => !r.ok)!
    expect('error' in loser && loser.error).toMatch(/already has an open payment plan/)
  })

  it('sends only one acceptance email, so only one link can be accepted', async () => {
    await Promise.all([propose(), propose(), propose()])
    expect(fake.rows('payment_plan')).toHaveLength(1)
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('takes a per-patient lock', async () => {
    await propose()
    expect(fake.locksTaken).toContain('payment-plan:org_1:pat_1')
  })

  it('does not block a different patient in the same org', async () => {
    await Promise.all([
      propose(),
      proposePaymentPlan('org_1', 'pat_2', { totalCents: 120_000, installments: 6 }, 'usr_staff'),
    ])
    expect(fake.rows('payment_plan')).toHaveLength(2)
    expect(fake.locksTaken).toEqual(
      expect.arrayContaining(['payment-plan:org_1:pat_1', 'payment-plan:org_1:pat_2']),
    )
  })
})

describe('proposePaymentPlan — behaviour is otherwise unchanged', () => {
  it('creates the plan with the right money split and a proposed status', async () => {
    const res = await propose()
    expect(res.ok).toBe(true)

    const [plan] = fake.rows('payment_plan')
    expect(plan).toMatchObject({
      organizationId: 'org_1',
      patientId: 'pat_1',
      totalCents: 120_000,
      installments: 6,
      installmentCents: 20_000,
      status: 'proposed',
      proposedByUserId: 'usr_staff',
    })
    expect(String(plan.token)).toMatch(/^pl_/)
  })

  it('turns a second proposal away once the first plan exists', async () => {
    await propose()
    const second = await propose()
    expect(second.ok).toBe(false)
    expect(fake.rows('payment_plan')).toHaveLength(1)
  })

  it('allows a new plan once the previous one is closed', async () => {
    await propose()
    fake.store.set(
      'payment_plan',
      fake.rows('payment_plan').map((r) => ({ ...r, status: 'canceled' })),
    )
    const again = await propose()
    expect(again.ok).toBe(true)
    expect(fake.rows('payment_plan')).toHaveLength(2)
  })

  it('rejects an invalid plan before taking any lock', async () => {
    const res = await proposePaymentPlan('org_1', 'pat_1', { totalCents: 500, installments: 6 }, 'usr_staff')
    expect(res.ok).toBe(false)
    expect(fake.locksTaken).toEqual([])
    expect(fake.rows('payment_plan')).toHaveLength(0)
  })

  it('still returns ok when the proposal email fails (the plan is real)', async () => {
    deliver.mockRejectedValueOnce(new Error('provider down'))
    const res = await propose()
    expect(res.ok).toBe(true)
    expect(fake.rows('payment_plan')).toHaveLength(1)
  })
})
