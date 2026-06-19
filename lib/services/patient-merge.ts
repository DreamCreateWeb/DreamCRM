import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Patient merge — fold a duplicate patient record into a survivor, moving ALL of
 * the duplicate's history onto the survivor so the relationship is whole again
 * (two bookings under two emails → one patient). Every table that attaches to a
 * patient is re-pointed; scalar gaps on the survivor are filled from the
 * duplicate; the duplicate is tombstoned (archived + `mergedIntoPatientId`) — NOT
 * hard-deleted, so the merge stays auditable and a missed relation can never
 * cascade-delete data. Runs in one transaction.
 */

export interface MergeResult {
  ok: boolean
  survivorId: string
  error?: string
}

/** The patient-attached tables re-pointed by a plain `set patient_id = survivor`
 *  update. (Tag assignments + threads need special handling — see below.) */
const SIMPLE_REPOINTS: Array<{ table: keyof typeof schema; col: 'patientId' }> = [
  { table: 'appointment', col: 'patientId' },
  { table: 'patientNote', col: 'patientId' },
  { table: 'patientDocument', col: 'patientId' },
  { table: 'patientFollowup', col: 'patientId' },
  { table: 'patientMessage', col: 'patientId' },
  { table: 'emailMessage', col: 'patientId' },
  { table: 'formSubmission', col: 'patientId' },
  { table: 'reviewRequest', col: 'patientId' },
  { table: 'shopCoupon', col: 'patientId' },
  { table: 'shopOrder', col: 'patientId' },
  { table: 'membership', col: 'patientId' },
  { table: 'patientBalancePayment', col: 'patientId' },
  { table: 'platformReview', col: 'patientId' },
  { table: 'customers', col: 'patientId' },
  { table: 'campaignEvents', col: 'patientId' },
]

/** Scalar fields filled on the survivor only when the survivor's is empty. */
const FILLABLE_FIELDS = [
  'email', 'phone', 'dateOfBirth', 'addressLine1', 'city', 'state', 'postalCode',
  'insuranceProvider', 'insurancePolicyNumber', 'insuranceGroupNumber',
  'pmsBalanceCents', 'pmsRecallDueAt', 'pmsRecallInterval', 'recallIntervalMonths',
] as const

export async function mergePatients(
  organizationId: string,
  survivorId: string,
  duplicateId: string,
  _userId: string | null,
): Promise<MergeResult> {
  if (survivorId === duplicateId) return { ok: false, survivorId, error: 'Pick two different patients to merge.' }

  // Both must be live patients in this org (not already tombstoned).
  const rows = await db
    .select()
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), sql`${schema.patient.id} in (${survivorId}, ${duplicateId})`))
  const survivor = rows.find((r) => r.id === survivorId)
  const duplicate = rows.find((r) => r.id === duplicateId)
  if (!survivor || !duplicate) return { ok: false, survivorId, error: 'Patient not found in this organization.' }
  if (survivor.mergedIntoPatientId || duplicate.mergedIntoPatientId) {
    return { ok: false, survivorId, error: 'One of these records was already merged.' }
  }

  await db.transaction(async (tx) => {
    // 1. Simple re-points (set patient_id = survivor).
    for (const { table } of SIMPLE_REPOINTS) {
      const t = schema[table] as never
      await tx
        .update(t)
        .set({ patientId: survivorId } as never)
        .where(eq((t as { patientId: unknown }).patientId as never, duplicateId))
    }

    // 2. Tags — composite PK (patientId, tagId). Move only the ones the survivor
    //    doesn't already have, then drop the duplicate's remaining links.
    await tx.execute(sql`
      update ${schema.patientTagAssignment} set patient_id = ${survivorId}
      where patient_id = ${duplicateId}
        and tag_id not in (
          select tag_id from ${schema.patientTagAssignment} where patient_id = ${survivorId}
        )
    `)
    await tx.delete(schema.patientTagAssignment).where(eq(schema.patientTagAssignment.patientId, duplicateId))

    // 3. Lead backref (set null FK) + dependents pointing at the dup as guardian.
    await tx
      .update(schema.lead)
      .set({ convertedToPatientId: survivorId })
      .where(eq(schema.lead.convertedToPatientId, duplicateId))
    await tx
      .update(schema.patient)
      .set({ guardianPatientId: survivorId })
      .where(eq(schema.patient.guardianPatientId, duplicateId))

    // 4. Threads — one per (org, patient). If the survivor already has a thread,
    //    move the dup thread's messages onto it (patient_id is already fixed in
    //    step 1) then delete the dup thread; else re-point the dup thread.
    const [survThread] = await tx
      .select({ id: schema.patientThread.id })
      .from(schema.patientThread)
      .where(and(eq(schema.patientThread.organizationId, organizationId), eq(schema.patientThread.patientId, survivorId)))
      .limit(1)
    const [dupThread] = await tx
      .select({ id: schema.patientThread.id })
      .from(schema.patientThread)
      .where(and(eq(schema.patientThread.organizationId, organizationId), eq(schema.patientThread.patientId, duplicateId)))
      .limit(1)
    if (dupThread) {
      if (survThread) {
        await tx
          .update(schema.patientMessage)
          .set({ threadId: survThread.id })
          .where(eq(schema.patientMessage.threadId, dupThread.id))
        await tx.delete(schema.patientThread).where(eq(schema.patientThread.id, dupThread.id))
      } else {
        await tx
          .update(schema.patientThread)
          .set({ patientId: survivorId })
          .where(eq(schema.patientThread.id, dupThread.id))
      }
    }

    // 5. Fill the survivor's empty scalar fields from the duplicate.
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    for (const f of FILLABLE_FIELDS) {
      const sv = (survivor as Record<string, unknown>)[f]
      const dv = (duplicate as Record<string, unknown>)[f]
      const empty = sv === null || sv === undefined || sv === ''
      if (empty && dv !== null && dv !== undefined && dv !== '') patch[f] = dv
    }
    // Keep the earliest first-seen + latest activity.
    if (duplicate.firstSeenAt && (!survivor.firstSeenAt || duplicate.firstSeenAt < survivor.firstSeenAt)) {
      patch.firstSeenAt = duplicate.firstSeenAt
    }
    if (duplicate.lastActivityAt && (!survivor.lastActivityAt || duplicate.lastActivityAt > survivor.lastActivityAt)) {
      patch.lastActivityAt = duplicate.lastActivityAt
    }
    await tx.update(schema.patient).set(patch).where(eq(schema.patient.id, survivorId))

    // 6. Tombstone the duplicate (archived + pointer; not deleted).
    await tx
      .update(schema.patient)
      .set({ mergedIntoPatientId: survivorId, isActive: 0, lifecycle: 'archived', updatedAt: new Date() })
      .where(eq(schema.patient.id, duplicateId))
  })

  return { ok: true, survivorId }
}

/**
 * Suggest likely duplicates of a patient — other LIVE patients in the org whose
 * email or phone matches (the common double-booking signal). Excludes self +
 * already-merged tombstones. Cheap; used to seed the merge picker.
 */
export async function findMergeCandidates(
  organizationId: string,
  patientId: string,
): Promise<Array<{ id: string; name: string; email: string | null; phone: string | null; reason: string }>> {
  const [p] = await db
    .select({ email: schema.patient.email, phone: schema.patient.phone })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)
  if (!p || (!p.email && !p.phone)) return []

  const rows = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      phone: schema.patient.phone,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        ne(schema.patient.id, patientId),
        sql`${schema.patient.mergedIntoPatientId} is null`,
        sql`(
          (${p.email ?? ''} <> '' and lower(${schema.patient.email}) = lower(${p.email ?? ''}))
          or (${p.phone ?? ''} <> '' and ${schema.patient.phone} = ${p.phone ?? ''})
        )`,
      ),
    )
    .limit(10)
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: r.phone,
    reason: r.email && p.email && r.email.toLowerCase() === p.email.toLowerCase() ? 'same email' : 'same phone',
  }))
}
