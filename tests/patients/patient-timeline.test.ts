import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Patient timeline — commerce + reputation events. Under test: shop orders,
 * memberships, online balance payments, and completed reviews surface as their
 * own timeline kinds, and the "Billing" count rolls up the money-shaped kinds.
 */

const state = {
  patient: [] as Array<Record<string, unknown>>,
  patientThread: [] as Array<Record<string, unknown>>,
  appointment: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  formSubmission: [] as Array<Record<string, unknown>>,
  patientNote: [] as Array<Record<string, unknown>>,
  patientMessage: [] as Array<Record<string, unknown>>,
  emailMessage: [] as Array<Record<string, unknown>>,
  shopOrder: [] as Array<Record<string, unknown>>,
  shopOrderItem: [] as Array<Record<string, unknown>>,
  membership: [] as Array<Record<string, unknown>>,
  patientBalancePayment: [] as Array<Record<string, unknown>>,
  reviewRequest: [] as Array<Record<string, unknown>>,
  patientDocument: [] as Array<Record<string, unknown>>,
  patientFollowup: [] as Array<Record<string, unknown>>,
  campaignEvents: [] as Array<Record<string, unknown>>,
  patientTagAssignment: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')

  function rowsFor(table: unknown): unknown[] {
    if (table === schema.patient) return state.patient
    if (table === schema.patientThread) return state.patientThread
    if (table === schema.appointment) return state.appointment
    if (table === schema.messages) return state.messages
    if (table === schema.formSubmission) return state.formSubmission
    if (table === schema.patientNote) return state.patientNote
    if (table === schema.patientMessage) return state.patientMessage
    if (table === schema.emailMessage) return state.emailMessage
    if (table === schema.shopOrder) return state.shopOrder
    if (table === schema.shopOrderItem) return state.shopOrderItem
    if (table === schema.membership) return state.membership
    if (table === schema.patientBalancePayment) return state.patientBalancePayment
    if (table === schema.reviewRequest) return state.reviewRequest
    if (table === schema.patientDocument) return state.patientDocument
    if (table === schema.patientFollowup) return state.patientFollowup
    if (table === schema.campaignEvents) return state.campaignEvents
    if (table === schema.patientTagAssignment) return state.patientTagAssignment
    return []
  }

  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(rows: unknown[]): Chain {
    const p = Promise.resolve(rows) as Chain
    p.from = (t: unknown) => chain(rowsFor(t))
    p.innerJoin = () => p
    p.leftJoin = () => p
    p.where = () => p
    p.orderBy = () => p
    p.limit = () => p
    return p
  }
  return { db: { select: () => chain([]) }, schema }
})

import { getPatientTimeline, countTimeline } from '@/lib/services/patient-timeline'

function resetState() {
  for (const k of Object.keys(state) as Array<keyof typeof state>) state[k] = []
  state.patient = [
    { id: 'pat_1', email: 'mia@x.com', userId: null, firstName: 'Mia', lastName: 'Hayes', firstSeenAt: new Date('2025-01-01'), createdAt: new Date('2025-01-01'), source: 'booking' },
  ]
}

beforeEach(resetState)

describe('getPatientTimeline — commerce + review events', () => {
  it('includes a paid shop order with an items summary + total', async () => {
    state.shopOrder = [
      { id: 'o1', status: 'paid', totalCents: 8900, createdAt: new Date('2026-05-01'), paidAt: new Date('2026-05-01') },
    ]
    state.shopOrderItem = [
      { orderId: 'o1', productName: 'Whitening Kit', quantity: 2 },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const order = events.find((e) => e.kind === 'shop_order')!
    expect(order).toBeDefined()
    expect(order.title).toBe('2× Whitening Kit — $89.00')
    expect(order.status).toBe('paid')
    expect(order.href).toBe('/shop/orders')
  })

  it('includes membership lifecycle (joined)', async () => {
    state.membership = [
      { id: 'm1', status: 'active', planName: 'Smile Club', createdAt: new Date('2026-04-01'), startedAt: new Date('2026-04-01'), cancelledAt: null },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const mem = events.find((e) => e.kind === 'membership')!
    expect(mem.title).toBe('Joined Smile Club')
    expect(mem.href).toBe('/shop/memberships')
  })

  it('includes an online balance payment', async () => {
    state.patientBalancePayment = [
      { id: 'bp1', status: 'paid', amountCents: 12000, createdAt: new Date('2026-03-01'), paidAt: new Date('2026-03-01') },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const pay = events.find((e) => e.kind === 'balance_payment')!
    expect(pay.title).toBe('Paid $120.00 toward balance online')
    expect(pay.href).toBe('/shop/payments')
  })

  it('includes a completed review with its star rating + text', async () => {
    state.reviewRequest = [
      { id: 'r1', rating: 5, reviewText: 'Loved it', completedAt: new Date('2026-02-01'), selectedSite: 'google' },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const review = events.find((e) => e.kind === 'review')!
    expect(review.title).toBe('Left a 5★ review')
    expect(review.body).toBe('Loved it')
    expect(review.href).toBe('/growth/reviews/received')
  })
})

describe('getPatientTimeline — unified relationship events', () => {
  it('includes an uploaded document linking to the file (new tab via http href)', async () => {
    state.patientDocument = [
      { id: 'd1', fileName: 'card.jpg', fileUrl: 'https://s3/card.jpg', contentType: 'image/jpeg', label: 'Insurance card', createdAt: new Date('2026-05-01'), uploadedByName: 'Reception' },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const doc = events.find((e) => e.kind === 'document')!
    expect(doc.title).toBe('Uploaded Insurance card')
    expect(doc.href).toBe('https://s3/card.jpg')
  })

  it('includes an open follow-up (and a completed one positioned at completion)', async () => {
    state.patientFollowup = [
      { id: 'f1', title: 'Call about crown', status: 'open', dueDate: '2026-06-20', createdAt: new Date('2026-06-01'), completedAt: null, assigneeName: 'Dr. Reyes' },
      { id: 'f2', title: 'Send pricing', status: 'done', dueDate: null, createdAt: new Date('2026-05-01'), completedAt: new Date('2026-05-03'), assigneeName: null },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const open = events.find((e) => e.id === 'fu_f1')!
    expect(open.title).toBe('Follow-up: Call about crown')
    expect(open.status).toBe('open')
    const done = events.find((e) => e.id === 'fu_f2')!
    expect(done.title).toBe('Completed follow-up: Send pricing')
    expect(done.occurredAt).toEqual(new Date('2026-05-03')) // positioned at completion
  })

  it('includes a received campaign linking to the campaign', async () => {
    state.campaignEvents = [
      { id: 7, occurredAt: new Date('2026-06-10'), campaignId: 42, campaignName: 'Birthday greetings' },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const camp = events.find((e) => e.kind === 'campaign')!
    expect(camp.title).toBe('Received “Birthday greetings”')
    expect(camp.href).toBe('/growth/campaigns/42')
  })

  it('includes a tag-applied event', async () => {
    state.patientTagAssignment = [
      { tagId: 'tag_1', name: 'VIP', assignedAt: new Date('2026-03-01') },
    ]
    const events = await getPatientTimeline('org_1', 'pat_1')
    const tag = events.find((e) => e.kind === 'tag')!
    expect(tag.title).toBe('Tagged “VIP”')
  })
})

describe('countTimeline — Billing rolls up the money kinds', () => {
  it('counts invoice + shop_order + balance_payment + membership under billing', () => {
    const base = {
      occurredAt: new Date(),
      subtitle: null,
      status: null,
      direction: null,
      href: null,
      body: null,
      agingDays: null,
    } as const
    const counts = countTimeline([
      { id: '1', kind: 'invoice', title: '', ...base },
      { id: '2', kind: 'shop_order', title: '', ...base },
      { id: '3', kind: 'balance_payment', title: '', ...base },
      { id: '4', kind: 'membership', title: '', ...base },
      { id: '5', kind: 'review', title: '', ...base },
      { id: '6', kind: 'appointment', title: '', ...base },
    ])
    expect(counts.billing).toBe(4)
    expect(counts.appointments).toBe(1)
    // review has no dedicated tab — only counted in 'all'.
    expect(counts.all).toBe(6)
  })
})
