import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

/**
 * Early-access demand capture for the roadmap PMSs (Dentrix Ascend/desktop,
 * Eaglesoft, Curve). A clinic that runs one of those can't connect it yet —
 * the honest catalog says so — but it CAN raise its hand. We record who wants
 * which PMS so the founder prioritizes the vendor partnerships that unblock
 * the most practices, and emails each waiting clinic the day their PMS ships.
 *
 * This is the honest, shippable version of "get the other PMS integrations":
 * no fabricated sync, a real signal that turns "coming soon" tiles into a
 * prioritized pipeline. All server-only.
 */

/** The roadmap providers a clinic can register interest in (never open_dental
 *  — that's live — or demo). Kept in sync with the catalog `pms` entries. */
export const REQUESTABLE_PMS = ['dentrix_ascend', 'dentrix_desktop', 'eaglesoft', 'curve'] as const
export type RequestablePmsId = (typeof REQUESTABLE_PMS)[number]

export function isRequestablePms(id: string): id is RequestablePmsId {
  return (REQUESTABLE_PMS as readonly string[]).includes(id)
}

/**
 * Record a clinic's interest in a roadmap PMS. Idempotent per (org, provider)
 * — re-requesting refreshes the notify email but never duplicates or resets
 * an already-sent notification. Returns the total count of clinics waiting on
 * this PMS, so the UI can say "you + 11 other practices are waiting."
 */
export async function recordPmsInterest(input: {
  organizationId: string
  provider: RequestablePmsId
  requestedByUserId?: string | null
  notifyEmail?: string | null
}): Promise<{ ok: true; waiting: number }> {
  await db
    .insert(schema.pmsInterest)
    .values({
      id: newId('pmsint'),
      organizationId: input.organizationId,
      provider: input.provider,
      requestedByUserId: input.requestedByUserId ?? null,
      notifyEmail: input.notifyEmail?.trim().toLowerCase() || null,
    })
    .onConflictDoUpdate({
      target: [schema.pmsInterest.organizationId, schema.pmsInterest.provider],
      // Only refresh the notify email; NEVER clear notifiedAt (a resend of the
      // request must not re-arm an already-sent "it's live" email).
      set: { notifyEmail: input.notifyEmail?.trim().toLowerCase() || null },
    })
  const waiting = await countPmsInterest(input.provider)
  return { ok: true, waiting }
}

/** The set of roadmap providers this org has already requested — for the UI
 *  to render "Requested ✓" instead of the button. */
export async function getRequestedPms(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ provider: schema.pmsInterest.provider })
    .from(schema.pmsInterest)
    .where(eq(schema.pmsInterest.organizationId, organizationId))
  return new Set(rows.map((r) => r.provider))
}

/** How many distinct clinics are waiting on a given PMS. */
export async function countPmsInterest(provider: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.pmsInterest)
    .where(eq(schema.pmsInterest.provider, provider))
  return row?.c ?? 0
}

export interface PmsDemandRow {
  provider: string
  waiting: number
  /** Still un-notified (the actionable backlog when the PMS ships). */
  pending: number
}

/** Platform-admin view: demand per roadmap PMS, most-wanted first. Drives the
 *  founder's partnership prioritization. */
export async function getPmsDemand(): Promise<PmsDemandRow[]> {
  const rows = await db
    .select({
      provider: schema.pmsInterest.provider,
      waiting: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${schema.pmsInterest.notifiedAt} is null)::int`,
    })
    .from(schema.pmsInterest)
    .groupBy(schema.pmsInterest.provider)
    .orderBy(desc(sql`count(*)`))
  return rows.map((r) => ({ provider: r.provider, waiting: r.waiting, pending: r.pending }))
}

/** The un-notified requests for a provider — the list the founder emails the
 *  day that PMS goes live (then stamps notifiedAt). */
export async function listPendingPmsInterest(provider: string): Promise<
  Array<{ id: string; organizationId: string; notifyEmail: string | null }>
> {
  return db
    .select({
      id: schema.pmsInterest.id,
      organizationId: schema.pmsInterest.organizationId,
      notifyEmail: schema.pmsInterest.notifyEmail,
    })
    .from(schema.pmsInterest)
    .where(and(eq(schema.pmsInterest.provider, provider), isNull(schema.pmsInterest.notifiedAt)))
}
