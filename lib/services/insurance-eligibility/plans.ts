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
 * A patient's coverage SLOTS (ML-50). The primary stays the flat
 * `patient.insurance_*` columns — they are the display truth every existing
 * reader (PMS sync, portal profile, edit modal, intake) still writes, so the
 * primary slot is READ from them and mirrored into `patient_insurance` here,
 * the ONE place that writes the mirror. The secondary has no flat columns: its
 * table row is authoritative. Both carry their own card, payer, member id and
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

/** [primary?, secondary?] — a slot with nothing on it is absent. */
export async function listPatientInsurance(organizationId: string, patientId: string): Promise<InsuranceCard[]> {
  const [p] = await db
    .select({
      provider: schema.patient.insuranceProvider,
      policy: schema.patient.insurancePolicyNumber,
      group: schema.patient.insuranceGroupNumber,
      detail: schema.patient.insuranceDetail,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p) return []
  const out: InsuranceCard[] = []
  const primary = { provider: clean(p.provider), policyNumber: clean(p.policy), groupNumber: clean(p.group) }
  if (hasAnything(primary)) {
    const d = parseInsuranceDetail(p.detail)
    out.push({ rank: 'primary', ...primary, detail: detailMatchesOnFile(d, p.policy) ? d : null })
  }
  const [s] = await db
    .select()
    .from(schema.patientInsurance)
    .where(
      and(
        eq(schema.patientInsurance.organizationId, organizationId),
        eq(schema.patientInsurance.patientId, patientId),
        eq(schema.patientInsurance.rank, 'secondary'),
      ),
    )
    .limit(1)
  if (s) {
    const card = { provider: clean(s.provider), policyNumber: clean(s.policyNumber), groupNumber: clean(s.groupNumber) }
    if (hasAnything(card)) {
      const d = parseInsuranceDetail(s.detail)
      out.push({ rank: 'secondary', ...card, detail: detailMatchesOnFile(d, s.policyNumber) ? d : null })
    }
  }
  return out
}

/**
 * Write one slot. Primary → the flat columns (the display truth) AND the
 * mirror row; secondary → its table row. Org-scoped on the ownership check
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
    const updated = await db
      .update(schema.patient)
      .set({ insuranceDetail: detail, updatedAt: new Date() })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
      .returning({ id: schema.patient.id })
    return updated.length > 0
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
