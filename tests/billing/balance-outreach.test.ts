import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Email-to-pay + the automated balance cadence:
 *  - settings resolver: opt-in default OFF, clamps
 *  - sendPayLinkEmail: guards (no balance / no email / Connect inactive /
 *    recently sent), request row + email on success
 *  - runBalanceReminderCadence: disabled + demo skips, cadence + cap
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = async () => state.selectQueue.shift() ?? []
    obj.limit = async () => state.selectQueue.shift() ?? []
    // The cadence's patient query ends at .limit(); the profiles query has no
    // terminal — make bare .where awaitable too.
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push(values)
        },
      }),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(set)
          },
        }),
      }),
    },
    schema: {
      patient: { id: 'id', organizationId: 'org', firstName: 'f', lastName: 'l', email: 'e', pmsBalanceCents: 'bal', pmsBalanceUpdatedAt: 'balAt', isActive: 'a' },
      clinicProfile: { organizationId: 'org', balanceOutreach: 'bo', displayName: 'dn', brandColor: 'bc', logoUrl: 'lu', phone: 'ph' },
      organization: { id: 'id', slug: 's', name: 'n', isDemo: 'd' },
      balancePaymentRequest: { id: 'id', organizationId: 'org', patientId: 'pid', token: 't', status: 'st', source: 'src', sentAt: 'sa' },
      patientBalancePayment: { id: 'id', organizationId: 'org', stripeCheckoutSessionId: 'sid', amountCents: 'am', status: 'st' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  desc: vi.fn((x) => x),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
}))

const { deliverMock } = vi.hoisted(() => ({ deliverMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: vi.fn(() => '<html>pay</html>'),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Dream Dental <acme@dreamcreatestudio.com>',
    replyTo: 'front@dream.com',
    name: 'Dream Dental',
    timeZone: 'America/Chicago',
    gmail: null,
  })),
}))
vi.mock('@/lib/services/email-automations', () => ({
  renderAutomatedEmail: vi.fn(async () => ({
    enabled: true,
    full: { subject: 'Your balance', body: 'Hi — you owe $X.' },
    override: {},
  })),
}))
const { canTakeMock } = vi.hoisted(() => ({ canTakeMock: vi.fn(async () => true) }))
vi.mock('@/lib/services/balance-payments', () => ({
  canTakeBalancePayments: canTakeMock,
  createBalancePaymentSession: vi.fn(async () => ({ url: 'https://checkout.stripe.com/x' })),
  finalizeBalancePaymentFromSession: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/pms', () => ({ queueCommLogWriteBack: vi.fn(async () => undefined) }))

import { resolveBalanceOutreachSettings, BALANCE_OUTREACH_DEFAULTS } from '@/lib/types/balance-outreach'
import { sendPayLinkEmail, runBalanceReminderCadence } from '@/lib/services/balance-outreach'

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  canTakeMock.mockResolvedValue(true)
})

const PATIENT = { id: 'pat_1', firstName: 'Marcus', lastName: 'Johnson', email: 'm@example.com', balance: 35000, isActive: 1 }

describe('resolveBalanceOutreachSettings', () => {
  it('defaults to DISABLED (dunning email is strictly opt-in)', () => {
    expect(BALANCE_OUTREACH_DEFAULTS.enabled).toBe(false)
    expect(resolveBalanceOutreachSettings(null).enabled).toBe(false)
  })

  it('clamps knobs into sane ranges', () => {
    const s = resolveBalanceOutreachSettings({ enabled: true, minBalanceCents: 5, cadenceDays: 1, maxSends: 99 })
    expect(s.minBalanceCents).toBe(100)
    expect(s.cadenceDays).toBe(7)
    expect(s.maxSends).toBe(6)
  })
})

describe('sendPayLinkEmail', () => {
  it('sends: request row (pb_ token) + branded email + ok', async () => {
    state.selectQueue.push([PATIENT]) // patient lookup
    state.selectQueue.push([]) // no recent request
    const r = await sendPayLinkEmail('org_1', 'pat_1', 'user_1', { source: 'staff' })
    expect(r.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(String(state.inserts[0].token)).toMatch(/^pb_/)
    expect(state.inserts[0]).toMatchObject({ source: 'staff', balanceCentsAtSend: 35000, status: 'sent' })
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('refuses when there is no balance', async () => {
    state.selectQueue.push([{ ...PATIENT, balance: 0 }])
    const r = await sendPayLinkEmail('org_1', 'pat_1', 'user_1')
    expect(r).toMatchObject({ ok: false, reason: 'no_balance' })
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('refuses when there is no email', async () => {
    state.selectQueue.push([{ ...PATIENT, email: null }])
    expect(await sendPayLinkEmail('org_1', 'pat_1', 'user_1')).toMatchObject({ ok: false, reason: 'no_email' })
  })

  it('refuses when the Connect account cannot charge', async () => {
    canTakeMock.mockResolvedValueOnce(false)
    state.selectQueue.push([PATIENT])
    expect(await sendPayLinkEmail('org_1', 'pat_1', 'user_1')).toMatchObject({
      ok: false,
      reason: 'payments_unavailable',
    })
  })

  it('never stacks: a pay link within 3 days blocks another', async () => {
    state.selectQueue.push([PATIENT])
    state.selectQueue.push([{ id: 'bpr_recent' }])
    expect(await sendPayLinkEmail('org_1', 'pat_1', 'user_1')).toMatchObject({ ok: false, reason: 'recently_sent' })
    expect(state.inserts).toHaveLength(0)
  })
})

describe('runBalanceReminderCadence', () => {
  const NOW = new Date('2026-06-10T12:00:00Z')
  const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000)

  it('does nothing when the cadence is off (the default)', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', balanceOutreach: null }]) // profiles
    const r = await runBalanceReminderCadence({ now: NOW })
    expect(r.orgsScanned).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('never emails a demo org', async () => {
    state.selectQueue.push([{ organizationId: 'org_demo', balanceOutreach: { enabled: true } }])
    state.selectQueue.push([{ isDemo: true }]) // org lookup
    const r = await runBalanceReminderCadence({ now: NOW })
    expect(r.orgsScanned).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('sends to an overdue patient and respects the cadence window', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', balanceOutreach: { enabled: true, cadenceDays: 14, maxSends: 3 } }])
    state.selectQueue.push([{ isDemo: false }]) // org lookup
    state.selectQueue.push([{ id: 'pat_1' }, { id: 'pat_2' }]) // balance patients
    // pat_1: last sent 20 days ago (past cadence) → sends
    state.selectQueue.push([{ sentAt: daysAgo(20), source: 'auto' }]) // history pat_1
    state.selectQueue.push([PATIENT]) // sendPayLinkEmail patient lookup
    state.selectQueue.push([]) // no recent request (3-day guard)
    // pat_2: last sent 3 days ago (inside cadence) → skipped
    state.selectQueue.push([{ sentAt: daysAgo(3), source: 'auto' }]) // history pat_2

    const r = await runBalanceReminderCadence({ now: NOW })
    expect(r.sent).toBe(1)
    expect(r.skipped).toBe(1)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ source: 'auto' })
  })

  it('stops after maxSends automated emails in the window (collections becomes a call)', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', balanceOutreach: { enabled: true, cadenceDays: 14, maxSends: 2 } }])
    state.selectQueue.push([{ isDemo: false }])
    state.selectQueue.push([{ id: 'pat_1' }])
    state.selectQueue.push([
      { sentAt: daysAgo(20), source: 'auto' },
      { sentAt: daysAgo(40), source: 'auto' },
    ])
    const r = await runBalanceReminderCadence({ now: NOW })
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
  })
})
