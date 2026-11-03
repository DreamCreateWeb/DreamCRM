import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A membership renewal that fails reaches the MEMBER: one "Update your card"
 * email carrying a Billing-Portal session minted on the clinic's CONNECTED
 * account, one staff line with the member's name. The idempotency key is the
 * persisted status - only a flip INTO past_due speaks; a re-delivered event
 * while still past_due, and any recovery, stay quiet.
 */

const state: { selectQueue: unknown[][]; updates: Array<Record<string, unknown>> } = { selectQueue: [], updates: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy']) obj[m] = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push(s) } }) }),
    },
    schema: new Proxy({}, { get: (_t, prop) => new Proxy({}, { get: (_x, col) => `${String(prop)}.${String(col)}` }) }),
  }
})

const portalCreate = vi.fn(async (..._a: unknown[]) => ({ url: 'https://billing.stripe.com/p/session/abc' }))
const subRetrieve = vi.fn(async (..._a: unknown[]) => ({ customer: 'cus_member' }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: (...a: unknown[]) => subRetrieve(...a) },
    billingPortal: { sessions: { create: (...a: unknown[]) => portalCreate(...a) } },
  },
  subscriptionPeriodEnd: () => null,
}))

const deliverMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(),
  deliver: (...a: unknown[]) => deliverMock(...a),
  patientEmailShell: (o: { title: string; body: string; cta?: { url: string; label: string } }) =>
    `<shell>${o.title}|${o.body}|${o.cta?.url}|${o.cta?.label}</shell>`,
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: async () => ({ name: 'Acme Dental', from: 'a@x', replyTo: 'r@x', gmail: null, timeZone: 'America/Chicago' }),
}))
const renderMock = vi.fn(async (..._a: unknown[]): Promise<any> => ({
  enabled: true,
  full: { subject: 'Your Smile Club renewal didn’t go through', body: 'Hi Sam — <b>fix</b> it.' },
}))
vi.mock('@/lib/services/email-automations', () => ({ renderAutomatedEmail: (...a: unknown[]) => renderMock(...a) }))
const notifyMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: (...a: unknown[]) => notifyMock(...a) }))

import { handleSubscriptionEvent } from '@/lib/services/membership'

const target = (status: string, over: Record<string, unknown> = {}) => ({
  membershipId: 'm1',
  patientId: 'p1',
  status,
  planName: 'Smile Club',
  firstName: 'Sam',
  lastName: 'Lee',
  email: 'sam@example.com',
  ...over,
})
const connected = { accountId: 'acct_clinic', status: 'active', charges: 1 }
const noteOf = () => notifyMock.mock.calls[0][1] as { title: string; body: string }

beforeEach(() => {
  state.selectQueue.length = 0
  state.updates.length = 0
  for (const m of [portalCreate, subRetrieve, deliverMock, renderMock, notifyMock]) m.mockClear()
})

describe('membership past-due rescue', () => {
  it('active -> past_due: ONE email with a Billing-Portal URL from the CONNECTED account, and a staff note', async () => {
    state.selectQueue.push([target('active')], [connected], [{ phone: '555' }])
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)

    expect(subRetrieve).toHaveBeenCalledWith('sub_1', undefined, { stripeAccount: 'acct_clinic' })
    expect(portalCreate).toHaveBeenCalledTimes(1)
    const [args, opts] = portalCreate.mock.calls[0] as unknown as [{ customer: string; return_url: string }, { stripeAccount: string }]
    expect(args.customer).toBe('cus_member')
    expect(args.return_url).toMatch(/\/patient\/invoices$/)
    expect(opts).toEqual({ stripeAccount: 'acct_clinic' })

    expect(deliverMock).toHaveBeenCalledTimes(1)
    const sent = deliverMock.mock.calls[0][0] as { to: string; html: string }
    expect(sent.to).toBe('sam@example.com')
    expect(sent.html).toContain('https://billing.stripe.com/p/session/abc')
    expect(sent.html).toContain('Update your card')
    // The automation body is escaped before it hits the shell.
    expect(sent.html).toContain('&lt;b&gt;fix&lt;/b&gt;')
    expect(renderMock.mock.calls[0][1]).toBe('membership_card_update')

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(noteOf().title).toContain('Sam Lee')
    expect(noteOf().body).toMatch(/emailed Sam a link/)
  })

  it('still past_due on a re-delivered event: no second email, no second staff note', async () => {
    state.selectQueue.push([target('past_due')])
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(portalCreate).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(state.updates[0].status).toBe('past_due')
  })

  it('back to active: nothing is sent', async () => {
    await handleSubscriptionEvent('org_1', 'sub_1', 'active', 1800000000)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('a later lapse after recovery is a new period and tells them again', async () => {
    state.selectQueue.push([target('active')], [connected], [{ phone: null }])
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('automation switched off: no email, and staff are told to reach out (never "we emailed")', async () => {
    renderMock.mockResolvedValueOnce({ enabled: false })
    state.selectQueue.push([target('active')], [connected], [{ phone: null }])
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(noteOf().body).toMatch(/Reach out/)
    expect(noteOf().body).not.toMatch(/emailed/)
  })

  it('portal refused by Stripe: no email, staff told to reach out, never throws', async () => {
    portalCreate.mockRejectedValueOnce(new Error('portal not configured'))
    state.selectQueue.push([target('active')], [connected])
    await expect(handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)).resolves.toBeUndefined()
    expect(deliverMock).not.toHaveBeenCalled()
    expect(noteOf().body).toMatch(/Reach out/)
  })

  it('a member with no email on file: staff note only', async () => {
    state.selectQueue.push([target('active', { email: null })])
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})
