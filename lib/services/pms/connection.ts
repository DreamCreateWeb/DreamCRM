import 'server-only'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { encryptSecret } from '@/lib/crypto'
import type { PmsConnection, PmsSyncRun } from '@/lib/db/schema/clinic'
import type { PmsProviderId, SyncDirection, WriteOpStatus } from '@/lib/types/pms'
import { OpenDentalProvider, openDentalConfigured } from './open-dental'
import type { PmsTestResult } from './provider'

export async function getPmsConnection(organizationId: string): Promise<PmsConnection | null> {
  const [row] = await db
    .select()
    .from(schema.pmsConnection)
    .where(eq(schema.pmsConnection.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

interface UpsertFields {
  provider: PmsProviderId
  status?: 'not_connected' | 'connected' | 'error'
  connectedByUserId?: string | null
  customerKeyEncrypted?: string | null
  syncDirection?: SyncDirection
  autoSyncEnabled?: number
  meta?: Record<string, unknown>
  lastSyncAt?: Date | null
  lastSyncStatus?: string | null
  lastError?: string | null
}

export async function upsertPmsConnection(organizationId: string, fields: UpsertFields): Promise<void> {
  const now = new Date()
  await db
    .insert(schema.pmsConnection)
    .values({
      organizationId,
      provider: fields.provider,
      status: fields.status ?? 'connected',
      connectedByUserId: fields.connectedByUserId ?? null,
      customerKeyEncrypted: fields.customerKeyEncrypted ?? null,
      syncDirection: fields.syncDirection ?? 'two_way',
      autoSyncEnabled: fields.autoSyncEnabled ?? 1,
      meta: fields.meta ?? {},
      lastSyncAt: fields.lastSyncAt ?? null,
      lastSyncStatus: fields.lastSyncStatus ?? null,
      lastError: fields.lastError ?? null,
    })
    .onConflictDoUpdate({
      target: schema.pmsConnection.organizationId,
      set: {
        provider: fields.provider,
        ...(fields.status !== undefined ? { status: fields.status } : {}),
        ...(fields.connectedByUserId !== undefined ? { connectedByUserId: fields.connectedByUserId } : {}),
        ...(fields.customerKeyEncrypted !== undefined ? { customerKeyEncrypted: fields.customerKeyEncrypted } : {}),
        ...(fields.syncDirection !== undefined ? { syncDirection: fields.syncDirection } : {}),
        ...(fields.autoSyncEnabled !== undefined ? { autoSyncEnabled: fields.autoSyncEnabled } : {}),
        ...(fields.meta !== undefined ? { meta: fields.meta } : {}),
        ...(fields.lastSyncAt !== undefined ? { lastSyncAt: fields.lastSyncAt } : {}),
        ...(fields.lastSyncStatus !== undefined ? { lastSyncStatus: fields.lastSyncStatus } : {}),
        ...(fields.lastError !== undefined ? { lastError: fields.lastError } : {}),
        updatedAt: now,
      },
    })
}

function metaFromTest(test: PmsTestResult): Record<string, unknown> {
  const m: Record<string, unknown> = {}
  if (test.practiceTitle) m.practiceTitle = test.practiceTitle
  if (test.version) m.version = test.version
  if (test.eConnectorReachable !== undefined) m.eConnectorReachable = test.eConnectorReachable
  if (test.scopeNote) m.scopeNote = test.scopeNote
  return m
}

// Default office timezone until the clinic sets one. OD datetimes are
// office-local wall-clock with no TZ, so we must convert against this.
const PMS_DEFAULT_TZ = 'America/New_York'

/**
 * Validate an Open Dental Customer Key against the live API and, on success,
 * persist the connection (key AES-encrypted). Throws with a human message on
 * failure so the connect form can surface it. The Developer Key is a
 * platform-level secret; clinics only paste their per-office Customer Key.
 */
export async function connectOpenDental(
  organizationId: string,
  userId: string | null,
  customerKey: string,
): Promise<PmsTestResult> {
  if (!openDentalConfigured()) {
    throw new Error('Open Dental isn’t enabled on this DreamCRM instance yet (missing developer key). Contact support.')
  }
  const key = customerKey.trim()
  if (!key) throw new Error('Enter your Open Dental Customer Key.')

  const provider = new OpenDentalProvider(key)
  const test = await provider.testConnection()
  if (!test.ok) {
    throw new Error(test.error || 'Could not reach Open Dental with that Customer Key. Check the key and that your eConnector is running.')
  }

  // Auto-pick a default operatory — Open Dental REQUIRES an Op on appointment
  // creates. Prefer a web-scheduling op, else the first visible one. The clinic
  // can change it later in settings.
  let defaultOperatoryNum: number | undefined
  try {
    const ops = await provider.listOperatories()
    const pick = ops.find((o) => !o.isHidden && o.isWebSched) ?? ops.find((o) => !o.isHidden) ?? ops[0]
    defaultOperatoryNum = pick?.num
  } catch {
    // Non-fatal: write-back surfaces "no operatory configured" until one is set.
  }

  await upsertPmsConnection(organizationId, {
    provider: 'open_dental',
    status: 'connected',
    connectedByUserId: userId,
    customerKeyEncrypted: encryptSecret(key),
    meta: {
      ...metaFromTest(test),
      timeZone: PMS_DEFAULT_TZ,
      ...(defaultOperatoryNum != null ? { defaultOperatoryNum } : {}),
    },
    lastError: null,
  })
  return test
}

/** Clears the key + flips to not_connected. Keeps entity maps + sync/write
 * history for the audit trail; a later reconnect re-links by external id. */
export async function disconnectPms(organizationId: string): Promise<void> {
  await db
    .update(schema.pmsConnection)
    .set({ status: 'not_connected', customerKeyEncrypted: null, lastError: null, updatedAt: new Date() })
    .where(eq(schema.pmsConnection.organizationId, organizationId))
}

export async function setSyncDirection(organizationId: string, direction: SyncDirection): Promise<void> {
  await db
    .update(schema.pmsConnection)
    .set({ syncDirection: direction, updatedAt: new Date() })
    .where(eq(schema.pmsConnection.organizationId, organizationId))
}

export async function setAutoSync(organizationId: string, enabled: boolean): Promise<void> {
  await db
    .update(schema.pmsConnection)
    .set({ autoSyncEnabled: enabled ? 1 : 0, updatedAt: new Date() })
    .where(eq(schema.pmsConnection.organizationId, organizationId))
}

// ── Dashboard read ──────────────────────────────────────────────────────────

export interface WriteOpView {
  id: string
  entityType: string
  label: string
  operation: string
  status: WriteOpStatus
  externalId: string | null
  error: string | null
  createdAt: Date
  completedAt: Date | null
}

export interface IntegrationsDashboard {
  connection: PmsConnection | null
  counts: { patients: number; appointments: number; providers: number }
  totals: { patients: number; appointments: number }
  pendingWrites: number
  recentRuns: PmsSyncRun[]
  recentWrites: WriteOpView[]
}

export async function getIntegrationsDashboard(organizationId: string): Promise<IntegrationsDashboard> {
  const connection = await getPmsConnection(organizationId)

  const mapCounts = await db
    .select({ entityType: schema.pmsEntityMap.entityType, c: count() })
    .from(schema.pmsEntityMap)
    .where(eq(schema.pmsEntityMap.organizationId, organizationId))
    .groupBy(schema.pmsEntityMap.entityType)
  const counts = { patients: 0, appointments: 0, providers: 0 }
  for (const r of mapCounts) {
    if (r.entityType === 'patient') counts.patients = Number(r.c)
    else if (r.entityType === 'appointment') counts.appointments = Number(r.c)
    else if (r.entityType === 'provider') counts.providers = Number(r.c)
  }

  const [[patTotal], [aptTotal], [pending]] = await Promise.all([
    db.select({ c: count() }).from(schema.patient).where(eq(schema.patient.organizationId, organizationId)),
    db.select({ c: count() }).from(schema.appointment).where(eq(schema.appointment.organizationId, organizationId)),
    db
      .select({ c: count() })
      .from(schema.pmsWriteOp)
      .where(and(eq(schema.pmsWriteOp.organizationId, organizationId), inArray(schema.pmsWriteOp.status, ['pending', 'error']))),
  ])

  const recentRuns = await db
    .select()
    .from(schema.pmsSyncRun)
    .where(eq(schema.pmsSyncRun.organizationId, organizationId))
    .orderBy(desc(schema.pmsSyncRun.startedAt))
    .limit(8)

  const writeRows = await db
    .select()
    .from(schema.pmsWriteOp)
    .where(eq(schema.pmsWriteOp.organizationId, organizationId))
    .orderBy(desc(schema.pmsWriteOp.createdAt))
    .limit(12)
  const recentWrites = await labelWriteOps(organizationId, writeRows)

  return {
    connection,
    counts,
    totals: { patients: Number(patTotal?.c ?? 0), appointments: Number(aptTotal?.c ?? 0) },
    pendingWrites: Number(pending?.c ?? 0),
    recentRuns,
    recentWrites,
  }
}

async function labelWriteOps(
  organizationId: string,
  rows: (typeof schema.pmsWriteOp.$inferSelect)[],
): Promise<WriteOpView[]> {
  const apptIds = rows.filter((r) => r.entityType === 'appointment').map((r) => r.internalId)
  const patIds = rows.filter((r) => r.entityType === 'patient').map((r) => r.internalId)

  const appts = apptIds.length
    ? await db
        .select({ id: schema.appointment.id, title: schema.appointment.title, patientId: schema.appointment.patientId, startTime: schema.appointment.startTime })
        .from(schema.appointment)
        .where(and(eq(schema.appointment.organizationId, organizationId), inArray(schema.appointment.id, apptIds)))
    : []
  const apptById = new Map(appts.map((a) => [a.id, a]))

  // Resolve names for patients referenced directly OR via an appointment.
  const allPatIds = new Set<string>(patIds)
  for (const a of appts) allPatIds.add(a.patientId)
  const pats = allPatIds.size
    ? await db
        .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, Array.from(allPatIds))))
    : []
  const patById = new Map(pats.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]))

  return rows.map((r) => {
    let label = r.entityType === 'appointment' ? 'Appointment' : 'Patient'
    if (r.entityType === 'appointment') {
      const a = apptById.get(r.internalId)
      if (a) label = patById.get(a.patientId) ? `${a.title}` : a.title
    } else if (r.entityType === 'patient') {
      label = patById.get(r.internalId) || 'Patient'
    }
    return {
      id: r.id,
      entityType: r.entityType,
      label,
      operation: r.operation,
      status: r.status as WriteOpStatus,
      externalId: r.externalId,
      error: r.error,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }
  })
}
