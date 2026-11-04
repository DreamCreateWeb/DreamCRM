/**
 * Payment-plan card-update readers/writers — every NEW query carries the
 * plan's org id (ORG_A pattern): the patient read behind the decline email,
 * the card_update_sent_at stamp, and the past_due → active CAS of the
 * card-update return trip. Real drizzle-orm + the real schema; only @/lib/db
 * is mocked, so the captured where-clause is the genuine eq(...) fragments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as Array<{ kind: 'select' | 'update'; sql: string }>,
  selectQueue: [] as unknown[][],
}

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push({ kind: 'select', sql: captureSql(clause) })
      return obj
    }
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(res, rej)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async () => {} }),
      update: () => ({
        set: () => ({
          where: (clause: unknown) => {
            state.wheres.push({ kind: 'update', sql: captureSql(clause) })
            const p: any = Promise.resolve(undefined)
            p.returning = async () => [{ id: 'ppl_1' }]
            return p
          },
        }),
      }),
    },
    schema,
  }
})

const { paymentIntentCreateMock, sessionsRetrieveMock } = vi.hoisted(() => ({
  paymentIntentCreateMock: vi.fn(async () => ({ id: 'pi_1' })),
  sessionsRetrieveMock: vi.fn(async () => ({ setup_intent: { status: 'succeeded', payment_method: 'pm_new' } })),
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: paymentIntentCreateMock },
    checkout: { sessions: { retrieve: sessionsRetrieveMock } },
  },
}))
vi.mock('@/lib/email', () => ({
  patientEmailShell: vi.fn((o: { title?: string; body?: string; cta?: { url: string; label: string }; footnoteHtml?: string }) => `<html>${o?.title ?? ''}${o?.body ?? ''}${o?.cta ? `<a href="${o.cta.url}">${o.cta.label}</a>` : ''}${o?.footnoteHtml ?? ''}</html>`),
  deliver: vi.fn(async () => {}),
  sendNotificationEmail: vi.fn(async () => {}),
  authEmailShell: () => '<html></html>',
  patientEmailShell: () => '<html></html>',
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: async () => ({ name: 'Acme', from: 'a@x', replyTo: null, gmail: null, timeZone: 'America/Chicago' }),
}))
vi.mock('@/lib/services/email-automations', () => ({
  renderAutomatedEmail: async () => ({ enabled: true, subject: 's', full: { subject: 's', body: 'b' }, override: {} }),
}))
vi.mock('@/lib/services/balance-payments', () => ({ canTakeBalancePayments: async () => true }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn(async () => {}) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => {}) }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))

import { runDuePlanCharges, finalizePlanSetup } from '@/lib/services/payment-plans'

const PLAN = {
  id: 'ppl_1', organizationId: 'org_a', patientId: 'pat_1', token: 'pl_x',
  totalCents: 60_000, installmentCents: 10_000, installments: 6, installmentsPaid: 2,
  status: 'active', stripeCustomerId: 'cus_1', stripePaymentMethodId: 'pm_1', stripeSetupSessionId: 'cs_new',
  nextChargeAt: new Date('2026-07-01T00:00:00Z'), failedAttempts: 0, lastError: null, cardUpdateSentAt: null,
}
const CFG = { accountId: 'acct_1', status: 'active', charges: 1, currency: 'usd', platformFeeBps: 100 }

beforeEach(() => {
  state.wheres = []
  state.selectQueue = []
  vi.clearAllMocks()
})

describe('decline → the patient email and its stamp are org-scoped', () => {
  it('reads the patient and stamps card_update_sent_at under the plan’s org', async () => {
    state.selectQueue.push([PLAN]) // due
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([CFG]) // shop config
    state.selectQueue.push([{ firstName: 'Marcus', email: 'm@x.com' }]) // the patient (NEW read)
    state.selectQueue.push([{ phone: null }]) // clinic phone
    paymentIntentCreateMock.mockRejectedValueOnce(new Error('card_declined'))

    const r = await runDuePlanCharges({ now: new Date('2026-07-02T15:00:00Z') })
    expect(r.failed).toBe(1)

    const patientRead = state.wheres.filter((w) => w.kind === 'select').find((w) => w.sql.includes('pat_1'))
    expect(patientRead, 'patient read').toBeDefined()
    expect(patientRead!.sql).toContain('organization_id')
    expect(patientRead!.sql).toContain('org_a')

    const updates = state.wheres.filter((w) => w.kind === 'update')
    // [0] past_due + retry, [1] the stamp.
    expect(updates).toHaveLength(2)
    expect(updates[1].sql).toContain('organization_id')
    expect(updates[1].sql).toContain('org_a')
    expect(updates[1].sql).toContain('ppl_1')
  })
})

describe('the card-update return trip is org-scoped', () => {
  it('CAS past_due → active carries the org id and the status guard', async () => {
    state.selectQueue.push([{ ...PLAN, status: 'past_due', failedAttempts: 2, cardUpdateSentAt: new Date() }]) // by token
    state.selectQueue.push([CFG]) // shop config
    state.selectQueue.push([{ ...PLAN, stripePaymentMethodId: 'pm_new' }]) // fresh
    const r = await finalizePlanSetup('pl_x', 'cs_new')
    expect(r).toMatchObject({ ok: true, resumed: true })

    const cas = state.wheres.filter((w) => w.kind === 'update')[0]
    expect(cas.sql).toContain('organization_id')
    expect(cas.sql).toContain('org_a')
    expect(cas.sql).toContain('past_due')
  })
})
