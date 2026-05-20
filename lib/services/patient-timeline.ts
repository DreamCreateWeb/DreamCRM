import 'server-only'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export type TimelineKind =
  | 'appointment'
  | 'message'
  | 'form_submission'
  | 'invoice'
  | 'note'
  | 'created'

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

  const [appts, msgs, subs, invs, notes] = await Promise.all([
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
  ])

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
      href: '/calendar',
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
      href: '/intake-forms',
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
      href: '/messages',
      body: m.body,
      agingDays: null,
      authorName: fromPatient ? `${patientRow.firstName} ${patientRow.lastName}` : m.authorName,
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

export function countTimeline(events: TimelineEvent[]): TimelineCounts {
  const counts: TimelineCounts = { all: 0, appointments: 0, messages: 0, forms: 0, billing: 0, notes: 0 }
  for (const e of events) {
    counts.all += 1
    if (e.kind === 'appointment') counts.appointments += 1
    else if (e.kind === 'message') counts.messages += 1
    else if (e.kind === 'form_submission') counts.forms += 1
    else if (e.kind === 'invoice') counts.billing += 1
    else if (e.kind === 'note') counts.notes += 1
  }
  return counts
}

