import 'server-only'
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export type TimelineKind =
  | 'appointment'
  | 'message'
  | 'form_submission'
  | 'invoice'
  | 'note'
  | 'created'
  // Commerce + reputation events — real money + feedback the patient generated.
  // These read the SAME sources the patient portal's getMyBills uses
  // (shop_order / membership / patient_balance_payment) + reviews.
  | 'shop_order'
  | 'membership'
  | 'balance_payment'
  | 'review'

export type MessageChannel = 'in_app' | 'email' | 'sms'

export interface TimelineEvent {
  id: string
  kind: TimelineKind
  occurredAt: Date
  title: string
  subtitle: string | null
  status: string | null
  direction: 'in' | 'out' | null
  href: string | null
  body: string | null
  // Aging in days, derived for in-flight events that need attention.
  // E.g. an unconfirmed appointment with start in 24h → +1; a sent message
  // unreplied for 7 days → 7. Null when "completed" / not actionable.
  agingDays: number | null
  authorName?: string | null
  /** Channel for message-kind events. Lets the UI render the channel chip. */
  channel?: MessageChannel | null
}

interface RawAppt {
  id: string
  startTime: Date
  endTime: Date | null
  type: string
  status: string
  notes: string | null
  createdAt: Date
}
interface RawMsg {
  id: number
  authorId: string
  body: string
  createdAt: Date
  authorName: string | null
}
interface RawSub {
  id: string
  formTitle: string
  submittedAt: Date
  submitterName: string | null
}
interface RawInv {
  id: number
  invoiceNumber: string
  status: string
  totalCents: number
  createdAt: Date
  paidAt: Date | null
}
interface RawNote {
  id: string
  body: string
  createdAt: Date
  authorName: string | null
}
interface RawPatientMsg {
  id: string
  channel: string
  direction: string
  body: string
  sentAt: Date
  sentByName: string | null
  threadId: string
}
interface RawEmailMsg {
  id: string
  folder: string
  fromName: string | null
  fromEmail: string
  subject: string | null
  snippet: string | null
  bodyText: string | null
  receivedAt: Date
}
interface RawShopOrder {
  id: string
  status: string
  totalCents: number
  createdAt: Date
  paidAt: Date | null
}
interface RawMembership {
  id: string
  status: string
  planName: string
  createdAt: Date
  startedAt: Date | null
  cancelledAt: Date | null
}
interface RawBalancePayment {
  id: string
  status: string
  amountCents: number
  createdAt: Date
  paidAt: Date | null
}
interface RawReview {
  id: string
  rating: number | null
  reviewText: string | null
  completedAt: Date | null
  selectedSite: string | null
}

/** Compact dollar string from cents for commerce timeline titles. */
function dollars(cents: number): string {
  return `$${(Number(cents) / 100).toFixed(2)}`
}

export async function getPatientTimeline(
  organizationId: string,
  patientId: string,
): Promise<TimelineEvent[]> {
  const [patientRow] = await db
    .select({
      id: schema.patient.id,
      email: schema.patient.email,
      userId: schema.patient.userId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      firstSeenAt: schema.patient.firstSeenAt,
      createdAt: schema.patient.createdAt,
      source: schema.patient.source,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)

  if (!patientRow) return []
  const now = new Date()
  const fortyEightHrs = 48 * 60 * 60 * 1000
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  // Look up the patient thread (one per patient) so message-kind events
  // can link directly to /messages?thread=<id>. Null if no thread yet —
  // the patient has not been messaged.
  const [threadRow] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, organizationId),
        eq(schema.patientThread.patientId, patientId),
      ),
    )
    .limit(1)
  const threadId = threadRow?.id ?? null
  const messagesHref = threadId ? `/messages?thread=${threadId}` : '/messages'

  const [appts, msgs, subs, invs, notes, pMessages, emailMessages, shopOrders, memberships, balancePayments, reviews] = await Promise.all([
    db
      .select({
        id: schema.appointment.id,
        startTime: schema.appointment.startTime,
        endTime: schema.appointment.endTime,
        type: schema.appointment.type,
        status: schema.appointment.status,
        notes: schema.appointment.notes,
        createdAt: schema.appointment.createdAt,
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.appointment.startTime)) as Promise<RawAppt[]>,
    patientRow.userId
      ? (db
          .select({
            id: schema.messages.id,
            authorId: schema.messages.authorId,
            body: schema.messages.body,
            createdAt: schema.messages.createdAt,
            authorName: schema.user.name,
          })
          .from(schema.messages)
          .innerJoin(
            schema.conversationMembers,
            eq(schema.messages.conversationId, schema.conversationMembers.conversationId),
          )
          .leftJoin(schema.user, eq(schema.messages.authorId, schema.user.id))
          .where(eq(schema.conversationMembers.userId, patientRow.userId))
          .orderBy(desc(schema.messages.createdAt)) as Promise<RawMsg[]>)
      : (Promise.resolve([]) as Promise<RawMsg[]>),
    db
      .select({
        id: schema.formSubmission.id,
        formTitle: schema.formTemplate.title,
        submittedAt: schema.formSubmission.submittedAt,
        submitterName: schema.formSubmission.submitterName,
      })
      .from(schema.formSubmission)
      .innerJoin(
        schema.formTemplate,
        eq(schema.formSubmission.formTemplateId, schema.formTemplate.id),
      )
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          eq(schema.formSubmission.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.formSubmission.submittedAt)) as Promise<RawSub[]>,
    db
      .select({
        id: schema.invoices.id,
        invoiceNumber: schema.invoices.invoiceNumber,
        status: schema.invoices.status,
        totalCents: schema.invoices.totalCents,
        createdAt: schema.invoices.createdAt,
        paidAt: schema.invoices.paidAt,
      })
      .from(schema.invoices)
      .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.invoices.organizationId, organizationId),
          patientRow.email
            ? or(
                eq(schema.customers.patientId, patientId),
                eq(schema.customers.email, patientRow.email),
              )!
            : eq(schema.customers.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt)) as Promise<RawInv[]>,
    db
      .select({
        id: schema.patientNote.id,
        body: schema.patientNote.body,
        createdAt: schema.patientNote.createdAt,
        authorName: schema.user.name,
      })
      .from(schema.patientNote)
      .leftJoin(schema.user, eq(schema.patientNote.authorId, schema.user.id))
      .where(
        and(
          eq(schema.patientNote.organizationId, organizationId),
          eq(schema.patientNote.patientId, patientId),
          isNull(schema.patientNote.deletedAt),
        ),
      )
      .orderBy(desc(schema.patientNote.createdAt)) as Promise<RawNote[]>,
    threadId
      ? (db
          .select({
            id: schema.patientMessage.id,
            channel: schema.patientMessage.channel,
            direction: schema.patientMessage.direction,
            body: schema.patientMessage.body,
            sentAt: schema.patientMessage.sentAt,
            sentByName: schema.user.name,
            threadId: schema.patientMessage.threadId,
          })
          .from(schema.patientMessage)
          .leftJoin(schema.user, eq(schema.patientMessage.sentByUserId, schema.user.id))
          .where(eq(schema.patientMessage.threadId, threadId))
          .orderBy(asc(schema.patientMessage.sentAt)) as Promise<RawPatientMsg[]>)
      : (Promise.resolve([]) as Promise<RawPatientMsg[]>),
    db
      .select({
        id: schema.emailMessage.id,
        folder: schema.emailMessage.folder,
        fromName: schema.emailMessage.fromName,
        fromEmail: schema.emailMessage.fromEmail,
        subject: schema.emailMessage.subject,
        snippet: schema.emailMessage.snippet,
        bodyText: schema.emailMessage.bodyText,
        receivedAt: schema.emailMessage.receivedAt,
      })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          eq(schema.emailMessage.patientId, patientId),
        ),
      )
      .orderBy(asc(schema.emailMessage.receivedAt)) as Promise<RawEmailMsg[]>,
    // Shop orders this patient placed (any status — paid is the headline; a
    // pending/cancelled order is still part of the relationship record).
    db
      .select({
        id: schema.shopOrder.id,
        status: schema.shopOrder.status,
        totalCents: schema.shopOrder.totalCents,
        createdAt: schema.shopOrder.createdAt,
        paidAt: schema.shopOrder.paidAt,
      })
      .from(schema.shopOrder)
      .where(
        and(
          eq(schema.shopOrder.organizationId, organizationId),
          eq(schema.shopOrder.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.shopOrder.createdAt)) as Promise<RawShopOrder[]>,
    // Membership enrollments — lifecycle (joined / past-due / cancelled).
    db
      .select({
        id: schema.membership.id,
        status: schema.membership.status,
        planName: schema.membershipPlan.name,
        createdAt: schema.membership.createdAt,
        startedAt: schema.membership.startedAt,
        cancelledAt: schema.membership.cancelledAt,
      })
      .from(schema.membership)
      .innerJoin(schema.membershipPlan, eq(schema.membership.planId, schema.membershipPlan.id))
      .where(
        and(
          eq(schema.membership.organizationId, organizationId),
          eq(schema.membership.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.membership.createdAt)) as Promise<RawMembership[]>,
    // Online balance payments toward the PMS balance.
    db
      .select({
        id: schema.patientBalancePayment.id,
        status: schema.patientBalancePayment.status,
        amountCents: schema.patientBalancePayment.amountCents,
        createdAt: schema.patientBalancePayment.createdAt,
        paidAt: schema.patientBalancePayment.paidAt,
      })
      .from(schema.patientBalancePayment)
      .where(
        and(
          eq(schema.patientBalancePayment.organizationId, organizationId),
          eq(schema.patientBalancePayment.patientId, patientId),
        ),
      )
      .orderBy(desc(schema.patientBalancePayment.createdAt)) as Promise<RawBalancePayment[]>,
    // Completed reviews — the patient left feedback ("Left a 5★ review").
    db
      .select({
        id: schema.reviewRequest.id,
        rating: schema.reviewRequest.rating,
        reviewText: schema.reviewRequest.reviewText,
        completedAt: schema.reviewRequest.completedAt,
        selectedSite: schema.reviewRequest.selectedSite,
      })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          eq(schema.reviewRequest.patientId, patientId),
          eq(schema.reviewRequest.status, 'completed'),
        ),
      )
      .orderBy(desc(schema.reviewRequest.completedAt)) as Promise<RawReview[]>,
  ])

  // Items summary for shop orders ("2× Whitening Kit"), fetched once.
  const orderItemsByOrder = new Map<string, string[]>()
  if (shopOrders.length > 0) {
    const itemRows = await db
      .select({
        orderId: schema.shopOrderItem.orderId,
        productName: schema.shopOrderItem.productName,
        quantity: schema.shopOrderItem.quantity,
      })
      .from(schema.shopOrderItem)
      .where(inArray(schema.shopOrderItem.orderId, shopOrders.map((o) => o.id)))
    for (const it of itemRows) {
      const arr = orderItemsByOrder.get(it.orderId) ?? []
      arr.push(`${it.quantity}× ${it.productName}`)
      orderItemsByOrder.set(it.orderId, arr)
    }
  }

  const events: TimelineEvent[] = []

  for (const a of appts) {
    const start = a.startTime
    const future = start > now
    const within48h = future && start.getTime() - now.getTime() <= fortyEightHrs
    const aging = future && within48h && a.status === 'scheduled'
      ? Math.max(0, Math.round((fortyEightHrs - (start.getTime() - now.getTime())) / (24 * 60 * 60 * 1000)))
      : null
    events.push({
      id: `appt_${a.id}`,
      kind: 'appointment',
      occurredAt: start,
      title: a.type
        ? `${a.type.replace(/_/g, ' ')}${a.status === 'completed' ? ' (completed)' : ''}`
        : 'Appointment',
      subtitle: start.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      status: a.status,
      direction: null,
      href: '/appointments',
      body: a.notes,
      agingDays: aging,
    })
  }

  for (const s of subs) {
    events.push({
      id: `sub_${s.id}`,
      kind: 'form_submission',
      occurredAt: s.submittedAt,
      title: `Submitted ${s.formTitle}`,
      subtitle: s.submitterName ?? 'Form submission',
      status: null,
      direction: null,
      href: `/intake-forms/submissions/${s.id}`,
      body: null,
      agingDays: null,
    })
  }

  for (const inv of invs) {
    const paid = inv.status === 'paid' && inv.paidAt
    events.push({
      id: `inv_${inv.id}`,
      kind: 'invoice',
      occurredAt: paid ? inv.paidAt! : inv.createdAt,
      title: paid
        ? `Paid invoice ${inv.invoiceNumber}`
        : `Invoice ${inv.invoiceNumber} — ${inv.status}`,
      subtitle: `$${(Number(inv.totalCents) / 100).toFixed(2)}`,
      status: inv.status,
      direction: null,
      href: `/ecommerce/invoices`,
      body: null,
      agingDays:
        inv.status === 'overdue'
          ? Math.round((now.getTime() - inv.createdAt.getTime()) / (24 * 60 * 60 * 1000))
          : null,
    })
  }

  for (const m of msgs) {
    const fromPatient = m.authorId === patientRow.userId
    events.push({
      id: `msg_${m.id}`,
      kind: 'message',
      occurredAt: m.createdAt,
      title: fromPatient
        ? `${patientRow.firstName} sent a message`
        : `${m.authorName ?? 'Staff'} sent a message`,
      subtitle: null,
      status: null,
      direction: fromPatient ? 'in' : 'out',
      href: messagesHref,
      body: m.body,
      agingDays: null,
      authorName: fromPatient ? `${patientRow.firstName} ${patientRow.lastName}` : m.authorName,
    })
  }

  // Patient Communications v1 — unified thread messages, channel-tagged
  for (const m of pMessages) {
    const inbound = m.direction === 'inbound'
    const channelLabel = m.channel === 'email' ? 'Email' : m.channel === 'sms' ? 'SMS' : 'In-app'
    events.push({
      id: `pmsg_${m.id}`,
      kind: 'message',
      occurredAt: m.sentAt,
      title: inbound
        ? `${patientRow.firstName} ${m.channel === 'email' ? 'emailed' : m.channel === 'sms' ? 'texted' : 'messaged'}`
        : `${m.sentByName ?? 'Staff'} sent a ${channelLabel.toLowerCase()}`,
      subtitle: channelLabel,
      status: null,
      direction: inbound ? 'in' : 'out',
      href: messagesHref,
      body: m.body,
      agingDays: null,
      authorName: inbound ? `${patientRow.firstName} ${patientRow.lastName}` : m.sentByName,
      channel: m.channel as MessageChannel,
    })
  }

  // Email aggregator — emails that landed in the connected Gmail mailbox
  // and were patient-matched on ingest. Read-only on the timeline; click
  // links to the unified thread view.
  for (const e of emailMessages) {
    const inbound = e.folder !== 'sent'
    events.push({
      id: `email_${e.id}`,
      kind: 'message',
      occurredAt: e.receivedAt,
      title: inbound
        ? `${patientRow.firstName} emailed${e.subject ? `: ${e.subject}` : ''}`
        : `Staff emailed${e.subject ? `: ${e.subject}` : ''}`,
      subtitle: 'Email',
      status: null,
      direction: inbound ? 'in' : 'out',
      href: messagesHref,
      body: e.bodyText ?? e.snippet ?? null,
      agingDays: null,
      authorName: inbound ? (e.fromName ?? e.fromEmail) : null,
      channel: 'email',
    })
  }

  for (const n of notes) {
    events.push({
      id: `note_${n.id}`,
      kind: 'note',
      occurredAt: n.createdAt,
      title: 'Note',
      subtitle: n.authorName ?? null,
      status: null,
      direction: null,
      href: null,
      body: n.body,
      agingDays: null,
      authorName: n.authorName,
    })
  }

  // Shop orders — "2× Whitening Kit — $89 · paid". Links to the orders admin.
  for (const o of shopOrders) {
    const items = orderItemsByOrder.get(o.id) ?? []
    const summary = items.length > 0 ? items.join(', ') : 'Shop order'
    const paid = o.status === 'paid'
    events.push({
      id: `order_${o.id}`,
      kind: 'shop_order',
      occurredAt: paid && o.paidAt ? o.paidAt : o.createdAt,
      title: `${summary} — ${dollars(o.totalCents)}`,
      subtitle: paid ? 'Paid' : o.status === 'pending' ? 'Pending payment' : o.status,
      status: o.status,
      direction: null,
      href: '/shop/orders',
      body: null,
      agingDays: null,
    })
  }

  // Membership lifecycle — joined / past-due / cancelled.
  for (const m of memberships) {
    const cancelled = m.status === 'cancelled'
    const occurredAt = cancelled && m.cancelledAt ? m.cancelledAt : (m.startedAt ?? m.createdAt)
    const verb =
      m.status === 'cancelled'
        ? 'Cancelled'
        : m.status === 'past_due'
          ? 'Past due on'
          : m.status === 'pending'
            ? 'Started joining'
            : 'Joined'
    events.push({
      id: `mem_${m.id}`,
      kind: 'membership',
      occurredAt,
      title: `${verb} ${m.planName}`,
      subtitle: 'Membership',
      status: m.status,
      direction: null,
      href: '/shop/memberships',
      body: null,
      agingDays: null,
    })
  }

  // Online balance payments — "Paid $120 toward balance online".
  for (const p of balancePayments) {
    const paid = p.status === 'paid'
    events.push({
      id: `bp_${p.id}`,
      kind: 'balance_payment',
      occurredAt: paid && p.paidAt ? p.paidAt : p.createdAt,
      title: paid
        ? `Paid ${dollars(p.amountCents)} toward balance online`
        : `${dollars(p.amountCents)} balance payment — ${p.status}`,
      subtitle: 'Online payment',
      status: p.status,
      direction: null,
      href: '/shop/payments',
      body: null,
      agingDays: null,
    })
  }

  // Completed reviews — "Left a 5★ review".
  for (const r of reviews) {
    if (!r.completedAt) continue
    const stars = r.rating ? `${r.rating}★ ` : ''
    events.push({
      id: `review_${r.id}`,
      kind: 'review',
      occurredAt: r.completedAt,
      title: `Left a ${stars}review`,
      subtitle: r.selectedSite ? `via ${r.selectedSite}` : 'Review',
      status: null,
      direction: null,
      href: '/reviews/received',
      body: r.reviewText,
      agingDays: null,
    })
  }

  // Synthetic "patient added" entry as the floor of the timeline.
  const createdAt = patientRow.firstSeenAt ?? patientRow.createdAt
  events.push({
    id: `created_${patientRow.id}`,
    kind: 'created',
    occurredAt: createdAt,
    title: 'Patient added',
    subtitle: patientRow.source ? `Source: ${patientRow.source.replace(/_/g, ' ')}` : null,
    status: null,
    direction: null,
    href: null,
    body: null,
    agingDays: null,
  })

  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  return events
}

export interface TimelineCounts {
  all: number
  appointments: number
  messages: number
  forms: number
  billing: number
  notes: number
}

/** The timeline kinds that roll up under the "Billing" filter tab — every
 *  money-shaped event (legacy invoices + the real commerce sources). Keep this
 *  in sync with BILLING_KINDS in the patient-detail filter. */
export const BILLING_TIMELINE_KINDS: TimelineKind[] = [
  'invoice',
  'shop_order',
  'balance_payment',
  'membership',
]

export function countTimeline(events: TimelineEvent[]): TimelineCounts {
  const counts: TimelineCounts = { all: 0, appointments: 0, messages: 0, forms: 0, billing: 0, notes: 0 }
  const billing = new Set<TimelineKind>(BILLING_TIMELINE_KINDS)
  for (const e of events) {
    counts.all += 1
    if (e.kind === 'appointment') counts.appointments += 1
    else if (e.kind === 'message') counts.messages += 1
    else if (e.kind === 'form_submission') counts.forms += 1
    else if (e.kind === 'note') counts.notes += 1
    else if (billing.has(e.kind)) counts.billing += 1
    // 'review' + 'created' have no dedicated tab — they show under "All" only.
  }
  return counts
}

