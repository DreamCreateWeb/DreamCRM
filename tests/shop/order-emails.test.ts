import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-42 — "ready for pickup" / "shipped". Pickup orders hear "ready", ship
 * orders hear "shipped" (with the tracking line when there is one); each
 * speaks ONCE per order (the claim is an atomic UPDATE ... IS NULL); a toggle
 * that is off sends nothing and burns no claim; every user value is escaped;
 * a failed send releases the claim.
 */

const st: { selects: unknown[][]; claim: unknown[]; updates: Array<Record<string, unknown>> } = { selects: [], claim: [{ id: 'o1' }], updates: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy']) obj[m] = () => obj
    obj.limit = async () => st.selects.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(st.selects.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (s: Record<string, unknown>) => {
          st.updates.push(s)
          const w: any = { returning: async () => st.claim, catch: () => undefined }
          w.then = (resolve: (v: unknown) => void) => resolve(undefined)
          return { where: () => w }
        },
      }),
    },
    schema: new Proxy({}, { get: (_t, prop) => new Proxy({}, { get: (_x, col) => `${String(prop)}.${String(col)}` }) }),
  }
})

const deliverMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(),
  deliver: (...a: unknown[]) => deliverMock(...a),
  patientEmailShell: (o: { title: string; body: string; footnoteHtml?: string }) => `<shell>${o.title}|${o.body}|${o.footnoteHtml}</shell>`,
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: async () => ({ name: 'Acme Dental', from: 'a@x', replyTo: 'r@x', gmail: null, timeZone: 'America/Chicago' }),
}))
const renderMock = vi.fn(async (..._a: unknown[]): Promise<any> => ({
  enabled: true,
  full: { subject: 'Subject', body: 'Hi Sam — <b>hello</b>.' },
}))
vi.mock('@/lib/services/email-automations', () => ({ renderAutomatedEmail: (...a: unknown[]) => renderMock(...a) }))

import { sendShopOrderEmail } from '@/lib/services/shop-order-emails'

const order = (over: Record<string, unknown> = {}) => ({
  id: 'abcdef123456',
  email: 'sam@example.com',
  name: 'Sam Lee',
  status: 'paid',
  fulfillmentType: 'pickup',
  trackingNumber: null,
  ...over,
})
const queue = (o: Record<string, unknown>, items: unknown[] = [{ name: 'Sonic <Brush>', variant: null, qty: 2 }]) => {
  st.selects.push([o], [{ phone: '555' }], items)
}

beforeEach(() => {
  st.selects.length = 0
  st.updates.length = 0
  st.claim = [{ id: 'o1' }]
  for (const m of [deliverMock, renderMock]) m.mockClear()
})

describe('shop order emails', () => {
  it('pickup order -> ONE "ready" email, escaped, to the order email', async () => {
    queue(order())
    expect(await sendShopOrderEmail('org_1', 'abcdef123456', 'ready')).toBe('sent')
    expect(renderMock.mock.calls[0][1]).toBe('shop_ready_for_pickup')
    expect(renderMock.mock.calls[0][2]).toMatchObject({ firstName: 'Sam', clinicName: 'Acme Dental' })
    const sent = deliverMock.mock.calls[0][0] as { to: string; html: string }
    expect(sent.to).toBe('sam@example.com')
    expect(sent.html).toContain('&lt;b&gt;hello&lt;/b&gt;')
    expect(sent.html).toContain('Sonic &lt;Brush&gt;')
    expect(sent.html).not.toContain('<b>hello</b>')
    expect(st.updates[0]).toHaveProperty('readyEmailAt')
  })

  it('ship order -> "shipped" with the tracking line (escaped); without tracking, no line', async () => {
    queue(order({ fulfillmentType: 'ship', trackingNumber: '1Z<9>' }))
    expect(await sendShopOrderEmail('org_1', 'abcdef123456', 'shipped')).toBe('sent')
    expect(renderMock.mock.calls[0][1]).toBe('shop_shipped')
    expect(renderMock.mock.calls[0][2]).toMatchObject({ trackingNumber: '1Z<9>' })
    expect((deliverMock.mock.calls[0][0] as { html: string }).html).toContain('Tracking number: <strong>1Z&lt;9&gt;</strong>')
    expect(st.updates[0]).toHaveProperty('shippedEmailAt')

    deliverMock.mockClear()
    queue(order({ fulfillmentType: 'ship' }))
    await sendShopOrderEmail('org_1', 'abcdef123456', 'shipped')
    expect((deliverMock.mock.calls[0][0] as { html: string }).html).not.toContain('Tracking number')
  })

  it('the matrix: ready never goes to a ship order, shipped never to a pickup order, never an unpaid one', async () => {
    queue(order({ fulfillmentType: 'ship' }))
    expect(await sendShopOrderEmail('org_1', 'x', 'ready')).toBe('not_applicable')
    queue(order({ fulfillmentType: 'pickup' }))
    expect(await sendShopOrderEmail('org_1', 'x', 'shipped')).toBe('not_applicable')
    queue(order({ status: 'pending' }))
    expect(await sendShopOrderEmail('org_1', 'x', 'ready')).toBe('not_applicable')
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('once per status: a lost claim sends nothing', async () => {
    st.claim = []
    queue(order())
    expect(await sendShopOrderEmail('org_1', 'x', 'ready')).toBe('already')
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('toggle off -> nothing sent and no claim burned', async () => {
    renderMock.mockResolvedValueOnce({ enabled: false, full: { subject: '', body: '' } })
    queue(order())
    expect(await sendShopOrderEmail('org_1', 'x', 'ready')).toBe('off')
    expect(deliverMock).not.toHaveBeenCalled()
    expect(st.updates).toHaveLength(0)
  })

  it('a failed send releases the claim and never throws', async () => {
    deliverMock.mockRejectedValueOnce(new Error('resend down'))
    queue(order())
    expect(await sendShopOrderEmail('org_1', 'x', 'ready')).toBe('failed')
    expect(st.updates[1]).toEqual({ readyEmailAt: null })
  })
})
