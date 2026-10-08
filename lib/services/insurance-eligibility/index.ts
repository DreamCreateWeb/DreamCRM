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
import { BREAKDOWN_BASE_SERVICE, BREAKDOWN_CODES, breakdownBudget, mergeBreakdown, summarizeBreakdown, unansweredCodes } from '@/lib/insurance-breakdown'
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
    billedChecks: row.billedChecks ?? 1,
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

type Prepared = {
  input: EligibilityRequest
  patientId: string | null
  patientName: string | null
  onFilePolicyNumber: string | null
  setup: InsuranceSetup
  provider: EligibilityProvider
}

/**
 * Everything a check does BEFORE asking anyone: validate the typed card,
 * resolve the patient (never trusting a client-supplied id), and the
 * readiness + allowance gates. Shared by the plain check and the Full
 * breakdown so the two can never drift on who may ask.
 */
async function prepareCheck(
  organizationId: string,
  opts: { input: unknown; patientId?: string | null; now: Date },
): Promise<{ ok: true; prepared: Prepared } | Exclude<RunEligibilityCheckResult, { ok: true }>> {
  const validated = validateEligibilityRequest(opts.input, opts.now)
  if (!validated.ok) return validated
  const input = validated.value

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
  const setup = await getInsuranceSetup(organizationId, opts.now)
  if (!setup.enabled) return { ok: false, reason: 'not_enabled', errors: { _form: `Insurance checks aren’t turned on for this practice yet. ${INSURANCE_INTRO.askManager}` } }
  if (setup.needsNpi) return { ok: false, reason: 'npi', errors: { _form: NPI_READINESS_COPY.refusal } }
  if (setup.usage && !setup.usage.unreadable && setup.usage.used >= setup.usage.included) {
    return {
      ok: false,
      reason: 'over_allowance',
      errors: { _form: `${usageLine(setup.usage)} — the allowance resets on the 1st. Dream Create can raise it; ask on the Support thread.` },
    }
  }
  return { ok: true, prepared: { input, patientId, patientName, onFilePolicyNumber, setup, provider: resolveEligibilityProvider(setup.driver) } }
}

/**
 * Store the answer (good or bad), remember the card, narrate it, return the
 * view. The one write path for both kinds of check.
 */
async function storeCheck(
  organizationId: string,
  prepared: Prepared,
  answer: { result: EligibilityResult | null; raw: unknown | null; error: string | null; billedChecks: number },
  opts: { userId?: string | null; now: Date; ledgerSummary?: (view: InsuranceCheckView, patientName: string) => string },
): Promise<InsuranceCheckView> {
  const { input, patientId, patientName, onFilePolicyNumber, provider } = prepared
  const status: EligibilityStatus = answer.result ? answer.result.status : 'error'
  const row: CheckRow = {
    id: newCheckId(),
    organizationId,
    patientId,
    requestedByUserId: opts.userId ?? null,
    driver: provider.id,
    status,
    input,
    result: answer.result,
    // The payer's answer as received: what the normalizer doesn't read
    // today can be read tomorrow without asking (and paying) again.
    rawResponse: answer.raw,
    billedChecks: answer.billedChecks,
    error: answer.error,
    checkedAt: opts.now,
    createdAt: opts.now,
  }
  await db.insert(schema.insuranceVerification).values(row)
  const view = toView(row, patientName, await userDisplayName(opts.userId))

  // The record remembers the card — but only a card the payer RECOGNISED
  // (a not-found or a failed check says nothing about the card), and only
  // when it is the card on file (an empty policy number, or the same one):
  // the tool promises that edits don't change the record until you save.
  const onFile = (onFilePolicyNumber ?? '').trim()
  const isCardOnFile = !onFile || onFile === input.memberId.trim()
  if (patientId && answer.result && checkRecognisedCard(status) && isCardOnFile) {
    await rememberCheckedCard(organizationId, patientId, detailFromRequest(input, answer.result, 'check', opts.now))
  }

  await recordAction({
    organizationId,
    capability: 'insurance_check',
    patientId,
    summary: (opts.ledgerSummary ?? ledgerSummaryForCheck)(view, patientName ?? ''),
    detail: { checkId: view.id, driver: view.driver, status, initiatedBy: 'staff', userId: opts.userId ?? null, billedChecks: answer.billedChecks },
    occurredAt: opts.now,
  })
  return view
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
  try {
    const prep = await prepareCheck(organizationId, { input: opts.input, patientId: opts.patientId, now })
    if (!prep.ok) return prep
    const { prepared } = prep

    let result: EligibilityResult | null = null
    let raw: unknown | null = null
    let error: string | null = null
    try {
      const answer = await prepared.provider.check(prepared.input, { now, organizationId })
      result = answer.result
      raw = answer.raw ?? null
    } catch (e) {
      error = plainMessage(e)
    }
    const view = await storeCheck(organizationId, prepared, { result, raw, error, billedChecks: 1 }, { userId: opts.userId, now })
    return { ok: true, check: view }
  } catch (e) {
    console.error('[insurance-eligibility] check failed:', e)
    return { ok: false, errors: { _form: 'Could not save this check. Try again in a moment.' } }
  }
}

/**
 * THE FULL BREAKDOWN (2026-10-08, lib/insurance-breakdown.ts has the why).
 * One request naming every code on the sheet; then one request per code
 * that came back without anything specific, stopping at the month's
 * allowance; ONE stored row with the merged answer, its receipt, and the
 * number of checks it cost. The sandbox answers everything in one and
 * never asks twice; a non-billed driver (test mode) is not re-asked per
 * code either, since the mock repeats itself and a free re-ask would still
 * make the receipt lie about how the real payer answers.
 */
export async function runFullBreakdown(
  organizationId: string,
  opts: {
    input: unknown
    patientId?: string | null
    userId?: string | null
    now?: Date
  },
): Promise<RunEligibilityCheckResult> {
  const now = opts.now ?? new Date()
  try {
    const prep = await prepareCheck(organizationId, { input: opts.input, patientId: opts.patientId, now })
    if (!prep.ok) return prep
    const { prepared } = prep
    const { provider, setup } = prepared
    const billed = isBilledDriver(provider.id)
    const requestedCodes = [...BREAKDOWN_CODES]
    const raws: unknown[] = []
    let checks = 0

    // 1. Everything in one request.
    let base: EligibilityResult
    try {
      const answer = await provider.check(prepared.input, { now, organizationId }, {
        services: [BREAKDOWN_BASE_SERVICE, ...requestedCodes.map((value) => ({ system: 'CDT' as const, value }))],
      })
      checks += 1
      base = answer.result
      raws.push(answer.raw ?? null)
    } catch (e) {
      checks += 1
      const view = await storeCheck(
        organizationId,
        prepared,
        { result: null, raw: null, error: plainMessage(e), billedChecks: billed ? checks : 1 },
        { userId: opts.userId, now, ledgerSummary: ledgerSummaryForBreakdown },
      )
      return { ok: true, check: view }
    }

    // 2. One request per code the payer said nothing specific about —
    //    only when the answer is a real payer's (and so worth a billed ask),
    //    only while the plan is active (a not-found repeats itself), and
    //    only inside the allowance.
    const perCodeAsked: string[] = []
    const failedCodes: string[] = []
    let capped = false
    if (billed && base.status === 'active') {
      const missing = unansweredCodes(base)
      const budget = breakdownBudget(setup.usage ? { ...setup.usage, used: setup.usage.used + checks } : null, missing.length)
      capped = budget < missing.length
      for (const code of missing.slice(0, budget)) {
        perCodeAsked.push(code)
        try {
          const answer = await provider.check(prepared.input, { now, organizationId }, { services: [{ system: 'CDT', value: code }] })
          checks += 1
          raws.push(answer.raw ?? null)
          base = mergeBreakdown(base, code, answer.result)
        } catch (e) {
          checks += 1
          failedCodes.push(code)
          console.error(`[insurance-eligibility] breakdown ask for ${code} failed:`, e)
        }
      }
    }

    const result: EligibilityResult = {
      ...base,
      breakdown: summarizeBreakdown({ requestedCodes, result: base, perCodeAsked, failedCodes, checks, capped }),
    }
    const view = await storeCheck(
      organizationId,
      prepared,
      // Every payer answer as received, in ask order; a driver with nothing behind it (the sandbox) stores null.
      { result, raw: raws.some((x) => x != null) ? { breakdown: true, responses: raws } : null, error: null, billedChecks: billed ? checks : 1 },
      { userId: opts.userId, now, ledgerSummary: ledgerSummaryForBreakdown },
    )
    return { ok: true, check: view }
  } catch (e) {
    console.error('[insurance-eligibility] breakdown failed:', e)
    return { ok: false, errors: { _form: 'Could not save this breakdown. Try again in a moment.' } }
  }
}

function ledgerSummaryForBreakdown(view: InsuranceCheckView, patientName: string): string {
  const who = patientName.trim() || `${view.input.patient.firstName} ${view.input.patient.lastName}`.trim()
  const possessive = who.endsWith('s') ? `${who}’` : `${who}’s`
  const b = view.result?.breakdown
  const cost = b ? ` — ${b.checks} payer ${b.checks === 1 ? 'check' : 'checks'}` : ''
  if (view.status === 'error') return `Tried to pull ${possessive} full ${view.input.carrierName} breakdown and couldn’t`
  return `Pulled ${possessive} full ${view.input.carrierName} breakdown${cost}`
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
  billedChecks: schema.insuranceVerification.billedChecks,
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
