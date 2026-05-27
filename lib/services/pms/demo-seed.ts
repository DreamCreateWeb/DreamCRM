import 'server-only'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { upsertPmsConnection, getPmsConnection } from './connection'

/**
 * Seed (or self-heal) the Acme demo's PMS integration so the /integrations
 * module showcases every state without a live Open Dental. Idempotent: no-op
 * once a connection row exists. Presented as "Open Dental (Sandbox)".
 *
 * What it builds, all over the demo's EXISTING rows (no fake content):
 *   - a connected, two-way 'demo' connection (last synced 2h ago)
 *   - pms_entity_map links for every provider / patient / appointment, so the
 *     dashboard counts + the DemoProvider's idempotent "Sync now" both work
 *   - PMS balances on a few patients (the read-only "from your PMS" stat)
 *   - 3 inbound sync_run rows (initial bulk import → incremental updates)
 *   - outbound write_op rows covering every state: 2 booked-in-DreamCRM-then-
 *     pushed (success), 1 just-booked awaiting next sync (pending), 1 failed
 *     push that will retry (error). "Sync now" in demo flushes pending+error.
 */
export async function seedDemoPms(organizationId: string): Promise<void> {
  const existing = await getPmsConnection(organizationId)
  if (existing) {
    // If a platform admin disconnected the sandbox mid-demo, re-activate it on
    // next entry (maps + sync/write history stay intact — no re-seed).
    if (existing.provider === 'demo' && existing.status !== 'connected') {
      await upsertPmsConnection(organizationId, { provider: 'demo', status: 'connected' })
    }
    return
  }

  const patients = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
  if (patients.length === 0) return // nothing to map (not a real demo clinic)

  const providers = await db
    .select({ id: schema.clinicProvider.id })
    .from(schema.clinicProvider)
    .where(eq(schema.clinicProvider.organizationId, organizationId))
  const appts = await db
    .select({ id: schema.appointment.id })
    .from(schema.appointment)
    .where(eq(schema.appointment.organizationId, organizationId))

  const now = Date.now()
  const lastSyncAt = new Date(now - 2 * 60 * 60 * 1000)

  await upsertPmsConnection(organizationId, {
    provider: 'demo',
    status: 'connected',
    syncDirection: 'two_way',
    autoSyncEnabled: 1,
    meta: {
      practiceTitle: 'Acme Dental (Sandbox)',
      version: 'Open Dental 24.3 — simulated',
      eConnectorReachable: true,
      scopeNote: 'Sandbox — showcases the real sync engine without contacting a live PMS',
    },
    lastSyncAt,
    lastSyncStatus: 'success',
    lastError: null,
  })

  // Reserve a few appointments to demonstrate the outbound write-back states.
  const pendingAppt = appts[0]?.id
  const errorAppt = appts[1]?.id
  const pushedA = appts[2]?.id
  const pushedB = appts[3]?.id
  const reserved = new Set([pendingAppt, errorAppt, pushedA, pushedB].filter(Boolean) as string[])

  const mapRows: (typeof schema.pmsEntityMap.$inferInsert)[] = []
  providers.forEach((p, i) => {
    mapRows.push(mapRow(organizationId, 'provider', `od-prov-${i + 1}`, p.id, 'pms'))
  })
  patients.forEach((p, i) => {
    mapRows.push(mapRow(organizationId, 'patient', `od-pat-${1001 + i}`, p.id, 'pms'))
  })
  appts.forEach((a, i) => {
    if (a.id === pendingAppt || a.id === errorAppt) return // intentionally unmapped
    const origin = a.id === pushedA || a.id === pushedB ? 'dreamcrm' : 'pms'
    const ext = origin === 'dreamcrm' ? `od-apt-9${String(i).padStart(3, '0')}` : `od-apt-${5001 + i}`
    mapRows.push(mapRow(organizationId, 'appointment', ext, a.id, origin))
  })
  if (mapRows.length) await db.insert(schema.pmsEntityMap).values(mapRows).onConflictDoNothing()

  // PMS balances on the first few patients (varied, incl. zero).
  const balances = [12500, 0, 4800, 35000, 0]
  for (let i = 0; i < Math.min(balances.length, patients.length); i++) {
    await db
      .update(schema.patient)
      .set({ pmsBalanceCents: balances[i], pmsBalanceUpdatedAt: lastSyncAt })
      .where(eq(schema.patient.id, patients[i].id))
  }

  // Inbound sync history.
  const runs: (typeof schema.pmsSyncRun.$inferInsert)[] = [
    {
      id: randomUUID(),
      organizationId,
      trigger: 'initial',
      status: 'success',
      startedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      finishedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 42_000),
      counts: {
        providers: { created: providers.length, updated: 0, skipped: 0 },
        patients: { created: patients.length, updated: 0, skipped: 0 },
        appointments: { created: Math.max(0, appts.length - reserved.size), updated: 0, skipped: 0 },
      },
    },
    {
      id: randomUUID(),
      organizationId,
      trigger: 'scheduled',
      status: 'success',
      startedAt: new Date(now - 24 * 60 * 60 * 1000),
      finishedAt: new Date(now - 24 * 60 * 60 * 1000 + 9_000),
      counts: {
        providers: { created: 0, updated: 0, skipped: providers.length },
        patients: { created: 0, updated: 2, skipped: Math.max(0, patients.length - 2) },
        appointments: { created: 0, updated: 3, skipped: Math.max(0, appts.length - 3) },
      },
    },
    {
      id: randomUUID(),
      organizationId,
      trigger: 'scheduled',
      status: 'success',
      startedAt: lastSyncAt,
      finishedAt: new Date(lastSyncAt.getTime() + 7_000),
      counts: {
        providers: { created: 0, updated: 0, skipped: providers.length },
        patients: { created: 0, updated: 0, skipped: patients.length },
        appointments: { created: 0, updated: 1, skipped: Math.max(0, appts.length - 1) },
      },
    },
  ]
  await db.insert(schema.pmsSyncRun).values(runs)

  // Outbound write-back log — every state.
  const ops: (typeof schema.pmsWriteOp.$inferInsert)[] = []
  if (pushedA) {
    ops.push({
      id: randomUUID(),
      organizationId,
      entityType: 'appointment',
      internalId: pushedA,
      externalId: 'od-apt-9002',
      operation: 'create',
      status: 'success',
      attempts: 1,
      createdAt: new Date(now - 26 * 60 * 60 * 1000),
      completedAt: new Date(now - 26 * 60 * 60 * 1000 + 1200),
    })
  }
  if (pushedB) {
    ops.push({
      id: randomUUID(),
      organizationId,
      entityType: 'appointment',
      internalId: pushedB,
      externalId: 'od-apt-9003',
      operation: 'create',
      status: 'success',
      attempts: 1,
      createdAt: new Date(now - 5 * 60 * 60 * 1000),
      completedAt: new Date(now - 5 * 60 * 60 * 1000 + 900),
    })
  }
  if (errorAppt) {
    ops.push({
      id: randomUUID(),
      organizationId,
      entityType: 'appointment',
      internalId: errorAppt,
      operation: 'create',
      status: 'error',
      attempts: 2,
      error: 'Open Dental eConnector unreachable — will retry on next sync',
      createdAt: new Date(now - 70 * 60 * 1000),
    })
  }
  if (pendingAppt) {
    ops.push({
      id: randomUUID(),
      organizationId,
      entityType: 'appointment',
      internalId: pendingAppt,
      operation: 'create',
      status: 'pending',
      attempts: 0,
      createdAt: new Date(now - 30 * 60 * 1000),
    })
  }
  if (ops.length) await db.insert(schema.pmsWriteOp).values(ops)
}

function mapRow(
  organizationId: string,
  entityType: string,
  externalId: string,
  internalId: string,
  origin: 'pms' | 'dreamcrm',
): typeof schema.pmsEntityMap.$inferInsert {
  return {
    id: randomUUID(),
    organizationId,
    entityType,
    externalId,
    internalId,
    origin,
    lastSyncedAt: new Date(),
  }
}
