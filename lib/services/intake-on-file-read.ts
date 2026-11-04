import 'server-only'
import { and, eq, inArray, max } from 'drizzle-orm'
import { db } from '@/lib/db'
import { formSubmission } from '@/lib/db/schema/clinic'
import { listFormTemplates } from '@/lib/services/forms'
import { isIntakeOnFile, pickAutoSendForm, type IntakeAutoSendRule } from '@/lib/intake-on-file'

/**
 * THE DISPLAY READ of "is this patient's intake on file?" (ML-30). ML-27 made
 * on-file a rule — a form's refresh window ages a submission out, and a
 * visit-specific form counts only when THAT form was filled — and the
 * reminder cron already asks `isIntakeOnFile`. The agenda pill, the Overview
 * glyph, the patient list/record flag and the day audit used to ask "any
 * submission, ever", so the desk saw "on file" while the cron was nudging.
 * They all ask this now: ONE grouped query per call, then the same predicate.
 *
 * When no live rule covers the visit (or the practice has no form at all) the
 * old reading stands: any submission counts. Nothing is chased there, so
 * nothing can contradict the cron.
 */
export interface IntakeOnFileReader {
  /** True when the patient's paperwork is on file for a visit of this type. */
  has(patientId: string, appointmentType?: string | null): boolean
}

export async function loadIntakeOnFile(
  organizationId: string,
  patientIds: string[],
  now: Date,
  timeZone: string | null | undefined,
): Promise<IntakeOnFileReader> {
  const ids = Array.from(new Set(patientIds.filter(Boolean)))
  if (ids.length === 0) return { has: () => false }

  const [forms, rows] = await Promise.all([
    listFormTemplates(organizationId),
    db
      .select({
        patientId: formSubmission.patientId,
        formTemplateId: formSubmission.formTemplateId,
        last: max(formSubmission.submittedAt),
      })
      .from(formSubmission)
      .where(and(eq(formSubmission.organizationId, organizationId), inArray(formSubmission.patientId, ids)))
      .groupBy(formSubmission.patientId, formSubmission.formTemplateId),
  ])

  const latestAny = new Map<string, Date>()
  const latestByForm = new Map<string, Date>()
  for (const r of rows) {
    if (!r.patientId) continue
    const last = r.last instanceof Date ? r.last : r.last ? new Date(r.last as unknown as string) : null
    if (!last || Number.isNaN(last.getTime())) continue
    const prev = latestAny.get(r.patientId)
    if (!prev || last > prev) latestAny.set(r.patientId, last)
    if (r.formTemplateId) latestByForm.set(`${r.patientId}:${r.formTemplateId}`, last)
  }

  return {
    has(patientId, appointmentType) {
      const any = latestAny.get(patientId) ?? null
      if (!any) return false
      const form = pickAutoSendForm(forms, { isNewPatient: null, appointmentType: appointmentType ?? null })
      if (!form) return true
      return isIntakeOnFile(form, { any, ofForm: latestByForm.get(`${patientId}:${form.id}`) ?? null }, now, timeZone)
    },
  }
}

/**
 * Is THIS patient's paperwork on file for THIS rule (the form the booking
 * confirmation was about to attach)? The send side of the same predicate: a
 * second visit inside the refresh window is "already on file — nothing sent",
 * not another request for the form they filled last week.
 */
export async function isIntakeOnFileForRule(
  organizationId: string,
  patientId: string,
  rule: Pick<IntakeAutoSendRule, 'appointmentTypeIds' | 'refreshMonths'> & { id: string },
  now: Date,
  timeZone: string | null | undefined,
): Promise<boolean> {
  const rows = await db
    .select({
      formTemplateId: formSubmission.formTemplateId,
      last: max(formSubmission.submittedAt),
    })
    .from(formSubmission)
    .where(and(eq(formSubmission.organizationId, organizationId), eq(formSubmission.patientId, patientId)))
    .groupBy(formSubmission.formTemplateId)
  let any: Date | null = null
  let ofForm: Date | null = null
  for (const r of rows) {
    const last = r.last instanceof Date ? r.last : r.last ? new Date(r.last as unknown as string) : null
    if (!last || Number.isNaN(last.getTime())) continue
    if (!any || last > any) any = last
    if (r.formTemplateId === rule.id) ofForm = last
  }
  return isIntakeOnFile(rule, { any, ofForm }, now, timeZone)
}
