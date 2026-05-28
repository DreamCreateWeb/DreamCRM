import 'server-only'
import { createHash, randomUUID } from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import type { PmsConnection } from '@/lib/db/schema/clinic'
import { OpenDentalProvider } from './open-dental'
import { DemoProvider } from './demo'
import { getPmsConnection } from './connection'
import type {
  CommLogDirection,
  CommLogMode,
  NormalizedAppointment,
  NormalizedPatient,
  NormalizedProvider,
  NormalizedRecall,
  PmsProviderClient,
} from './provider'

const VALID_ROLES = ['dentist', 'hygienist', 'assistant', 'specialist', 'admin']

export function getProviderClient(connection: PmsConnection): PmsProviderClient {
  if (connection.provider === 'demo') return new DemoProvider(connection.organizationId)
  if (connection.provider === 'open_dental') {
    if (!connection.customerKeyEncrypted) throw new Error('No Open Dental Customer Key on file — reconnect.')
    const meta = (connection.meta ?? {}) as Record<string, unknown>
    return new OpenDentalProvider(decryptSecret(connection.customerKeyEncrypted), {
      timeZone: typeof meta.timeZone === 'string' ? meta.timeZone : undefined,
      defaultOperatoryNum: typeof meta.defaultOperatoryNum === 'number' ? meta.defaultOperatoryNum : undefined,
    })
  }
  throw new Error(`The ${connection.provider} integration isn’t available yet.`)
}

type Tally = { created: number; updated: number; skipped: number }
const tally = (): Tally => ({ created: 0, updated: 0, skipped: 0 })

function hash(parts: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex')
}

interface MapRow {
  id: string
  internalId: string
  contentHash: string | null
}

async function loadMap(organizationId: string, entityType: string): Promise<Map<string, MapRow>> {
  const rows = await db
    .select({
      id: schema.pmsEntityMap.id,
      externalId: schema.pmsEntityMap.externalId,
      internalId: schema.pmsEntityMap.internalId,
      contentHash: schema.pmsEntityMap.contentHash,
    })
    .from(schema.pmsEntityMap)
    .where(and(eq(schema.pmsEntityMap.organizationId, organizationId), eq(schema.pmsEntityMap.entityType, entityType)))
  return new Map(rows.map((r) => [r.externalId, { id: r.id, internalId: r.internalId, contentHash: r.contentHash }]))
}

async function insertMap(
  organizationId: string,
  entityType: string,
  externalId: string,
  internalId: string,
  origin: 'pms' | 'dreamcrm',
  contentHash: string | null,
): Promise<string> {
  const id = randomUUID()
  await db
    .insert(schema.pmsEntityMap)
    .values({ id, organizationId, entityType, externalId, internalId, origin, contentHash, lastSyncedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.pmsEntityMap.organizationId, schema.pmsEntityMap.entityType, schema.pmsEntityMap.externalId],
      set: { internalId, contentHash, lastSyncedAt: new Date(), updatedAt: new Date() },
    })
  return id
}

async function touchMap(mapId: string, contentHash: string | null) {
  await db
    .update(schema.pmsEntityMap)
    .set({ contentHash, lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.pmsEntityMap.id, mapId))
}

async function mapInternalToExternal(organizationId: string, entityType: string, internalId: string): Promise<string | null> {
  const [row] = await db
    .select({ externalId: schema.pmsEntityMap.externalId })
    .from(schema.pmsEntityMap)
    .where(
      and(
        eq(schema.pmsEntityMap.organizationId, organizationId),
        eq(schema.pmsEntityMap.entityType, entityType),
        eq(schema.pmsEntityMap.internalId, internalId),
      ),
    )
    .limit(1)
  return row?.externalId ?? null
}

// ── Inbound import (PMS → DreamCRM) ─────────────────────────────────────────

export interface SyncResult {
  runId: string
  status: 'success' | 'partial' | 'error'
  counts: Record<string, Tally>
  error: string | null
}

export async function runImport(
  organizationId: string,
  opts: { trigger?: 'manual' | 'scheduled' | 'initial'; triggeredByUserId?: string | null } = {},
): Promise<SyncResult> {
  const connection = await getPmsConnection(organizationId)
  if (!connection || connection.status !== 'connected') throw new Error('No PMS is connected.')
  const client = getProviderClient(connection)

  // Appointment delta high-water (DateTStamp). Captured at run start so the
  // next run picks up anything changed during this one; only advanced on a
  // non-error run so a failure re-reads the same window.
  const meta = (connection.meta ?? {}) as Record<string, unknown>
  const since = typeof meta.highWaterAppointments === 'string' ? new Date(meta.highWaterAppointments) : undefined
  const runStart = new Date()

  const runId = randomUUID()
  await db.insert(schema.pmsSyncRun).values({
    id: runId,
    organizationId,
    trigger: opts.trigger ?? 'manual',
    status: 'running',
    triggeredByUserId: opts.triggeredByUserId ?? null,
  })

  const counts: Record<string, Tally> = { providers: tally(), patients: tally(), appointments: tally(), recalls: tally() }
  let error: string | null = null

  try {
    // Flush queued write-backs first so the PMS reflects bookings we originated
    // before we read everything back.
    if (connection.syncDirection === 'two_way') await retryPendingWrites(organizationId, client)

    await reconcileProviders(organizationId, await client.listProviders(), counts.providers)
    await reconcilePatients(organizationId, await client.listPatients(), counts.patients)
    await reconcileAppointments(organizationId, await client.listAppointments({ since }), counts.appointments)
    await reconcileRecalls(organizationId, await client.listRecalls(), counts.recalls)
  } catch (e) {
    error = (e as Error).message
  }

  const touched = Object.values(counts).some((t) => t.created + t.updated + t.skipped > 0)
  const status: SyncResult['status'] = error ? (touched ? 'partial' : 'error') : 'success'
  const now = new Date()
  await db.update(schema.pmsSyncRun).set({ status, finishedAt: now, counts, error }).where(eq(schema.pmsSyncRun.id, runId))
  await db
    .update(schema.pmsConnection)
    .set({
      lastSyncAt: now,
      lastSyncStatus: status,
      lastError: error,
      // Advance the appointment high-water only on a clean/partial run.
      ...(status === 'error' ? {} : { meta: { ...meta, highWaterAppointments: runStart.toISOString() } }),
      updatedAt: now,
    })
    .where(eq(schema.pmsConnection.organizationId, organizationId))

  return { runId, status, counts, error }
}

async function reconcileProviders(organizationId: string, rows: NormalizedProvider[], t: Tally) {
  const map = await loadMap(organizationId, 'provider')
  for (const np of rows) {
    const role = VALID_ROLES.includes(np.role ?? '') ? (np.role as string) : 'dentist'
    const existing = map.get(np.externalId)
    if (existing) {
      await db
        .update(schema.clinicProvider)
        .set({ displayName: np.displayName, role, updatedAt: new Date() })
        .where(eq(schema.clinicProvider.id, existing.internalId))
      t.updated++
    } else {
      const id = randomUUID()
      await db.insert(schema.clinicProvider).values({ id, organizationId, displayName: np.displayName, role })
      await insertMap(organizationId, 'provider', np.externalId, id, 'pms', null)
      t.created++
    }
  }
}

async function findUnmappedPatientByContact(
  organizationId: string,
  mappedInternalIds: Set<string>,
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<string | null> {
  const conds = []
  if (email) conds.push(eq(schema.patient.email, email))
  if (phone) conds.push(eq(schema.patient.phone, phone))
  if (conds.length === 0) return null
  const candidates = await db
    .select({ id: schema.patient.id, email: schema.patient.email, phone: schema.patient.phone })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.isActive, 1)))
  // Manual OR + unmapped check (kept simple; first sync of a large office is a
  // one-time background job — preloaded maps avoid N map lookups).
  for (const c of candidates) {
    if (mappedInternalIds.has(c.id)) continue
    if ((email && c.email === email) || (phone && c.phone === phone)) return c.id
  }
  return null
}

async function reconcilePatients(organizationId: string, rows: NormalizedPatient[], t: Tally) {
  const map = await loadMap(organizationId, 'patient')
  const mappedInternalIds = new Set(Array.from(map.values()).map((m) => m.internalId))

  for (const np of rows) {
    const profileHash = hash([np.firstName, np.lastName, np.dateOfBirth, np.email, np.phone, np.addressLine1, np.city, np.state, np.postalCode])
    const existing = map.get(np.externalId)

    if (existing) {
      const [row] = await db
        .select()
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, existing.internalId)))
        .limit(1)
      if (!row) {
        // Map points at a deleted row → recreate.
        const id = await createImportedPatient(organizationId, np)
        await touchMapInternal(existing.id, id, profileHash)
        mappedInternalIds.add(id)
        t.created++
        continue
      }
      const balanceChanged = (row.pmsBalanceCents ?? null) !== (np.balanceCents ?? null)
      if (existing.contentHash === profileHash && !balanceChanged) {
        await touchMap(existing.id, profileHash)
        t.skipped++
      } else {
        await db
          .update(schema.patient)
          .set({
            firstName: np.firstName || row.firstName,
            lastName: np.lastName || row.lastName,
            dateOfBirth: np.dateOfBirth ?? row.dateOfBirth,
            email: np.email ?? row.email,
            phone: np.phone ?? row.phone,
            addressLine1: np.addressLine1 ?? row.addressLine1,
            city: np.city ?? row.city,
            state: np.state ?? row.state,
            postalCode: np.postalCode ?? row.postalCode,
            pmsBalanceCents: np.balanceCents ?? null,
            pmsBalanceUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.patient.id, existing.internalId))
        await touchMap(existing.id, profileHash)
        t.updated++
      }
      continue
    }

    // No map yet — try to link an existing DreamCRM patient by contact.
    const linkId = await findUnmappedPatientByContact(organizationId, mappedInternalIds, np.email, np.phone)
    if (linkId) {
      await db
        .update(schema.patient)
        .set({
          dateOfBirth: np.dateOfBirth ?? undefined,
          addressLine1: np.addressLine1 ?? undefined,
          city: np.city ?? undefined,
          state: np.state ?? undefined,
          postalCode: np.postalCode ?? undefined,
          pmsBalanceCents: np.balanceCents ?? null,
          pmsBalanceUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.patient.id, linkId))
      await insertMap(organizationId, 'patient', np.externalId, linkId, 'pms', profileHash)
      mappedInternalIds.add(linkId)
      t.updated++
    } else {
      const id = await createImportedPatient(organizationId, np)
      await insertMap(organizationId, 'patient', np.externalId, id, 'pms', profileHash)
      mappedInternalIds.add(id)
      t.created++
    }
  }
}

async function createImportedPatient(organizationId: string, np: NormalizedPatient): Promise<string> {
  const id = randomUUID()
  const now = new Date()
  await db.insert(schema.patient).values({
    id,
    organizationId,
    firstName: np.firstName || 'Unknown',
    lastName: np.lastName || 'Patient',
    dateOfBirth: np.dateOfBirth ?? null,
    email: np.email ?? null,
    phone: np.phone ?? null,
    addressLine1: np.addressLine1 ?? null,
    city: np.city ?? null,
    state: np.state ?? null,
    postalCode: np.postalCode ?? null,
    source: 'pms_import',
    lifecycle: 'active',
    firstSeenAt: now,
    pmsBalanceCents: np.balanceCents ?? null,
    pmsBalanceUpdatedAt: np.balanceCents != null ? now : null,
  })
  return id
}

async function touchMapInternal(mapId: string, internalId: string, contentHash: string | null) {
  await db
    .update(schema.pmsEntityMap)
    .set({ internalId, contentHash, lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.pmsEntityMap.id, mapId))
}

async function reconcileAppointments(organizationId: string, rows: NormalizedAppointment[], t: Tally) {
  const apptMap = await loadMap(organizationId, 'appointment')
  const patMap = await loadMap(organizationId, 'patient')
  const provMap = await loadMap(organizationId, 'provider')
  // Patient names for nice titles on newly-created rows.
  const pats = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
  const nameById = new Map(pats.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]))

  for (const na of rows) {
    const patientInternalId = patMap.get(na.patientExternalId)?.internalId
    if (!patientInternalId) {
      t.skipped++
      continue
    }
    const providerInternalId = na.providerExternalId ? provMap.get(na.providerExternalId)?.internalId ?? null : null
    const h = hash([na.startTime.toISOString(), na.endTime?.toISOString() ?? null, na.status, providerInternalId, na.note])
    const statusFields = appointmentStatusFields(na.status)
    const existing = apptMap.get(na.externalId)

    if (existing) {
      if (existing.contentHash === h) {
        await touchMap(existing.id, h)
        t.skipped++
      } else {
        await db
          .update(schema.appointment)
          .set({
            startTime: na.startTime,
            endTime: na.endTime ?? null,
            status: na.status,
            providerId: providerInternalId,
            notes: na.note ?? null,
            ...statusFields,
            updatedAt: new Date(),
          })
          .where(eq(schema.appointment.id, existing.internalId))
        await touchMap(existing.id, h)
        t.updated++
      }
    } else {
      const id = randomUUID()
      const type = na.type || 'checkup'
      const name = nameById.get(patientInternalId) || 'Patient'
      await db.insert(schema.appointment).values({
        id,
        organizationId,
        patientId: patientInternalId,
        providerId: providerInternalId,
        title: `${type.replace(/_/g, ' ')} — ${name}`,
        startTime: na.startTime,
        endTime: na.endTime ?? null,
        type,
        status: na.status,
        notes: na.note ?? null,
        source: 'pms_import',
        ...statusFields,
      })
      await insertMap(organizationId, 'appointment', na.externalId, id, 'pms', h)
      t.created++
    }
  }
}

function appointmentStatusFields(status: NormalizedAppointment['status']): Record<string, Date | null> {
  if (status === 'completed') return { completedAt: new Date() }
  if (status === 'cancelled') return { cancelledAt: new Date() }
  if (status === 'no_show') return { noShowedAt: new Date() }
  if (status === 'confirmed') return { confirmedAt: new Date() }
  return {}
}

// Recall reconcile — the PMS owns the recall engine. We write each mapped
// patient's soonest active due date onto patient.pmsRecallDueAt, which the
// shared recall-status helper (lib/services/recall-status.ts) prefers over the
// appointment-derived heuristic.
async function reconcileRecalls(organizationId: string, rows: NormalizedRecall[], t: Tally) {
  const byPat = new Map<string, NormalizedRecall>()
  for (const r of rows) {
    if (r.isDisabled || !r.dueDate) continue
    const existing = byPat.get(r.patientExternalId)
    if (!existing || r.dueDate.getTime() < existing.dueDate!.getTime()) {
      byPat.set(r.patientExternalId, r)
    }
  }
  if (byPat.size === 0) return
  const patMap = await loadMap(organizationId, 'patient')
  for (const [patExt, recall] of Array.from(byPat.entries())) {
    const m = patMap.get(patExt)
    if (!m) {
      t.skipped++
      continue
    }
    await db
      .update(schema.patient)
      .set({
        pmsRecallDueAt: recall.dueDate,
        pmsRecallInterval: recall.interval,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, m.internalId)))
    t.updated++
  }
}

// ── Outbound write-back (DreamCRM → PMS, official API only) ──────────────────

/**
 * Queue a DreamCRM-originated appointment to be pushed into the PMS. Cheap +
 * durable (one insert), best-effort (never throws), idempotent. The actual API
 * write happens on the next sync run via retryPendingWrites — so booking never
 * waits on (or fails because of) the PMS. No-op unless a two-way connection
 * exists.
 */
export async function queueAppointmentWriteBack(organizationId: string, appointmentId: string): Promise<void> {
  try {
    const conn = await getPmsConnection(organizationId)
    if (!conn || conn.status !== 'connected' || conn.syncDirection !== 'two_way') return

    const existingMap = await mapInternalToExternal(organizationId, 'appointment', appointmentId)
    if (existingMap) return

    const [op] = await db
      .select({ id: schema.pmsWriteOp.id })
      .from(schema.pmsWriteOp)
      .where(
        and(
          eq(schema.pmsWriteOp.organizationId, organizationId),
          eq(schema.pmsWriteOp.entityType, 'appointment'),
          eq(schema.pmsWriteOp.internalId, appointmentId),
          inArray(schema.pmsWriteOp.status, ['pending', 'success']),
        ),
      )
      .limit(1)
    if (op) return

    await db.insert(schema.pmsWriteOp).values({
      id: randomUUID(),
      organizationId,
      entityType: 'appointment',
      internalId: appointmentId,
      operation: 'create',
      status: 'pending',
      attempts: 0,
    })
  } catch {
    // Best-effort: never block or fail a booking on PMS write-back.
  }
}

/**
 * Queue a status change (cancellation / no-show) to push to the PMS for an
 * appointment that already exists there — so a cancel on our side cancels it in
 * the PMS too (the #1 clinic complaint: reminders to already-cancelled
 * patients). If the appointment was created in DreamCRM but its create-write
 * hasn't flushed yet, supersede that pending create instead, so we never push
 * an appointment that's already cancelled. Best-effort + idempotent; no-op
 * unless two-way connected.
 */
export async function queueAppointmentStatusWriteBack(
  organizationId: string,
  appointmentId: string,
  status: 'cancelled' | 'no_show' | 'completed',
): Promise<void> {
  try {
    const conn = await getPmsConnection(organizationId)
    if (!conn || conn.status !== 'connected' || conn.syncDirection !== 'two_way') return

    const externalId = await mapInternalToExternal(organizationId, 'appointment', appointmentId)
    if (externalId) {
      const [dup] = await db
        .select({ id: schema.pmsWriteOp.id })
        .from(schema.pmsWriteOp)
        .where(
          and(
            eq(schema.pmsWriteOp.organizationId, organizationId),
            eq(schema.pmsWriteOp.entityType, 'appointment'),
            eq(schema.pmsWriteOp.internalId, appointmentId),
            eq(schema.pmsWriteOp.operation, 'update'),
            eq(schema.pmsWriteOp.status, 'pending'),
          ),
        )
        .limit(1)
      if (dup) return
      await db.insert(schema.pmsWriteOp).values({
        id: randomUUID(),
        organizationId,
        entityType: 'appointment',
        internalId: appointmentId,
        operation: 'update',
        status: 'pending',
        attempts: 0,
        requestPayload: { status },
      })
      return
    }

    // Not yet in the PMS — supersede a queued create so we don't push a dead appt.
    if (status === 'cancelled' || status === 'no_show') {
      const [createOp] = await db
        .select({ id: schema.pmsWriteOp.id })
        .from(schema.pmsWriteOp)
        .where(
          and(
            eq(schema.pmsWriteOp.organizationId, organizationId),
            eq(schema.pmsWriteOp.entityType, 'appointment'),
            eq(schema.pmsWriteOp.internalId, appointmentId),
            eq(schema.pmsWriteOp.operation, 'create'),
            eq(schema.pmsWriteOp.status, 'pending'),
          ),
        )
        .limit(1)
      if (createOp) {
        await db
          .update(schema.pmsWriteOp)
          .set({ status: 'skipped', error: 'Superseded by cancellation before sync', completedAt: new Date() })
          .where(eq(schema.pmsWriteOp.id, createOp.id))
      }
    }
  } catch {
    // Best-effort: never block a cancellation on PMS write-back.
  }
}

/**
 * Queue a commlog mirror — every DreamCRM-originated patient message
 * (booking confirmation, reminder, review request, intake send, reply) gets
 * pushed to OD's CommLog so the front desk sees the full comms history in the
 * patient's chart. Top "I wish it did this" from the integrations research;
 * audit-clean (official API, lands in OD's Audit Trail). Best-effort + silent:
 * skipped if not connected, not two-way, or the patient isn't mapped to OD.
 */
export async function queueCommLogWriteBack(
  organizationId: string,
  patientId: string,
  args: {
    note: string
    mode: CommLogMode
    sentOrReceived?: CommLogDirection
    commDateTime?: Date
  },
): Promise<void> {
  try {
    const conn = await getPmsConnection(organizationId)
    if (!conn || conn.status !== 'connected' || conn.syncDirection !== 'two_way') return
    const externalPatientId = await mapInternalToExternal(organizationId, 'patient', patientId)
    if (!externalPatientId) return
    await db.insert(schema.pmsWriteOp).values({
      id: randomUUID(),
      organizationId,
      entityType: 'commlog',
      // Commlogs aren't a DreamCRM-side row, so internalId is synthetic. Keeps
      // the column NOT NULL constraint happy + each enqueue idempotently unique.
      internalId: `commlog_${randomUUID()}`,
      operation: 'create',
      status: 'pending',
      attempts: 0,
      requestPayload: {
        externalPatientId,
        note: args.note,
        mode: args.mode,
        sentOrReceived: args.sentOrReceived ?? 'Sent',
        commDateTime: (args.commDateTime ?? new Date()).toISOString(),
      },
    })
  } catch {
    // Best-effort: never block a comms send on PMS mirroring.
  }
}

const MAX_WRITE_ATTEMPTS = 6

export async function retryPendingWrites(organizationId: string, client: PmsProviderClient): Promise<void> {
  const ops = await db
    .select()
    .from(schema.pmsWriteOp)
    .where(
      and(
        eq(schema.pmsWriteOp.organizationId, organizationId),
        inArray(schema.pmsWriteOp.entityType, ['appointment', 'commlog']),
        inArray(schema.pmsWriteOp.status, ['pending', 'error']),
      ),
    )
    .limit(100)
  for (const op of ops) {
    if (op.attempts >= MAX_WRITE_ATTEMPTS) continue
    if (op.entityType === 'commlog') {
      await processCommLogWriteOp(organizationId, client, op)
    } else if (op.operation === 'update') {
      await processAppointmentUpdateOp(organizationId, client, op)
    } else {
      await processAppointmentWriteOp(organizationId, client, op)
    }
  }
}

async function processCommLogWriteOp(
  _organizationId: string,
  client: PmsProviderClient,
  op: typeof schema.pmsWriteOp.$inferSelect,
) {
  try {
    const payload = op.requestPayload as {
      externalPatientId: string
      note: string
      mode: CommLogMode
      sentOrReceived: CommLogDirection
      commDateTime: string
    } | null
    if (!payload) {
      await failOp(op.id, op.attempts + 1, 'CommLog write-op missing requestPayload')
      return
    }
    await db
      .update(schema.pmsWriteOp)
      .set({ attempts: op.attempts + 1 })
      .where(eq(schema.pmsWriteOp.id, op.id))
    const result = await client.createCommLog({
      externalPatientId: payload.externalPatientId,
      note: payload.note,
      mode: payload.mode,
      sentOrReceived: payload.sentOrReceived,
      commDateTime: new Date(payload.commDateTime),
    })
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', externalId: result.externalId ?? null, error: null, completedAt: new Date() })
      .where(eq(schema.pmsWriteOp.id, op.id))
  } catch (e) {
    await failOp(op.id, op.attempts + 1, (e as Error).message)
  }
}

// Push a cancellation/no-show status change to an already-mapped appointment.
async function processAppointmentUpdateOp(
  organizationId: string,
  client: PmsProviderClient,
  op: typeof schema.pmsWriteOp.$inferSelect,
) {
  try {
    const externalId = await mapInternalToExternal(organizationId, 'appointment', op.internalId)
    if (!externalId) {
      await failOp(op.id, op.attempts + 1, 'Appointment is not linked in the PMS')
      return
    }
    const status = ((op.requestPayload as { status?: string } | null)?.status ?? 'cancelled') as
      | 'cancelled'
      | 'no_show'
      | 'completed'
    await db.update(schema.pmsWriteOp).set({ attempts: op.attempts + 1, externalId }).where(eq(schema.pmsWriteOp.id, op.id))
    await client.updateAppointment(externalId, { status })
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', externalId, error: null, completedAt: new Date() })
      .where(eq(schema.pmsWriteOp.id, op.id))
  } catch (e) {
    await failOp(op.id, op.attempts + 1, (e as Error).message)
  }
}

async function processAppointmentWriteOp(
  organizationId: string,
  client: PmsProviderClient,
  op: typeof schema.pmsWriteOp.$inferSelect,
) {
  try {
    const [appt] = await db
      .select()
      .from(schema.appointment)
      .where(and(eq(schema.appointment.organizationId, organizationId), eq(schema.appointment.id, op.internalId)))
      .limit(1)
    if (!appt) {
      await failOp(op.id, op.attempts, 'Appointment no longer exists')
      return
    }
    const patientExternalId = await ensurePatientExternalId(organizationId, client, appt.patientId)
    if (!patientExternalId) {
      await failOp(op.id, op.attempts, 'Patient could not be created in the PMS yet')
      return
    }
    const providerExternalId = appt.providerId ? await mapInternalToExternal(organizationId, 'provider', appt.providerId) : null

    const auditPayload = {
      patientExternalId,
      startTime: appt.startTime.toISOString(),
      endTime: appt.endTime ? appt.endTime.toISOString() : null,
      providerExternalId,
      note: appt.notes,
    }
    await db
      .update(schema.pmsWriteOp)
      .set({ requestPayload: auditPayload, attempts: op.attempts + 1 })
      .where(eq(schema.pmsWriteOp.id, op.id))

    const res = await client.createAppointment({
      patientExternalId,
      startTime: appt.startTime,
      endTime: appt.endTime,
      providerExternalId,
      note: appt.notes,
    })
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', externalId: res.externalId, responseBody: res.raw ?? null, error: null, completedAt: new Date() })
      .where(eq(schema.pmsWriteOp.id, op.id))
    await insertMap(organizationId, 'appointment', res.externalId, appt.id, 'dreamcrm', null)
  } catch (e) {
    await failOp(op.id, op.attempts + 1, (e as Error).message)
  }
}

/** Returns the patient's PMS external id, pushing + linking the patient (and
 * recording a patient write_op for the audit log) if not already mapped. */
async function ensurePatientExternalId(
  organizationId: string,
  client: PmsProviderClient,
  patientId: string,
): Promise<string | null> {
  const existing = await mapInternalToExternal(organizationId, 'patient', patientId)
  if (existing) return existing

  const [pat] = await db
    .select()
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!pat) return null

  const opId = randomUUID()
  const payload = { firstName: pat.firstName, lastName: pat.lastName, email: pat.email, phone: pat.phone, dateOfBirth: pat.dateOfBirth }
  await db.insert(schema.pmsWriteOp).values({
    id: opId,
    organizationId,
    entityType: 'patient',
    internalId: patientId,
    operation: 'create',
    status: 'pending',
    attempts: 1,
    requestPayload: payload,
  })
  try {
    const res = await client.createPatient({
      firstName: pat.firstName,
      lastName: pat.lastName,
      email: pat.email,
      phone: pat.phone,
      dateOfBirth: pat.dateOfBirth,
    })
    await insertMap(organizationId, 'patient', res.externalId, patientId, 'dreamcrm', null)
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', externalId: res.externalId, responseBody: res.raw ?? null, completedAt: new Date() })
      .where(eq(schema.pmsWriteOp.id, opId))
    return res.externalId
  } catch (e) {
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'error', error: (e as Error).message })
      .where(eq(schema.pmsWriteOp.id, opId))
    return null
  }
}

async function failOp(opId: string, attempts: number, error: string) {
  await db.update(schema.pmsWriteOp).set({ status: 'error', attempts, error }).where(eq(schema.pmsWriteOp.id, opId))
}
