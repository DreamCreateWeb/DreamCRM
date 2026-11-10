import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  detailMatchesOnFile,
  parseInsuranceDetail,
  type InsuranceRank,
  type PatientInsuranceDetail,
} from '@/lib/insurance-eligibility'

/**
 * A patient's coverage SLOTS (ML-50, ML-50b). `patient_insurance` is
 * AUTHORITATIVE for both ranks: every writer of the primary (PMS sync, portal
 * profile, edit modal via updatePatient, intake, merge, import, the demo
 * seeder) goes through `upsertPatientInsurance` / `patchPrimaryInsurance`,
 * which also writes the flat `patient.insurance_*` columns as a MIRROR for one
 * release (written, no longer read - `tests/guards/insurance-flat-readers`). Both carry their own card, payer, member id and
 * remembered detail (trusted only while it matches that slot's policy number).
 */
export interface InsuranceCard {
  rank: InsuranceRank
  provider: string | null
  policyNumber: string | null
  groupNumber: string | null
  /** The remembered card, already filtered to "still matches this slot's member id". */
  detail: PatientInsuranceDetail | null
}

export interface InsuranceCardInput {
  provider: string | null
  policyNumber: string | null
  groupNumber: string | null
  detail?: PatientInsuranceDetail | null
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)
const hasAnything = (c: { provider: string | null; policyNumber: string | null; groupNumber: string | null }) =>
  !!(c.provider || c.policyNumber || c.groupNumber)

function newSlotId(): string {
  return `pins_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

type SlotRow = { provider: string | null; policyNumber: string | null; groupNumber: string | null; detail: unknown }

function toCard(rank: InsuranceRank, r: SlotRow): InsuranceCard | null {
  const card = { provider: clean(r.provider), policyNumber: clean(r.policyNumber), groupNumber: clean(r.groupNumber) }
  if (!hasAnything(card)) return null
  const d = parseInsuranceDetail(r.detail)
  return { rank, ...card, detail: detailMatchesOnFile(d, r.policyNumber) ? d : null }
}

/**
 * THE one read of a coverage slot (ML-50b). `patient_insurance` is
 * authoritative for BOTH ranks. The one fallback: a primary with NO table row
 * yet (a patient whose flat columns were written before every writer moved)
 * is read from the legacy flat mirror - this file is the only reader of them.
 * Org-scoped. A slot with nothing on it is null.
 */
export async function getPatientInsurance(
  organizationId: string,
  patientId: string,
  rank: InsuranceRank = 'primary',
): Promise<InsuranceCard | null> {
  const [row] = await db
    .select({
      provider: schema.patientInsurance.provider,
      policyNumber: schema.patientInsurance.policyNumber,
      groupNumber: schema.patientInsurance.groupNumber,
      detail: schema.patientInsurance.detail,
    })
    .from(schema.patientInsurance)
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.patientId, patientId),
        eq(schema.patientInsurance.rank, rank),
      ),
    )
    .limit(1)
  if (row) return toCard(rank, row)
  if (rank !== 'primary') return null
  const [p] = await db
    .select({
      provider: schema.patient.insuranceProvider,
      policyNumber: schema.patient.insurancePolicyNumber,
      groupNumber: schema.patient.insuranceGroupNumber,
      detail: schema.patient.insuranceDetail,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  return p ? toCard('primary', p) : null
}

/** [primary?, secondary?] - a slot with nothing on it is absent. */
export async function listPatientInsurance(organizationId: string, patientId: string): Promise<InsuranceCard[]> {
  const [primary, secondary] = await Promise.all([
    getPatientInsurance(organizationId, patientId, 'primary'),
    getPatientInsurance(organizationId, patientId, 'secondary'),
  ])
  return [primary, secondary].filter((c): c is InsuranceCard => !!c)
}

/** Primary cards for a set of patients (lists, exports, audiences) - table first, flat only for the unmirrored. */
export async function primaryCardsByPatient(
  organizationId: string,
  patientIds: string[],
): Promise<Map<string, { provider: string | null; policyNumber: string | null; groupNumber: string | null }>> {
  const out = new Map<string, { provider: string | null; policyNumber: string | null; groupNumber: string | null }>()
  if (patientIds.length === 0) return out
  const rows = await db
    .select({
      patientId: schema.patientInsurance.patientId,
      provider: schema.patientInsurance.provider,
      policyNumber: schema.patientInsurance.policyNumber,
      groupNumber: schema.patientInsurance.groupNumber,
    })
    .from(schema.patientInsurance)
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.rank, 'primary'),
        inArray(schema.patientInsurance.patientId, patientIds),
      ),
    )
  for (const r of rows) out.set(r.patientId, { provider: clean(r.provider), policyNumber: clean(r.policyNumber), groupNumber: clean(r.groupNumber) })
  const missing = patientIds.filter((id) => !out.has(id))
  if (missing.length > 0) {
    const flat = await db
      .select({
        id: schema.patient.id,
        provider: schema.patient.insuranceProvider,
        policyNumber: schema.patient.insurancePolicyNumber,
        groupNumber: schema.patient.insuranceGroupNumber,
      })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, missing)))
    for (const r of flat) out.set(r.id, { provider: clean(r.provider), policyNumber: clean(r.policyNumber), groupNumber: clean(r.groupNumber) })
  }
  return out
}

/**
 * Bulk-seed primary slots for freshly inserted patients (the CSV import) - one
 * insert per chunk instead of three queries a row. Org-set on every row; a slot
 * that already exists is left alone. Cards with nothing on them are skipped.
 */
export async function seedPrimaryInsuranceBulk(
  organizationId: string,
  cards: Array<{ patientId: string; provider: string | null; policyNumber?: string | null; groupNumber?: string | null }>,
): Promise<void> {
  const now = new Date()
  const values = cards
    .map((c) => ({ patientId: c.patientId, provider: clean(c.provider), policyNumber: clean(c.policyNumber), groupNumber: clean(c.groupNumber) }))
    .filter(hasAnything)
    .map((c) => ({ id: newSlotId(), organizationId, rank: 'primary', createdAt: now, updatedAt: now, ...c }))
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(schema.patientInsurance).values(values.slice(i, i + 500)).onConflictDoNothing()
  }
}

/**
 * Apply a PARTIAL change to the primary slot (undefined keys keep what is on
 * the card) - the writer every "some fields changed" path uses (edit modal,
 * PMS sync, merge fill, intake). The flat mirror is written by the same call.
 */
export async function patchPrimaryInsurance(
  organizationId: string,
  patientId: string,
  patch: { provider?: string | null; policyNumber?: string | null; groupNumber?: string | null; detail?: PatientInsuranceDetail | null },
): Promise<boolean> {
  const cur = await getPatientInsurance(organizationId, patientId, 'primary')
  return upsertPatientInsurance(organizationId, patientId, 'primary', {
    provider: patch.provider !== undefined ? patch.provider : (cur?.provider ?? null),
    policyNumber: patch.policyNumber !== undefined ? patch.policyNumber : (cur?.policyNumber ?? null),
    groupNumber: patch.groupNumber !== undefined ? patch.groupNumber : (cur?.groupNumber ?? null),
    ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
  })
}

/**
 * Write one slot. Primary → the authoritative row AND the flat mirror; secondary → its table row. Org-scoped on the ownership check
 * and on every write. An all-empty secondary clears it (a primary is only
 * ever cleared by its own editors).
 */
export async function upsertPatientInsurance(
  organizationId: string,
  patientId: string,
  rank: InsuranceRank,
  card: InsuranceCardInput,
): Promise<boolean> {
  const now = new Date()
  const next = { provider: clean(card.provider), policyNumber: clean(card.policyNumber), groupNumber: clean(card.groupNumber) }
  try {
    const [owned] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
      .limit(1)
    if (!owned) return false

    if (rank === 'primary') {
      await db
        .update(schema.patient)
        .set({
          insuranceProvider: next.provider,
          insurancePolicyNumber: next.policyNumber,
          insuranceGroupNumber: next.groupNumber,
          ...(card.detail !== undefined ? { insuranceDetail: card.detail } : {}),
          updatedAt: now,
        })
        .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    } else if (!hasAnything(next)) {
      await removeSecondaryInsurance(organizationId, patientId)
      return true
    }
    const set = {
      provider: next.provider,
      policyNumber: next.policyNumber,
      groupNumber: next.groupNumber,
      ...(card.detail !== undefined ? { detail: card.detail } : {}),
      updatedAt: now,
    }
    await db
      .insert(schema.patientInsurance)
      .values({ id: newSlotId(), organizationId, patientId, rank, ...set, createdAt: now })
      .onConflictDoUpdate({
        target: [schema.patientInsurance.organizationId, schema.patientInsurance.patientId, schema.patientInsurance.rank],
        set,
      })
    return true
  } catch (e) {
    console.error('[insurance-eligibility] upsert plan failed:', e)
    return false
  }
}

export async function removeSecondaryInsurance(organizationId: string, patientId: string): Promise<void> {
  await db
    .delete(schema.patientInsurance)
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.patientId, patientId),
        eq(schema.patientInsurance.rank, 'secondary'),
      ),
    )
}

/** Stamp a remembered card on a slot (the check's "remember"); never touches the slot's flat fields. */
export async function rememberSlotCard(
  organizationId: string,
  patientId: string,
  rank: InsuranceRank,
  detail: PatientInsuranceDetail,
): Promise<boolean> {
  if (rank === 'primary') {
    const cur = await getPatientInsurance(organizationId, patientId, 'primary')
    return upsertPatientInsurance(organizationId, patientId, 'primary', {
      provider: cur?.provider ?? null,
      policyNumber: cur?.policyNumber ?? null,
      groupNumber: cur?.groupNumber ?? null,
      detail,
    })
  }
  const updated = await db
    .update(schema.patientInsurance)
    .set({ detail, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.patientId, patientId),
        eq(schema.patientInsurance.rank, 'secondary'),
      ),
    )
    .returning({ id: schema.patientInsurance.id })
  return updated.length > 0
}

/** Which patients (of the given ids, this org) carry a secondary plan — for lists that only need the fact. */
export async function patientsWithSecondary(organizationId: string, patientIds: string[]): Promise<Set<string>> {
  if (patientIds.length === 0) return new Set()
  const rows = await db
    .select({ patientId: schema.patientInsurance.patientId })
    .from(schema.patientInsurance)
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.rank, 'secondary'),
        inArray(schema.patientInsurance.patientId, patientIds),
      ),
    )
  return new Set(rows.map((r) => r.patientId))
}

/**
 * A merge folds the duplicate's SECOND plan onto the survivor only when the
 * survivor has none (the survivor's own card is never replaced - the same
 * "fill the blanks" rule the flat columns follow). Org-scoped, best-effort.
 */
export async function carrySecondaryOnMerge(organizationId: string, survivorId: string, duplicateId: string): Promise<boolean> {
  const mine = and(
    eq(schema.patientInsurance.organizationId, organizationId),
    eq(schema.patientInsurance.rank, 'secondary'),
  )
  const [has] = await db
    .select({ id: schema.patientInsurance.id })
    .from(schema.patientInsurance)
    .where(and(mine, eq(schema.patientInsurance.patientId, survivorId)))
    .limit(1)
  if (has) return false
  const moved = await db
    .update(schema.patientInsurance)
    .set({ patientId: survivorId, updatedAt: new Date() })
    .where(and(mine, eq(schema.patientInsurance.patientId, duplicateId)))
    .returning({ id: schema.patientInsurance.id })
  return moved.length > 0
}
