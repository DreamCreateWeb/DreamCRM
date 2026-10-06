import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { pmsConnectRequestMessage, type PmsConnectInput, type PmsConnectStatus } from '@/lib/pms-connect'

/**
 * THE PMS CONNECT REQUEST — the server half (docs/ACTIVATION.md S4). One
 * row per clinic; a re-submit updates the details and re-opens a closed
 * request, never a second row. The request is also WRITTEN INTO THE
 * CLINIC'S SUPPORT THREAD as a clinic-authored message, which is what
 * tells the platform: the support rail already notifies every platform
 * admin (`support_message`, urgent) and lists the clinic in Client
 * Messaging, so "you'll hear from Dustin within a day" rides a channel he
 * already reads rather than a new inbox. The thread post is best-effort:
 * a failed post never loses the request row, which the first-week cockpit
 * reads as "pending on us".
 */

export interface PmsConnectRequestView {
  id: string
  vendor: string
  vendorName: string | null
  practiceNameInPms: string | null
  contactName: string
  contactEmail: string
  contactPhone: string | null
  bestTime: string | null
  notes: string | null
  status: PmsConnectStatus
  createdAt: Date
  updatedAt: Date
}

function toView(r: typeof schema.pmsConnectRequest.$inferSelect): PmsConnectRequestView {
  return {
    id: r.id,
    vendor: r.vendor,
    vendorName: r.vendorName,
    practiceNameInPms: r.practiceNameInPms,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    bestTime: r.bestTime,
    notes: r.notes,
    status: (['requested', 'scheduled', 'connected', 'closed'] as const).includes(r.status as PmsConnectStatus)
      ? (r.status as PmsConnectStatus)
      : 'requested',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export async function getPmsConnectRequest(organizationId: string): Promise<PmsConnectRequestView | null> {
  const [row] = await db
    .select()
    .from(schema.pmsConnectRequest)
    .where(eq(schema.pmsConnectRequest.organizationId, organizationId))
    .limit(1)
  return row ? toView(row) : null
}

/**
 * Upsert the clinic's request and tell the platform through the support
 * thread. `clinicName` is for the message; `userId` is the requester (and
 * the author of the support post, so the platform sees a person, not a
 * system).
 */
export async function submitPmsConnectRequest(args: {
  organizationId: string
  userId: string
  clinicName: string
  input: PmsConnectInput
  now?: Date
}): Promise<PmsConnectRequestView> {
  const now = args.now ?? new Date()
  const values = {
    vendor: args.input.vendor,
    vendorName: args.input.vendorName ?? null,
    practiceNameInPms: args.input.practiceNameInPms ?? null,
    contactName: args.input.contactName,
    contactEmail: args.input.contactEmail,
    contactPhone: args.input.contactPhone ?? null,
    bestTime: args.input.bestTime ?? null,
    notes: args.input.notes ?? null,
  }
  const [row] = await db
    .insert(schema.pmsConnectRequest)
    .values({
      id: newId('pmsreq'),
      organizationId: args.organizationId,
      ...values,
      status: 'requested',
      requestedByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.pmsConnectRequest.organizationId,
      // A re-submit refreshes the details and re-opens the request; a
      // connected one stays connected (the connection row is the truth).
      set: {
        ...values,
        status: sql_reopen(),
        requestedByUserId: args.userId,
        updatedAt: now,
      },
    })
    .returning()

  try {
    const { getSupportThread, postMessage } = await import('@/lib/services/messages')
    const thread = await getSupportThread(args.organizationId, args.userId)
    await postMessage({ conversationId: thread.conversationId, body: pmsConnectRequestMessage(args.input, args.clinicName) }, args.userId)
  } catch (e) {
    console.error('[pms-connect] support post failed (request kept):', e)
  }
  return toView(row)
}

/** `status` on re-submit: a connected request stays connected; anything else re-opens. */
function sql_reopen() {
  return sql`case when ${schema.pmsConnectRequest.status} = 'connected' then 'connected' else 'requested' end`
}

/** The platform's answer. */
export async function setPmsConnectRequestStatus(organizationId: string, status: PmsConnectStatus, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(schema.pmsConnectRequest)
    .set({ status, updatedAt: now })
    .where(eq(schema.pmsConnectRequest.organizationId, organizationId))
    .returning({ id: schema.pmsConnectRequest.id })
  return rows.length > 0
}
