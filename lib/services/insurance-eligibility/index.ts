import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  ledgerSummaryForCheck,
  resolveInsuranceDriverId,
  validateEligibilityRequest,
  type EligibilityRequest,
  type EligibilityResult,
  type EligibilityStatus,
  type InsuranceCheckView,
  type InsuranceDriverId,
} from '@/lib/insurance-eligibility'
import { recordAction } from '@/lib/services/action-ledger'
import type { EligibilityProvider } from './provider'
import { sandboxProvider } from './sandbox'
import { makeStediProvider, searchStediPayers } from './stedi'

export { searchStediPayers as searchPayers }

/**
 * Insurance eligibility — the service.
 *
 * One entry point does the whole job: validate → resolve the driver (the
 * demo org ALWAYS gets the sandbox) → ask → store the answer, good or bad →
 * narrate it in the Action Ledger → return the row. Nothing here throws to a
 * caller; failures come back typed.
 */

export function resolveEligibilityProvider(driver: InsuranceDriverId = resolveInsuranceDriverId()): EligibilityProvider {
  switch (driver) {
    case 'stedi':
    case 'stedi_test':
      return makeStediProvider(driver)
    case 'sandbox':
    default:
      return sandboxProvider
  }
}

type CheckRow = typeof schema.insuranceVerification.$inferSelect

function toView(row: CheckRow, patientName: string | null, requestedByName: string | null = null): InsuranceCheckView {
  return {
    id: row.id,
    patientId: row.patientId,
    patientName,
    driver: row.driver as InsuranceDriverId,
    status: row.status as EligibilityStatus,
    input: row.input as EligibilityRequest,
    result: (row.result as EligibilityResult | null) ?? null,
    error: row.error,
    checkedAtIso: row.checkedAt.toISOString(),
    requestedByUserId: row.requestedByUserId,
    requestedByName,
  }
}

/** The name behind "Checked today by Dana" — best-effort, null when unknown. */
async function userDisplayName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  try {
    const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, userId)).limit(1)
    return u?.name?.trim() || null
  } catch {
    return null
  }
}

function newCheckId(): string {
  return `ins_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function plainMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message.slice(0, 300)
  return 'The lookup failed'
}

export type RunEligibilityCheckResult =
  | { ok: true; check: InsuranceCheckView }
  | { ok: false; errors: Record<string, string> }

export async function runEligibilityCheck(
  organizationId: string,
  opts: {
    input: unknown
    patientId?: string | null
    userId?: string | null
    now?: Date
  },
): Promise<RunEligibilityCheckResult> {
  const now = opts.now ?? new Date()
  const validated = validateEligibilityRequest(opts.input, now)
  if (!validated.ok) return validated
  const input = validated.value

  try {
    // Never trust a client-supplied patient id: it must be this org's.
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

    // The demo org gets the SAME driver as everyone else. Only a platform
    // admin can act inside it, and a check is a deliberate click — so a swap
    // to the sandbox there (the first draft) protected nobody and turned the
    // owner's own test into a fake answer.
    const provider = resolveEligibilityProvider(resolveInsuranceDriverId())

    let result: EligibilityResult | null = null
    let error: string | null = null
    try {
      result = await provider.check(input, { now, organizationId })
    } catch (e) {
      error = plainMessage(e)
    }
    const status: EligibilityStatus = result ? result.status : 'error'

    const row: CheckRow = {
      id: newCheckId(),
      organizationId,
      patientId,
      requestedByUserId: opts.userId ?? null,
      driver: provider.id,
      status,
      input,
      result,
      error,
      checkedAt: now,
      createdAt: now,
    }
    await db.insert(schema.insuranceVerification).values(row)
    const view = toView(row, patientName, await userDisplayName(opts.userId))

    await recordAction({
      organizationId,
      capability: 'insurance_check',
      patientId,
      summary: ledgerSummaryForCheck(view, patientName ?? ''),
      detail: { checkId: view.id, driver: view.driver, status, initiatedBy: 'staff', userId: opts.userId ?? null },
      occurredAt: now,
    })
    return { ok: true, check: view }
  } catch (e) {
    console.error('[insurance-eligibility] check failed:', e)
    return { ok: false, errors: { _form: 'Could not save this check. Try again in a moment.' } }
  }
}

const viewSelect = {
  id: schema.insuranceVerification.id,
  organizationId: schema.insuranceVerification.organizationId,
  patientId: schema.insuranceVerification.patientId,
  requestedByUserId: schema.insuranceVerification.requestedByUserId,
  driver: schema.insuranceVerification.driver,
  status: schema.insuranceVerification.status,
  input: schema.insuranceVerification.input,
  result: schema.insuranceVerification.result,
  error: schema.insuranceVerification.error,
  checkedAt: schema.insuranceVerification.checkedAt,
  createdAt: schema.insuranceVerification.createdAt,
  patientFirstName: schema.patient.firstName,
  patientLastName: schema.patient.lastName,
  requestedByName: schema.user.name,
}

type JoinedRow = CheckRow & { patientFirstName: string | null; patientLastName: string | null; requestedByName?: string | null }

function joinedToView(r: JoinedRow): InsuranceCheckView {
  const name = r.patientId && (r.patientFirstName || r.patientLastName)
    ? `${r.patientFirstName ?? ''} ${r.patientLastName ?? ''}`.trim()
    : null
  return toView(r, name, r.requestedByName?.trim() || null)
}

/** The org's latest checks, newest first — the page's "Recent checks" list. */
export async function listRecentInsuranceChecks(organizationId: string, limit = 20): Promise<InsuranceCheckView[]> {
  const rows = await db
    .select(viewSelect)
    .from(schema.insuranceVerification)
    .leftJoin(schema.patient, eq(schema.insuranceVerification.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.insuranceVerification.requestedByUserId, schema.user.id))
    .where(eq(schema.insuranceVerification.organizationId, organizationId))
    .orderBy(desc(schema.insuranceVerification.checkedAt))
    .limit(limit)
  return (rows as JoinedRow[]).map(joinedToView)
}

export async function getLatestInsuranceCheckForPatient(
  organizationId: string,
  patientId: string,
): Promise<InsuranceCheckView | null> {
  const rows = await db
    .select(viewSelect)
    .from(schema.insuranceVerification)
    .leftJoin(schema.patient, eq(schema.insuranceVerification.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.insuranceVerification.requestedByUserId, schema.user.id))
    .where(
      and(
        eq(schema.insuranceVerification.organizationId, organizationId),
        eq(schema.insuranceVerification.patientId, patientId),
      ),
    )
    .orderBy(desc(schema.insuranceVerification.checkedAt))
    .limit(1)
  const r = (rows as JoinedRow[])[0]
  return r ? joinedToView(r) : null
}

export async function listInsuranceChecksForPatient(
  organizationId: string,
  patientId: string,
  limit = 10,
): Promise<InsuranceCheckView[]> {
  const rows = await db
    .select(viewSelect)
    .from(schema.insuranceVerification)
    .leftJoin(schema.patient, eq(schema.insuranceVerification.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.insuranceVerification.requestedByUserId, schema.user.id))
    .where(
      and(
        eq(schema.insuranceVerification.organizationId, organizationId),
        eq(schema.insuranceVerification.patientId, patientId),
      ),
    )
    .orderBy(desc(schema.insuranceVerification.checkedAt))
    .limit(limit)
  return (rows as JoinedRow[]).map(joinedToView)
}

/**
 * Attach an unattached check to a patient — the "Add as new patient" path,
 * so the lookup that created the record becomes its first history entry.
 * Only ever fills a NULL patient_id; a check already on someone's chart is
 * never moved.
 */
export async function attachInsuranceCheckToPatient(
  organizationId: string,
  checkId: string,
  patientId: string,
): Promise<boolean> {
  try {
    const updated = await db
      .update(schema.insuranceVerification)
      .set({ patientId })
      .where(
        and(
          eq(schema.insuranceVerification.organizationId, organizationId),
          eq(schema.insuranceVerification.id, checkId),
          isNull(schema.insuranceVerification.patientId),
        ),
      )
      .returning({ id: schema.insuranceVerification.id })
    return updated.length > 0
  } catch (e) {
    console.error('[insurance-eligibility] attach failed:', e)
    return false
  }
}

/**
 * The carrier suggestions for the form's datalist: the clinic's own accepted
 * list when they've set one, else the universal PPO list the public site
 * shows by default. Suggestions only — any carrier can be typed.
 */
export async function listCarrierSuggestions(organizationId: string): Promise<string[]> {
  try {
    const [profile] = await db
      .select({ carriers: schema.clinicProfile.acceptedInsuranceCarriers })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    const stored = Array.isArray(profile?.carriers)
      ? (profile!.carriers as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : []
    if (stored.length > 0) return stored
  } catch (e) {
    console.error('[insurance-eligibility] carriers read failed:', e)
  }
  const { DEMO_INSURANCE_CARRIERS } = await import('@/lib/services/demo-clinic/clinic-config')
  return DEMO_INSURANCE_CARRIERS
}
