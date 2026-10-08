import 'server-only'
import { and, desc, eq, gte, count } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicMonthStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { recordAction } from '@/lib/services/action-ledger'
import { INSURANCE_INTRO, NPI_READINESS_COPY, type InsuranceDriverId, type InsuranceUsage } from '@/lib/insurance-eligibility'
import {
  DISCOVERY_COPY,
  INCLUDED_MONTHLY_INSURANCE_DISCOVERIES,
  STEDI_DISCOVERY_PATH,
  buildDiscoveryRequest,
  ledgerSummaryForDiscovery,
  parseDiscoveryResponse,
  rankCandidates,
  sandboxDiscoveryCandidates,
  storableDiscoveryInput,
  validateDiscoveryInput,
  type DiscoveryCandidate,
  type DiscoveryInput,
  type DiscoveryStatus,
  type InsuranceDiscoveryView,
} from '@/lib/insurance-discovery'
import { getInsuranceSetup } from './index'
import { resolveProvider, stediFetch } from './stedi'
import { StediRetryableError } from '@/lib/stedi-eligibility'

/**
 * INSURANCE DISCOVERY — the server half (2026-10-08). Gates like a check
 * (the switch, the NPI, this feature's OWN allowance), asks the
 * clearinghouse from demographics, polls a pending search briefly, stores
 * ONE row (never the SSN), narrates it. The sandbox answers from the pure
 * module; test mode is refused in words (Stedi refuses it in a 403).
 */

type Row = typeof schema.insuranceDiscovery.$inferSelect

export function includedMonthlyDiscoveries(env: Record<string, string | undefined> = process.env): number {
  const v = Number.parseInt(env.INSURANCE_INCLUDED_MONTHLY_DISCOVERIES ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : INCLUDED_MONTHLY_INSURANCE_DISCOVERIES
}

/** Searches this clinic-local month under the live driver. Fail-open like the check allowance. */
export async function getDiscoveryUsage(organizationId: string, now: Date = new Date()): Promise<InsuranceUsage> {
  const included = includedMonthlyDiscoveries()
  try {
    const timeZone = await getClinicTimeZone(organizationId)
    const since = clinicMonthStart(now, timeZone)
    const [row] = await db
      .select({ n: count() })
      .from(schema.insuranceDiscovery)
      .where(and(eq(schema.insuranceDiscovery.organizationId, organizationId), eq(schema.insuranceDiscovery.driver, 'stedi'), gte(schema.insuranceDiscovery.createdAt, since)))
    return { used: Number(row?.n ?? 0), included, unreadable: false }
  } catch (e) {
    console.error('[insurance-discovery] usage read failed (failing open):', e)
    return { used: 0, included, unreadable: true }
  }
}

function toView(r: Row, requestedByName: string | null): InsuranceDiscoveryView {
  return {
    id: r.id,
    patientId: r.patientId,
    driver: r.driver as InsuranceDriverId,
    status: r.status as DiscoveryStatus,
    input: r.input as DiscoveryInput,
    candidates: Array.isArray(r.candidates) ? (r.candidates as DiscoveryCandidate[]) : [],
    coveragesFound: r.coveragesFound,
    discoveryId: r.discoveryId,
    error: r.error,
    requestedByName,
    createdAtIso: r.createdAt.toISOString(),
  }
}

function newDiscoveryId(): string {
  return `disc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function plainMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message.slice(0, 300)
  return 'The search failed'
}

async function userDisplayName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  try {
    const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, userId)).limit(1)
    return u?.name?.trim() || null
  } catch {
    return null
  }
}

export type RunDiscoveryResult =
  | { ok: true; discovery: InsuranceDiscoveryView }
  | { ok: false; errors: Record<string, string>; reason?: 'not_enabled' | 'npi' | 'over_allowance' | 'live_only' }

/** How long the action waits on a pending search before handing the desk a "still searching" row. */
const PENDING_POLLS = 3
const PENDING_WAIT_MS = 4_000

async function readStedi(res: Response): Promise<unknown> {
  if (res.status === 401 || res.status === 403) {
    let msg = ''
    try {
      msg = String((await res.json())?.message ?? '')
    } catch {
      /* no body */
    }
    if (/test mode/i.test(msg)) throw new Error(DISCOVERY_COPY.liveOnly)
    throw new Error(msg ? `Stedi refused the search: ${msg}` : 'Stedi rejected the API key — check STEDI_API_KEY.')
  }
  if (res.status === 429 || res.status >= 500) throw new StediRetryableError(`Stedi is busy (HTTP ${res.status}) — try again in a moment.`)
  const json: unknown = await res.json()
  if (!res.ok && res.status !== 202) {
    const msg = String((json as Record<string, unknown> | null)?.message ?? `HTTP ${res.status}`)
    throw new Error(`Stedi rejected the search: ${msg}`)
  }
  return json
}

async function pollPending(discoveryId: string, polls: number): Promise<ReturnType<typeof parseDiscoveryResponse>> {
  let parsed = parseDiscoveryResponse({ status: 'PENDING', discoveryId })
  for (let i = 0; i < polls; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PENDING_WAIT_MS))
    const res = await stediFetch(`${STEDI_DISCOVERY_PATH}/${encodeURIComponent(discoveryId)}`, { method: 'GET', timeoutMs: 125_000 })
    parsed = parseDiscoveryResponse(await readStedi(res))
    if (parsed.status !== 'pending') break
  }
  return parsed
}

/** Run one search. Stores a row in every outcome but a refusal. */
export async function runInsuranceDiscovery(
  organizationId: string,
  opts: { input: unknown; patientId?: string | null; userId?: string | null; now?: Date },
): Promise<RunDiscoveryResult> {
  const now = opts.now ?? new Date()
  const validated = validateDiscoveryInput(opts.input, now)
  if (!validated.ok) return validated
  const input = validated.value
  try {
    // The patient must be this org's; a foreign id is stored as nothing.
    let patientId: string | null = null
    let patientName: string | null = null
    if (opts.patientId) {
      const [p] = await db
        .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, opts.patientId)))
        .limit(1)
      if (p) {
        patientId = p.id
        patientName = `${p.firstName} ${p.lastName}`.trim()
      }
    }

    const setup = await getInsuranceSetup(organizationId, now)
    if (!setup.enabled) return { ok: false, reason: 'not_enabled', errors: { _form: `Insurance checks aren’t turned on for this practice yet. ${INSURANCE_INTRO.askManager}` } }
    if (setup.driver === 'stedi_test') return { ok: false, reason: 'live_only', errors: { _form: DISCOVERY_COPY.liveOnly } }
    if (setup.needsNpi) return { ok: false, reason: 'npi', errors: { _form: NPI_READINESS_COPY.refusal } }
    const driver: InsuranceDriverId = setup.driver === 'stedi' ? 'stedi' : 'sandbox'
    const usage = driver === 'stedi' ? await getDiscoveryUsage(organizationId, now) : null
    if (usage && !usage.unreadable && usage.used >= usage.included) {
      return { ok: false, reason: 'over_allowance', errors: { _form: `${DISCOVERY_COPY.usageLine(usage)} — the allowance resets on the 1st. Dream Create can raise it; ask on the Support thread.` } }
    }

    let status: DiscoveryStatus = 'none'
    let candidates: DiscoveryCandidate[] = []
    let coveragesFound = 0
    let discoveryId: string | null = null
    let error: string | null = null
    if (driver === 'sandbox') {
      candidates = sandboxDiscoveryCandidates(input, now)
      coveragesFound = candidates.length
      status = candidates.length ? 'found' : 'none'
    } else {
      try {
        const provider = await resolveProvider(organizationId, 'live')
        const body = buildDiscoveryRequest(input, { npi: provider.npi, now })
        const res = await stediFetch(STEDI_DISCOVERY_PATH, { method: 'POST', body: JSON.stringify(body), timeoutMs: 125_000 })
        let parsed = parseDiscoveryResponse(await readStedi(res))
        if (parsed.status === 'pending' && parsed.discoveryId) parsed = await pollPending(parsed.discoveryId, PENDING_POLLS)
        discoveryId = parsed.discoveryId
        if (parsed.status === 'pending') status = 'pending'
        else if (parsed.status === 'error') {
          status = 'error'
          error = parsed.errors.join('; ') || 'The payers could not be searched.'
        } else {
          candidates = rankCandidates(parsed.candidates, input)
          coveragesFound = parsed.coveragesFound
          status = candidates.length ? 'found' : 'none'
        }
      } catch (e) {
        status = 'error'
        error = plainMessage(e)
      }
    }

    const row: Row = {
      id: newDiscoveryId(),
      organizationId,
      patientId,
      requestedByUserId: opts.userId ?? null,
      driver,
      status,
      // THE SSN IS NEVER STORED — the row keeps `hasSsn` and nothing else of it.
      input: storableDiscoveryInput(input),
      candidates,
      coveragesFound,
      discoveryId,
      error,
      createdAt: now,
      updatedAt: now,
    }
    await db.insert(schema.insuranceDiscovery).values(row)
    const view = toView(row, await userDisplayName(opts.userId))
    await recordAction({
      organizationId,
      capability: 'insurance_check',
      patientId,
      summary: ledgerSummaryForDiscovery(view, patientName ?? ''),
      detail: { discoveryId: view.id, driver, status, coveragesFound, initiatedBy: 'staff', userId: opts.userId ?? null },
      occurredAt: now,
    })
    return { ok: true, discovery: view }
  } catch (e) {
    console.error('[insurance-discovery] search failed:', e)
    return { ok: false, errors: { _form: 'Could not save this search. Try again in a moment.' } }
  }
}

/** A stored search, org-scoped. */
export async function getInsuranceDiscovery(organizationId: string, id: string): Promise<InsuranceDiscoveryView | null> {
  const [row] = await db
    .select({ d: schema.insuranceDiscovery, requestedByName: schema.user.name })
    .from(schema.insuranceDiscovery)
    .leftJoin(schema.user, eq(schema.user.id, schema.insuranceDiscovery.requestedByUserId))
    .where(and(eq(schema.insuranceDiscovery.organizationId, organizationId), eq(schema.insuranceDiscovery.id, id)))
    .limit(1)
  return row ? toView(row.d, row.requestedByName?.trim() || null) : null
}

/** The latest search for a patient — the rail card's memory. */
export async function getLatestDiscoveryForPatient(organizationId: string, patientId: string): Promise<InsuranceDiscoveryView | null> {
  const [row] = await db
    .select({ d: schema.insuranceDiscovery, requestedByName: schema.user.name })
    .from(schema.insuranceDiscovery)
    .leftJoin(schema.user, eq(schema.user.id, schema.insuranceDiscovery.requestedByUserId))
    .where(and(eq(schema.insuranceDiscovery.organizationId, organizationId), eq(schema.insuranceDiscovery.patientId, patientId)))
    .orderBy(desc(schema.insuranceDiscovery.createdAt))
    .limit(1)
  return row ? toView(row.d, row.requestedByName?.trim() || null) : null
}

/**
 * A pending search, asked again. Stedi keeps results for 24 hours; after
 * that the row goes to `error` with a plain sentence rather than pending
 * forever. Never a new billed search.
 */
export async function resumeInsuranceDiscovery(organizationId: string, id: string, now: Date = new Date()): Promise<RunDiscoveryResult> {
  const view = await getInsuranceDiscovery(organizationId, id)
  if (!view) return { ok: false, errors: { _form: 'That search is gone.' } }
  if (view.status !== 'pending' || !view.discoveryId) return { ok: true, discovery: view }
  let status: DiscoveryStatus = 'pending'
  let candidates: DiscoveryCandidate[] = []
  let coveragesFound = 0
  let error: string | null = null
  try {
    if (now.getTime() - new Date(view.createdAtIso).getTime() > 24 * 60 * 60 * 1000) {
      status = 'error'
      error = 'The payers never finished answering, and the search has expired. Start a new one.'
    } else {
      const parsed = await pollPending(view.discoveryId, 1)
      if (parsed.status === 'error') {
        status = 'error'
        error = parsed.errors.join('; ') || 'The payers could not be searched.'
      } else if (parsed.status === 'complete') {
        candidates = rankCandidates(parsed.candidates, view.input)
        coveragesFound = parsed.coveragesFound
        status = candidates.length ? 'found' : 'none'
      }
    }
  } catch (e) {
    // A failed poll leaves the row pending — the desk can ask again.
    return { ok: false, errors: { _form: plainMessage(e) } }
  }
  if (status === 'pending') return { ok: true, discovery: view }
  await db
    .update(schema.insuranceDiscovery)
    .set({ status, candidates, coveragesFound, error, updatedAt: now })
    .where(and(eq(schema.insuranceDiscovery.organizationId, organizationId), eq(schema.insuranceDiscovery.id, id)))
  const updated: InsuranceDiscoveryView = { ...view, status, candidates, coveragesFound, error }
  await recordAction({
    organizationId,
    capability: 'insurance_check',
    patientId: view.patientId,
    summary: ledgerSummaryForDiscovery(updated, ''),
    detail: { discoveryId: id, driver: view.driver, status, coveragesFound, initiatedBy: 'staff', resumed: true },
    occurredAt: now,
  })
  return { ok: true, discovery: updated }
}
