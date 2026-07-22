import 'server-only'
import { createHash, randomUUID } from 'crypto'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
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

// Per-entity reconcile tally. `skippedContactOverwrites` is patient-only — it
// counts rows where the PMS reported a different email/phone but we deliberately
// KEPT ours because the patient has a linked login (overwriting would break
// portal sign-in / magic-link / invites that key on the old address). It rides
// the same `counts` jsonb so the run log can surface it; the page summarizer
// only reads created/updated/skipped, so the extra optional field is harmless.
type Tally = { created: number; updated: number; skipped: number; skippedContactOverwrites?: number }
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
  /** True when the run hit its soft time budget mid-patient-import and stopped
   *  early, leaving a resume cursor on pms_connection.meta. The next run
   *  (manual or the hourly cron) picks up where this one left off. */
  partial: boolean
  /** True when a resume cursor is parked — i.e. another run will continue. */
  resumeAvailable: boolean
  /** Patient-import progress, surfaced in the UI ("Imported 1,200 so far"). */
  progress: { imported: number; total: number } | null
}

// A 'running' sync_run row older than this is treated as a crashed/abandoned
// run — it no longer blocks a fresh run AND gets reaped to 'error' so the audit
// is honest and sync-health doesn't keep counting a zombie as "in progress".
// The budgeted patient import (below) can legitimately run up to ~110s, so the
// stale window must comfortably exceed that.
const RUN_STALE_MS = 15 * 60 * 1000

// Default soft time budget for one runImport pass. App Runner's request timeout
// is the hard ceiling; we stop well short so a huge first import (e.g. a
// 5,000-patient office, sequential at the API's ~1 req/5s throttle) parks a
// cursor and returns a clean 'partial' instead of being killed mid-flight (a
// killed request leaves a 'running' row the stale-guard would then have to reap).
const DEFAULT_SOFT_BUDGET_MS = 110_000

export async function runImport(
  organizationId: string,
  opts: {
    trigger?: 'manual' | 'scheduled' | 'initial'
    triggeredByUserId?: string | null
    /** Soft wall-clock budget for this pass; overshoot parks a resume cursor. */
    softBudgetMs?: number
    /** Injectable clock for deterministic budget tests. */
    now?: () => number
  } = {},
): Promise<SyncResult> {
  const clock = opts.now ?? Date.now
  const deadline = clock() + (opts.softBudgetMs ?? DEFAULT_SOFT_BUDGET_MS)

  const connection = await getPmsConnection(organizationId)
  if (!connection || connection.status !== 'connected') throw new Error('No PMS is connected.')
  const client = getProviderClient(connection)

  // Concurrency guard: stand down if a sync is already in flight for this org,
  // so two overlapping runs (a double-clicked "Sync now", or a scheduled run
  // overlapping a manual one) can't both flush the write-op queue and create
  // DUPLICATE records in the PMS. A 'running' row older than RUN_STALE_MS is a
  // crashed run — we REAP it (flip to 'error') so it stops blocking retries
  // AND stops masquerading as in-progress, then proceed.
  const [inflight] = await db
    .select({ id: schema.pmsSyncRun.id, startedAt: schema.pmsSyncRun.startedAt })
    .from(schema.pmsSyncRun)
    .where(and(eq(schema.pmsSyncRun.organizationId, organizationId), eq(schema.pmsSyncRun.status, 'running')))
    .orderBy(desc(schema.pmsSyncRun.startedAt))
    .limit(1)
  if (inflight) {
    if (clock() - inflight.startedAt.getTime() < RUN_STALE_MS) {
      throw new Error('A sync is already running for this clinic — please wait for it to finish.')
    }
    // Stale — reap it so it neither blocks this run nor lingers as a zombie.
    await db
      .update(schema.pmsSyncRun)
      .set({ status: 'error', finishedAt: new Date(), error: 'Run abandoned (timed out or crashed) — reaped by a later sync.' })
      .where(eq(schema.pmsSyncRun.id, inflight.id))
  }

  // Appointment delta high-water (DateTStamp). Captured at run start so the
  // next run picks up anything changed during this one; only advanced when the
  // appointment phase actually succeeded this run (see appointmentsPulledOk).
  const meta = (connection.meta ?? {}) as Record<string, unknown>
  const since = typeof meta.highWaterAppointments === 'string' ? new Date(meta.highWaterAppointments) : undefined
  // Resume cursor for the patient import: how many patients (in a stable sort)
  // a prior budget-capped run already processed. Absent → start from 0.
  const startCursor =
    typeof meta.patientImportCursor === 'number' && meta.patientImportCursor > 0 ? meta.patientImportCursor : 0
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
  // Tracks whether the appointment pull+reconcile specifically succeeded this
  // run. The high-water mark may ONLY advance when it did — otherwise a
  // transient failure during/before the appointment read would advance the
  // mark past changes we never pulled, silently skipping them forever.
  let appointmentsPulledOk = false
  // Patient-import resume bookkeeping.
  let patientCursor = startCursor
  let patientTotal = 0
  let patientImportComplete = true
  // Per-row patient errors that did NOT abort the run (transient blips). They
  // make the run an honest 'partial' (and the row retries next sync), distinct
  // from a budget pause.
  let patientRowErrors = 0
  let patientRowErrorMsg: string | null = null

  try {
    // Flush queued write-backs first so the PMS reflects bookings we originated
    // before we read everything back.
    if (connection.syncDirection === 'two_way') await retryPendingWrites(organizationId, client)

    await reconcileProviders(organizationId, await client.listProviders(), counts.providers)

    const patientRes = await reconcilePatients(
      organizationId,
      await client.listPatients(),
      counts.patients,
      { startIndex: startCursor, deadline, now: clock },
    )
    patientCursor = patientRes.nextIndex
    patientTotal = patientRes.total
    patientImportComplete = patientRes.complete
    patientRowErrors = patientRes.errors
    patientRowErrorMsg = patientRes.firstError

    // Only advance into appointments/recalls once the patient import has fully
    // caught up — appointments key on patient maps, so importing them against a
    // half-loaded patient set would needlessly skip rows. A budget-capped
    // patient pass resumes patients-first next run.
    if (patientImportComplete) {
      await reconcileAppointments(organizationId, await client.listAppointments({ since }), counts.appointments)
      appointmentsPulledOk = true
      await reconcileRecalls(organizationId, await client.listRecalls(), counts.recalls)
    }
  } catch (e) {
    error = (e as Error).message
  }

  // Fold non-aborting per-row patient errors into the run's error note so the
  // status reflects them (and the clinic can see why some rows didn't land).
  if (!error && patientRowErrors > 0) {
    error = `${patientRowErrors} patient${patientRowErrors === 1 ? '' : 's'} couldn't be imported this run${patientRowErrorMsg ? ` (e.g. ${patientRowErrorMsg})` : ''} — they'll retry on the next sync.`
  }

  const touched = Object.values(counts).some((t) => t.created + t.updated + t.skipped > 0)
  // Status precedence:
  //  - budgetPause = a CLEAN budget cap (no errors at all) → 'partial', and we
  //    report it as RESUMABLE so the cron treats it as healthy progress.
  //  - any error (a thrown phase failure OR non-aborting per-row errors) →
  //    'partial' if work landed, else 'error', and NOT resumable (it's a real
  //    data/connection issue the cron should alert on). The patient cursor may
  //    still be parked below if the import also hadn't reached the end, so it
  //    naturally resumes next run regardless of this flag.
  const budgetPause = patientImportComplete === false && error === null
  const hadError = error !== null
  const partial = budgetPause || (hadError && touched)
  const status: SyncResult['status'] = budgetPause ? 'partial' : hadError ? (touched ? 'partial' : 'error') : 'success'
  const now = new Date()
  await db.update(schema.pmsSyncRun).set({ status, finishedAt: now, counts, error }).where(eq(schema.pmsSyncRun.id, runId))

  // Persist the patient cursor when capped (so the next run resumes), clear it
  // when the import completed. Keep the high-water advance gated on a clean
  // appointment pull.
  const nextMeta: Record<string, unknown> = { ...meta }
  if (patientImportComplete) delete nextMeta.patientImportCursor
  else nextMeta.patientImportCursor = patientCursor
  if (appointmentsPulledOk) nextMeta.highWaterAppointments = runStart.toISOString()

  await db
    .update(schema.pmsConnection)
    .set({
      lastSyncAt: now,
      lastSyncStatus: status,
      lastError: error,
      meta: nextMeta,
      updatedAt: now,
    })
    .where(eq(schema.pmsConnection.organizationId, organizationId))

  return {
    runId,
    status,
    counts,
    error,
    partial,
    // Resumable ONLY for a budget pause — a row/connection error is not a
    // "more is coming automatically" state (those rows just retry on the next
    // normal sync); the cron uses this to decide whether to alert.
    resumeAvailable: budgetPause,
    progress: patientTotal > 0 ? { imported: Math.min(patientCursor, patientTotal), total: patientTotal } : null,
  }
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

// Exported for unit testing — the shared-phone dedupe rules are correctness-
// critical (a wrong link corrupts two patient identities). Not part of the
// module's public surface otherwise.
export async function findUnmappedPatientByContact(
  organizationId: string,
  mappedInternalIds: Set<string>,
  email: string | null | undefined,
  phone: string | null | undefined,
  lastName: string | null | undefined,
): Promise<string | null> {
  if (!email && !phone) return null
  const candidates = await db
    .select({ id: schema.patient.id, email: schema.patient.email, phone: schema.patient.phone, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.isActive, 1)))
  const unmapped = candidates.filter((c) => !mappedInternalIds.has(c.id))

  // 1. Email is a near-unique signal — match it first.
  if (email) {
    const hit = unmapped.find((c) => c.email && c.email === email)
    if (hit) return hit.id
  }

  // 2. Phone is routinely SHARED across a household in dental (parent + kids on
  //    one number), so a bare phone match is not enough — it could link a PMS
  //    child to a DreamCRM parent and corrupt both identities. Require a
  //    last-name match too, and bail if more than one unmapped patient shares
  //    the phone (ambiguous → safer to create a fresh row).
  if (phone) {
    const phoneHits = unmapped.filter((c) => c.phone && c.phone === phone)
    const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
    if (phoneHits.length === 1 && norm(lastName) && norm(phoneHits[0].lastName) === norm(lastName)) {
      return phoneHits[0].id
    }
  }
  return null
}

// How many already-mapped patients to reconcile concurrently per batch. Each
// such row is fully independent (its own select + update + touchMap), so a
// small Promise.allSettled batch turns the old await-per-patient serial loop
// into chunked parallelism without flooding the connection pool. Kept modest
// because RDS is db.t4g.micro. The budget is re-checked between batches.
const PATIENT_BATCH = 25

export interface PatientReconcileResult {
  /** Index into the stable-sorted row list at which to resume next run. */
  nextIndex: number
  /** Total patients the PMS returned this pull (denominator for progress). */
  total: number
  /** False when we stopped early on the time budget — more remain. */
  complete: boolean
  /** Count of individual rows that errored (we keep going; they retry next run). */
  errors: number
  /** A sample error message for the run log, when any row errored. */
  firstError: string | null
}

/**
 * Reconcile PMS patients into DreamCRM, batched + time-budgeted + resumable.
 *
 * - Rows are sorted by externalId so the cursor is stable across the full
 *   re-pull (OD has no patient delta endpoint, so every run re-fetches the whole
 *   list; the same sort reproduces and we resume at `startIndex`).
 * - Already-mapped rows reconcile in PATIENT_BATCH-sized Promise.allSettled
 *   batches; brand-new/unmapped rows reconcile sequentially so the contact
 *   dedupe set stays consistent (a wrong link corrupts two identities).
 * - The time budget is checked between batches; on overshoot we return
 *   `complete:false` + the resume index so runImport parks a cursor.
 */
async function reconcilePatients(
  organizationId: string,
  rows: NormalizedPatient[],
  t: Tally,
  opts: { startIndex?: number; deadline?: number; now?: () => number } = {},
): Promise<PatientReconcileResult> {
  const clock = opts.now ?? Date.now
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY
  // Stable order so a resume cursor maps to the same row across re-pulls.
  const ordered = [...rows].sort((a, b) => a.externalId.localeCompare(b.externalId))
  const total = ordered.length
  const start = Math.min(Math.max(opts.startIndex ?? 0, 0), total)

  const map = await loadMap(organizationId, 'patient')
  const mappedInternalIds = new Set(Array.from(map.values()).map((m) => m.internalId))

  let errors = 0
  let firstError: string | null = null
  const noteError = (e: unknown) => {
    errors++
    if (!firstError) firstError = e instanceof Error ? e.message : String(e)
  }

  let i = start
  while (i < total) {
    // Budget check BEFORE starting another batch (never mid-batch, so a row is
    // never left half-written). If we've already done work and we're out of
    // time, park here.
    if (i > start && clock() >= deadline) {
      return { nextIndex: i, total, complete: false, errors, firstError }
    }

    const batch = ordered.slice(i, i + PATIENT_BATCH)
    // Split: mapped rows are independent → run them concurrently; unmapped rows
    // (need contact dedupe) run sequentially to keep the reservation set sane.
    const mapped = batch.filter((np) => map.has(np.externalId))
    const unmapped = batch.filter((np) => !map.has(np.externalId))

    // One row failing (a transient DB blip) must NOT abort the whole import —
    // it stays unmapped / stale-hashed and is retried next run. We tally the
    // failures so the run reports an honest 'partial' instead of a false clean.
    const settled = await Promise.allSettled(
      mapped.map((np) => reconcileMappedPatient(organizationId, np, map.get(np.externalId)!, t)),
    )
    for (const s of settled) if (s.status === 'rejected') noteError(s.reason)

    for (const np of unmapped) {
      try {
        await reconcileUnmappedPatient(organizationId, np, mappedInternalIds, t)
      } catch (e) {
        noteError(e)
      }
    }

    i += batch.length
  }

  return { nextIndex: total, total, complete: true, errors, firstError }
}

// One already-mapped patient: skip-on-unchanged, else PMS-wins-but-keep-our-
// contact-when-the-patient-has-a-login. Safe to run concurrently with peers.
async function reconcileMappedPatient(
  organizationId: string,
  np: NormalizedPatient,
  existing: MapRow,
  t: Tally,
) {
  const profileHash = hash([np.firstName, np.lastName, np.dateOfBirth, np.email, np.phone, np.addressLine1, np.city, np.state, np.postalCode])
  const [row] = await db
    .select()
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, existing.internalId)))
    .limit(1)
  if (!row) {
    // Map points at a deleted row → recreate.
    const id = await createImportedPatient(organizationId, np)
    await touchMapInternal(existing.id, id, profileHash)
    t.created++
    return
  }
  const balanceChanged = (row.pmsBalanceCents ?? null) !== (np.balanceCents ?? null)
  if (existing.contentHash === profileHash && !balanceChanged) {
    await touchMap(existing.id, profileHash)
    t.skipped++
    return
  }
  // Contact-overwrite guard: a patient with a linked login (portal sign-in,
  // magic-link, accept-invite) keys on their stored email/phone. If the PMS
  // reports a different address we KEEP ours rather than silently breaking
  // sign-in; everything else (name/DOB/address) still PMS-wins.
  const isLinked = Boolean(row.userId)
  const wantEmail = np.email ?? row.email
  const wantPhone = np.phone ?? row.phone
  const contactWouldChange =
    isLinked && ((np.email != null && np.email !== row.email) || (np.phone != null && np.phone !== row.phone))
  await db
    .update(schema.patient)
    .set({
      firstName: np.firstName || row.firstName,
      lastName: np.lastName || row.lastName,
      dateOfBirth: np.dateOfBirth ?? row.dateOfBirth,
      email: isLinked ? row.email : wantEmail,
      phone: isLinked ? row.phone : wantPhone,
      addressLine1: np.addressLine1 ?? row.addressLine1,
      city: np.city ?? row.city,
      state: np.state ?? row.state,
      postalCode: np.postalCode ?? row.postalCode,
      pmsBalanceCents: np.balanceCents ?? null,
      pmsBalanceUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, existing.internalId)))
  // Hash the values we ACTUALLY persisted, so a guarded row doesn't re-trigger
  // an update every single sync (its stored contact never matches the PMS hash).
  const persistedHash = contactWouldChange
    ? hash([np.firstName, np.lastName, np.dateOfBirth, row.email, row.phone, np.addressLine1, np.city, np.state, np.postalCode])
    : profileHash
  await touchMap(existing.id, persistedHash)
  if (contactWouldChange) t.skippedContactOverwrites = (t.skippedContactOverwrites ?? 0) + 1
  t.updated++
}

// One brand-new PMS patient: try to link an existing DreamCRM row by contact,
// else create. Runs sequentially within a batch so the dedupe reservation set
// can't double-link the same DreamCRM patient.
async function reconcileUnmappedPatient(
  organizationId: string,
  np: NormalizedPatient,
  mappedInternalIds: Set<string>,
  t: Tally,
) {
  const profileHash = hash([np.firstName, np.lastName, np.dateOfBirth, np.email, np.phone, np.addressLine1, np.city, np.state, np.postalCode])
  const linkId = await findUnmappedPatientByContact(organizationId, mappedInternalIds, np.email, np.phone, np.lastName)
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
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, linkId)))
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
        // Only stamp a status timestamp (completedAt / cancelledAt / …) when the
        // status actually transitions. Re-applying it on every content change
        // (e.g. an OD note edit, which also changes the hash) kept moving the
        // timestamp forward to the sync-run time, corrupting the real
        // visit/cancellation time that analytics + aging rely on.
        const [cur] = await db
          .select({ status: schema.appointment.status })
          .from(schema.appointment)
          .where(and(eq(schema.appointment.organizationId, organizationId), eq(schema.appointment.id, existing.internalId)))
          .limit(1)
        const statusChanged = !cur || cur.status !== na.status
        await db
          .update(schema.appointment)
          .set({
            startTime: na.startTime,
            endTime: na.endTime ?? null,
            status: na.status,
            providerId: providerInternalId,
            notes: na.note ?? null,
            ...(statusChanged ? statusFields : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(schema.appointment.organizationId, organizationId), eq(schema.appointment.id, existing.internalId)))
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

function appointmentStatusFields(status: NormalizedAppointment['status']): Record<string, Date | string | null> {
  if (status === 'completed') return { completedAt: new Date() }
  // 'pms' actor: the cancel came in FROM the practice system (Open Dental),
  // so the timeline can say "cancelled in the practice system".
  if (status === 'cancelled') return { cancelledAt: new Date(), cancelledVia: 'pms' }
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
  // Patients OD returned a recall for, but with NO active dated recall — their
  // recall was completed/disabled in OD, so any due date we previously stored
  // must be cleared (otherwise derivePatientRecallStatus keeps flagging them
  // 'due'/'overdue' forever in Recall & Outreach). Only clears patients OD
  // AFFIRMATIVELY returned this sync — a patient absent from `rows` is left
  // untouched, so a partial/failed recall pull never wrongly clears a valid one.
  const clearExt = new Set<string>()
  for (const r of rows) {
    if (!byPat.has(r.patientExternalId)) clearExt.add(r.patientExternalId)
  }
  if (byPat.size === 0 && clearExt.size === 0) return
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
  const clearIds: string[] = []
  for (const ext of Array.from(clearExt)) {
    const m = patMap.get(ext)
    if (m) clearIds.push(m.internalId)
  }
  if (clearIds.length > 0) {
    await db
      .update(schema.patient)
      .set({ pmsRecallDueAt: null, pmsRecallInterval: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          inArray(schema.patient.id, clearIds),
          isNotNull(schema.patient.pmsRecallDueAt),
        ),
      )
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
      await failOp(op.id, op.attempts + 1, 'Appointment no longer exists')
      return
    }
    // Idempotency + recovery: NEVER create a second appointment in the PMS for
    // the same DreamCRM appointment. If it's already mapped — or a prior attempt
    // recorded its external id but failed to write the entity-map (a DB blip
    // right after createAppointment) — reuse that id + ensure the map instead of
    // re-creating. Mirrors ensurePatientExternalId's recovery; the appointment
    // path previously lacked it and duplicated on a map-write failure + retry.
    const alreadyMapped = await mapInternalToExternal(organizationId, 'appointment', appt.id)
    if (alreadyMapped) {
      await db
        .update(schema.pmsWriteOp)
        .set({ status: 'success', externalId: alreadyMapped, error: null, completedAt: new Date(), attempts: op.attempts + 1 })
        .where(eq(schema.pmsWriteOp.id, op.id))
      return
    }
    const [priorApptOp] = await db
      .select({ externalId: schema.pmsWriteOp.externalId })
      .from(schema.pmsWriteOp)
      .where(
        and(
          eq(schema.pmsWriteOp.organizationId, organizationId),
          eq(schema.pmsWriteOp.entityType, 'appointment'),
          eq(schema.pmsWriteOp.internalId, appt.id),
          isNotNull(schema.pmsWriteOp.externalId),
        ),
      )
      .orderBy(desc(schema.pmsWriteOp.createdAt))
      .limit(1)
    if (priorApptOp?.externalId) {
      await insertMap(organizationId, 'appointment', priorApptOp.externalId, appt.id, 'dreamcrm', null)
      await db
        .update(schema.pmsWriteOp)
        .set({ status: 'success', externalId: priorApptOp.externalId, error: null, completedAt: new Date(), attempts: op.attempts + 1 })
        .where(eq(schema.pmsWriteOp.id, op.id))
      return
    }
    const patientExternalId = await ensurePatientExternalId(organizationId, client, appt.patientId)
    if (!patientExternalId) {
      await failOp(op.id, op.attempts + 1, 'Patient could not be created in the PMS yet')
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
    // Record the external id BEFORE writing the map — so if insertMap fails, the
    // retry path above RECOVERS this id instead of creating a duplicate.
    await db
      .update(schema.pmsWriteOp)
      .set({ externalId: res.externalId, responseBody: res.raw ?? null })
      .where(eq(schema.pmsWriteOp.id, op.id))
    await insertMap(organizationId, 'appointment', res.externalId, appt.id, 'dreamcrm', null)
    // Only mark success once the appointment is BOTH created and mapped.
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', externalId: res.externalId, error: null, completedAt: new Date() })
      .where(eq(schema.pmsWriteOp.id, op.id))
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

  // Recovery: a prior attempt may have CREATED the patient in the PMS but failed
  // to write the entity-map (e.g. a DB blip right after createPatient). The
  // external id is recorded on that patient write-op — reuse it + (re)write the
  // map instead of creating a DUPLICATE patient in the PMS on the next retry.
  const [priorOp] = await db
    .select({ externalId: schema.pmsWriteOp.externalId })
    .from(schema.pmsWriteOp)
    .where(
      and(
        eq(schema.pmsWriteOp.organizationId, organizationId),
        eq(schema.pmsWriteOp.entityType, 'patient'),
        eq(schema.pmsWriteOp.internalId, patientId),
        isNotNull(schema.pmsWriteOp.externalId),
      ),
    )
    .orderBy(desc(schema.pmsWriteOp.createdAt))
    .limit(1)
  if (priorOp?.externalId) {
    await insertMap(organizationId, 'patient', priorOp.externalId, patientId, 'dreamcrm', null)
    return priorOp.externalId
  }

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
    // Record the external id on the op BEFORE the map write, so if insertMap
    // throws, the recovery path above can reuse this id next run rather than
    // re-creating the patient in the PMS.
    await db
      .update(schema.pmsWriteOp)
      .set({ externalId: res.externalId, responseBody: res.raw ?? null })
      .where(eq(schema.pmsWriteOp.id, opId))
    await insertMap(organizationId, 'patient', res.externalId, patientId, 'dreamcrm', null)
    await db
      .update(schema.pmsWriteOp)
      .set({ status: 'success', completedAt: new Date() })
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
