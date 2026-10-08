import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  checkRecognisedCard,
  detailFromRequest,
  detailMatchesOnFile,
  effectiveInsuranceDriver,
  isBilledDriver,
  INSURANCE_INTRO,
  ledgerSummaryForCheck,
  normalizeNpi,
  NPI_READINESS_COPY,
  usageLine,
  parseInsuranceDetail,
  resolveInsuranceDriverId,
  validateEligibilityRequest,
  type EligibilityRequest,
  type EligibilityResult,
  type EligibilityStatus,
  type InsuranceCheckView,
  type InsuranceDriverId,
  type InsuranceUsage,
  type PatientInsuranceDetail,
} from '@/lib/insurance-eligibility'
import { recordAction } from '@/lib/services/action-ledger'
import type { EligibilityProvider } from './provider'
import { sandboxProvider } from './sandbox'
import { makeStediProvider, searchStediPayers } from './stedi'
import { getInsuranceUsage } from './allowance'
import { disableInsuranceTool, enableInsuranceTool } from './setup'

export { searchStediPayers as searchPayers }
export { getInsuranceUsage, enableInsuranceTool, disableInsuranceTool }

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

export interface InsuranceSetup {
  /** The clinic turned the tool on (clinic_profile.insurance_enabled_at). Off = the intro card. */
  enabled: boolean
  /** The practice NPI on file, normalised, or null. */
  npi: string | null
  /** The driver a check from this org actually runs under (the demo rule applied). */
  driver: InsuranceDriverId
  /** Under the live driver with no practice NPI (and no platform fallback): not ready. */
  needsNpi: boolean
  /** The included monthly allowance, read only under a billed driver; null otherwise. */
  usage: InsuranceUsage | null
}

/**
 * What the tool is for THIS clinic right now (polish phase 6): which driver
 * answers, whether a live check would be refused for a missing NPI, and how
 * much of the month's included allowance is used. One read shared by the
 * page, the patient-record rail card and the check itself, so the state the
 * desk sees is the state the service enforces. Best-effort reads: an
 * unreadable profile reads as "no NPI" (the refusal names the fix) and an
 * unreadable org as a real clinic (never a demo by accident).
 */
export async function getInsuranceSetup(organizationId: string, now: Date = new Date()): Promise<InsuranceSetup> {
  const configured = resolveInsuranceDriverId()
  let storedNpi: string | null = null
  let enabled = false
  let isDemo = false
  try {
    const [profile] = await db
      .select({ npi: schema.clinicProfile.npi, enabledAt: schema.clinicProfile.insuranceEnabledAt })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    storedNpi = profile?.npi ?? null
    enabled = profile?.enabledAt != null
    if (configured === 'stedi') {
      const [org] = await db
        .select({ isDemo: schema.organization.isDemo })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
      isDemo = org?.isDemo === true
    }
  } catch (e) {
    console.error('[insurance-eligibility] setup read failed:', e)
  }
  const { driver, needsNpi } = effectiveInsuranceDriver({ driver: configured, storedNpi, isDemo })
  const usage = enabled && isBilledDriver(driver) && !needsNpi ? await getInsuranceUsage(organizationId, now) : null
  return { enabled, npi: normalizeNpi(storedNpi), driver, needsNpi, usage }
}

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
  | {
      ok: false
      errors: Record<string, string>
      /** A refusal BEFORE any row or network call: the tool is off, the practice isn't set up, or the month's allowance is spent. */
      reason?: 'not_enabled' | 'npi' | 'over_allowance'
    }

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
    let onFilePolicyNumber: string | null = null
    if (opts.patientId) {
      const [p] = await db
        .select({
          id: schema.patient.id,
          firstName: schema.patient.firstName,
          lastName: schema.patient.lastName,
          insurancePolicyNumber: schema.patient.insurancePolicyNumber,
        })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, opts.patientId)))
        .limit(1)
      if (p) {
        patientId = p.id
        patientName = `${p.firstName} ${p.lastName}`.trim()
        onFilePolicyNumber = p.insurancePolicyNumber
      }
    }

    // READINESS + THE ALLOWANCE, before any row or any network (polish
    // phase 6). The demo rule lives in effectiveInsuranceDriver: the demo
    // org gets the SAME driver as everyone else (a check there is a platform
    // admin's deliberate click) unless the live driver would only refuse it
    // for a missing NPI — then, and only then, the labelled sandbox answers.
    const setup = await getInsuranceSetup(organizationId, now)
    if (!setup.enabled) return { ok: false, reason: 'not_enabled', errors: { _form: `Insurance checks aren’t turned on for this practice yet. ${INSURANCE_INTRO.askManager}` } }
    if (setup.needsNpi) return { ok: false, reason: 'npi', errors: { _form: NPI_READINESS_COPY.refusal } }
    if (setup.usage && !setup.usage.unreadable && setup.usage.used >= setup.usage.included) {
      return {
        ok: false,
        reason: 'over_allowance',
        errors: { _form: `${usageLine(setup.usage)} — the allowance resets on the 1st. Dream Create can raise it; ask on the Support thread.` },
      }
    }
    const provider = resolveEligibilityProvider(setup.driver)

    let result: EligibilityResult | null = null
    let raw: unknown | null = null
    let error: string | null = null
    try {
      const answer = await provider.check(input, { now, organizationId })
      result = answer.result
      raw = answer.raw ?? null
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
      // The payer's answer as received: what the normalizer doesn't read
      // today can be read tomorrow without asking (and paying) again.
      rawResponse: raw,
      error,
      checkedAt: now,
      createdAt: now,
    }
    await db.insert(schema.insuranceVerification).values(row)
    const view = toView(row, patientName, await userDisplayName(opts.userId))

    // The record remembers the card — but only a card the payer RECOGNISED
    // (a not-found or a failed check says nothing about the card), and only
    // when it is the card on file (an empty policy number, or the same one):
    // the tool promises that edits don't change the record until you save.
    const onFile = (onFilePolicyNumber ?? '').trim()
    const isCardOnFile = !onFile || onFile === input.memberId.trim()
    if (patientId && result && checkRecognisedCard(status) && isCardOnFile) {
      await rememberCheckedCard(organizationId, patientId, detailFromRequest(input, result, 'check', now))
    }

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

/**
 * Stamp the remembered card on a patient. Writes ONLY `insurance_detail` —
 * never the three flat columns, which belong to their own writers. Best
 * effort: a failed stamp must not turn a stored, narrated check into an
 * error for the person at the desk.
 */
export async function rememberCheckedCard(
  organizationId: string,
  patientId: string,
  detail: PatientInsuranceDetail,
): Promise<boolean> {
  try {
    const updated = await db
      .update(schema.patient)
      .set({ insuranceDetail: detail, updatedAt: new Date() })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
      .returning({ id: schema.patient.id })
    return updated.length > 0
  } catch (e) {
    console.error('[insurance-eligibility] remember card failed:', e)
    return false
  }
}

/** The remembered card on a patient, parsed; null when none or when it no longer matches the on-file policy number. */
export async function getRememberedCard(organizationId: string, patientId: string): Promise<PatientInsuranceDetail | null> {
  const [p] = await db
    .select({ detail: schema.patient.insuranceDetail, policy: schema.patient.insurancePolicyNumber })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p) return null
  const detail = parseInsuranceDetail(p.detail)
  return detailMatchesOnFile(detail, p.policy) ? detail : null
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

/** One stored check by id — org-scoped, so a `?check=` deep link can never open another clinic's row. */
export async function getInsuranceCheckById(organizationId: string, checkId: string): Promise<InsuranceCheckView | null> {
  const rows = await db
    .select(viewSelect)
    .from(schema.insuranceVerification)
    .leftJoin(schema.patient, eq(schema.insuranceVerification.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.insuranceVerification.requestedByUserId, schema.user.id))
    .where(and(eq(schema.insuranceVerification.organizationId, organizationId), eq(schema.insuranceVerification.id, checkId)))
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
