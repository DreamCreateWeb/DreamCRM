import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  MAX_FOLLOWUP_TITLE_LEN,
  todayYmd,
  type FollowupStatus,
  type PatientFollowupView,
} from '@/lib/types/followups'

export type { PatientFollowupView }

/**
 * Patient follow-ups — staff reminders attached to a patient. Org-scoped reads/
 * writes, patient ownership verified before a create, soft via a status flip
 * (kept for audit, not hard-deleted unless asked). Surfaces on the Overview
 * morning huddle, the patient detail panel, and the /followups cockpit list.
 */

function newId(): string {
  return `pfu_${randomBytes(10).toString('hex')}`
}
function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLLOWUP_TITLE_LEN)
}
/** Accept only a well-formed YYYY-MM-DD; anything else → null ("someday"). */
function cleanDueDate(due: string | null | undefined): string | null {
  if (!due) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null
}

const SELECT_SHAPE = {
  id: schema.patientFollowup.id,
  patientId: schema.patientFollowup.patientId,
  patientFirst: schema.patient.firstName,
  patientLast: schema.patient.lastName,
  title: schema.patientFollowup.title,
  dueDate: schema.patientFollowup.dueDate,
  assignedUserId: schema.patientFollowup.assignedUserId,
  assigneeName: schema.user.name,
  status: schema.patientFollowup.status,
  completedAt: schema.patientFollowup.completedAt,
  createdAt: schema.patientFollowup.createdAt,
}

function toView(r: {
  id: string
  patientId: string
  patientFirst: string
  patientLast: string
  title: string
  dueDate: string | null
  assignedUserId: string | null
  assigneeName: string | null
  status: string
  completedAt: Date | null
  createdAt: Date
  createdByName?: string | null
}): PatientFollowupView {
  return {
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.patientFirst} ${r.patientLast}`.trim(),
    title: r.title,
    dueDate: r.dueDate,
    assignedUserId: r.assignedUserId,
    assigneeName: r.assigneeName,
    status: r.status as FollowupStatus,
    createdByName: r.createdByName ?? null,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }
}

/** Staff who can be assigned a follow-up (everyone in the org except patients). */
export async function listAssignableStaff(organizationId: string): Promise<Array<{ userId: string; name: string }>> {
  const rows = await db
    .select({ userId: schema.member.userId, name: schema.user.name })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, organizationId), ne(schema.member.role, 'patient')))
    .orderBy(asc(schema.user.name))
  return rows.map((r) => ({ userId: r.userId, name: r.name ?? 'Teammate' }))
}

/** Open + recently-completed follow-ups for one patient (detail panel). Open
 *  first, ordered by due date (no-due last), then a few recent done ones. */
export async function listFollowupsForPatient(
  organizationId: string,
  patientId: string,
): Promise<PatientFollowupView[]> {
  const rows = await db
    .select(SELECT_SHAPE)
    .from(schema.patientFollowup)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.patientFollowup.patientId))
    .leftJoin(schema.user, eq(schema.user.id, schema.patientFollowup.assignedUserId))
    .where(
      and(
        eq(schema.patientFollowup.organizationId, organizationId),
        eq(schema.patientFollowup.patientId, patientId),
      ),
    )
    .orderBy(
      // open before done
      asc(schema.patientFollowup.status),
      // due date asc, nulls last (coalesce to a far-future sentinel)
      asc(sql`coalesce(${schema.patientFollowup.dueDate}, '9999-12-31')`),
      desc(schema.patientFollowup.createdAt),
    )
  return rows.map(toView)
}

export interface OpenFollowupFilters {
  assignedTo?: string // a userId, or 'unassigned'
  due?: 'overdue' | 'today' | 'upcoming'
  includeDone?: boolean
}

/** The /followups cockpit list — open follow-ups across the clinic, joined with
 *  patient + assignee names. Filtered by assignee / due bucket. */
export async function listOpenFollowups(
  organizationId: string,
  filters: OpenFollowupFilters = {},
  now: Date = new Date(),
): Promise<PatientFollowupView[]> {
  const today = todayYmd(now)
  const where = [eq(schema.patientFollowup.organizationId, organizationId)]
  if (!filters.includeDone) where.push(eq(schema.patientFollowup.status, 'open'))
  if (filters.assignedTo === 'unassigned') {
    where.push(sql`${schema.patientFollowup.assignedUserId} is null`)
  } else if (filters.assignedTo) {
    where.push(eq(schema.patientFollowup.assignedUserId, filters.assignedTo))
  }
  if (filters.due === 'overdue') {
    where.push(sql`${schema.patientFollowup.dueDate} is not null and ${schema.patientFollowup.dueDate} < ${today}`)
  } else if (filters.due === 'today') {
    where.push(sql`${schema.patientFollowup.dueDate} = ${today}`)
  } else if (filters.due === 'upcoming') {
    where.push(sql`${schema.patientFollowup.dueDate} is not null and ${schema.patientFollowup.dueDate} > ${today}`)
  }

  const rows = await db
    .select(SELECT_SHAPE)
    .from(schema.patientFollowup)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.patientFollowup.patientId))
    .leftJoin(schema.user, eq(schema.user.id, schema.patientFollowup.assignedUserId))
    .where(and(...where))
    .orderBy(
      asc(schema.patientFollowup.status),
      asc(sql`coalesce(${schema.patientFollowup.dueDate}, '9999-12-31')`),
      desc(schema.patientFollowup.createdAt),
    )
    .limit(500)
  return rows.map(toView)
}

export interface FollowupSummary {
  openTotal: number
  overdue: number
  dueToday: number
  /** A few most-urgent open ones for the Overview card preview. */
  preview: PatientFollowupView[]
}

/** Counts + a small preview for the Overview morning-huddle card + nav badge. */
export async function getFollowupSummary(
  organizationId: string,
  now: Date = new Date(),
): Promise<FollowupSummary> {
  const today = todayYmd(now)
  const [counts] = await db
    .select({
      openTotal: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${schema.patientFollowup.dueDate} is not null and ${schema.patientFollowup.dueDate} < ${today})::int`,
      dueToday: sql<number>`count(*) filter (where ${schema.patientFollowup.dueDate} = ${today})::int`,
    })
    .from(schema.patientFollowup)
    .where(
      and(
        eq(schema.patientFollowup.organizationId, organizationId),
        eq(schema.patientFollowup.status, 'open'),
      ),
    )
  // Preview: the most-urgent open items (overdue + today first via the
  // coalesce-sorted due date).
  const preview = await db
    .select(SELECT_SHAPE)
    .from(schema.patientFollowup)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.patientFollowup.patientId))
    .leftJoin(schema.user, eq(schema.user.id, schema.patientFollowup.assignedUserId))
    .where(
      and(
        eq(schema.patientFollowup.organizationId, organizationId),
        eq(schema.patientFollowup.status, 'open'),
      ),
    )
    .orderBy(asc(sql`coalesce(${schema.patientFollowup.dueDate}, '9999-12-31')`), desc(schema.patientFollowup.createdAt))
    .limit(4)
  return {
    openTotal: Number(counts?.openTotal ?? 0),
    overdue: Number(counts?.overdue ?? 0),
    dueToday: Number(counts?.dueToday ?? 0),
    preview: preview.map(toView),
  }
}

export interface CreateFollowupInput {
  organizationId: string
  patientId: string
  title: string
  dueDate?: string | null
  assignedUserId?: string | null
  sourceAppointmentId?: string | null
}

/** Create a follow-up. Verifies the patient is in the org first. Returns the
 *  created view (assignee name resolved). */
export async function createFollowup(
  input: CreateFollowupInput,
  userId: string | null,
): Promise<PatientFollowupView> {
  const title = cleanTitle(input.title)
  if (!title) throw new Error('Give the follow-up a title.')

  const [owner] = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, input.patientId), eq(schema.patient.organizationId, input.organizationId)))
    .limit(1)
  if (!owner) throw new Error('Patient not found in this organization')

  const dueDate = cleanDueDate(input.dueDate)
  const assignedUserId = input.assignedUserId || null
  const id = newId()
  const createdAt = new Date()
  await db.insert(schema.patientFollowup).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    title,
    dueDate,
    assignedUserId,
    status: 'open',
    createdBy: userId,
    sourceAppointmentId: input.sourceAppointmentId ?? null,
    createdAt,
  })

  let assigneeName: string | null = null
  if (assignedUserId) {
    const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, assignedUserId)).limit(1)
    assigneeName = u?.name ?? null
  }
  return {
    id,
    patientId: input.patientId,
    patientName: `${owner.firstName} ${owner.lastName}`.trim(),
    title,
    dueDate,
    assignedUserId,
    assigneeName,
    status: 'open',
    createdByName: null,
    completedAt: null,
    createdAt,
  }
}

/**
 * Create the same follow-up for many patients at once (the patients-list bulk
 * action / "follow-up everyone in this view"). Filters the ids to ones actually
 * in the org, caps the batch, and inserts in one statement. Returns how many
 * were created.
 */
export async function bulkCreateFollowups(
  organizationId: string,
  patientIds: string[],
  input: { title: string; dueDate?: string | null; assignedUserId?: string | null },
  userId: string | null,
): Promise<{ created: number }> {
  const title = cleanTitle(input.title)
  if (!title) throw new Error('Give the follow-up a title.')
  if (patientIds.length === 0) return { created: 0 }

  const owned = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, patientIds)))
  const ownedIds = owned.map((r) => r.id).slice(0, 1000)
  if (ownedIds.length === 0) return { created: 0 }

  const dueDate = cleanDueDate(input.dueDate)
  const assignedUserId = input.assignedUserId || null
  await db.insert(schema.patientFollowup).values(
    ownedIds.map((patientId) => ({
      id: newId(),
      organizationId,
      patientId,
      title,
      dueDate,
      assignedUserId,
      status: 'open',
      createdBy: userId,
    })),
  )
  return { created: ownedIds.length }
}

export async function updateFollowup(
  organizationId: string,
  id: string,
  patch: { title?: string; dueDate?: string | null; assignedUserId?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) {
    const t = cleanTitle(patch.title)
    if (!t) throw new Error('Give the follow-up a title.')
    set.title = t
  }
  if (patch.dueDate !== undefined) set.dueDate = cleanDueDate(patch.dueDate)
  if (patch.assignedUserId !== undefined) set.assignedUserId = patch.assignedUserId || null
  await db
    .update(schema.patientFollowup)
    .set(set)
    .where(and(eq(schema.patientFollowup.id, id), eq(schema.patientFollowup.organizationId, organizationId)))
}

export async function completeFollowup(organizationId: string, id: string, userId: string | null): Promise<void> {
  await db
    .update(schema.patientFollowup)
    .set({ status: 'done', completedAt: new Date(), completedBy: userId, updatedAt: new Date() })
    .where(and(eq(schema.patientFollowup.id, id), eq(schema.patientFollowup.organizationId, organizationId)))
}

export async function reopenFollowup(organizationId: string, id: string): Promise<void> {
  await db
    .update(schema.patientFollowup)
    .set({ status: 'open', completedAt: null, completedBy: null, updatedAt: new Date() })
    .where(and(eq(schema.patientFollowup.id, id), eq(schema.patientFollowup.organizationId, organizationId)))
}

export async function deleteFollowup(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.patientFollowup)
    .where(and(eq(schema.patientFollowup.id, id), eq(schema.patientFollowup.organizationId, organizationId)))
}

/**
 * Best-effort auto-create a "rebook" follow-up when an appointment is marked a
 * no-show — only if one for that appointment doesn't already exist (idempotent
 * on re-mark). Never throws into the caller.
 */
export async function autoCreateRebookFollowup(
  organizationId: string,
  patientId: string,
  patientName: string,
  appointmentId: string,
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: schema.patientFollowup.id })
      .from(schema.patientFollowup)
      .where(
        and(
          eq(schema.patientFollowup.organizationId, organizationId),
          eq(schema.patientFollowup.sourceAppointmentId, appointmentId),
        ),
      )
      .limit(1)
    if (existing) return
    await db.insert(schema.patientFollowup).values({
      id: newId(),
      organizationId,
      patientId,
      title: `Rebook ${patientName} after no-show`,
      // Due tomorrow — give the front desk a day to reach out.
      dueDate: todayYmd(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      status: 'open',
      createdBy: null,
      sourceAppointmentId: appointmentId,
    })
  } catch (err) {
    console.warn('[autoCreateRebookFollowup] failed', err)
  }
}
