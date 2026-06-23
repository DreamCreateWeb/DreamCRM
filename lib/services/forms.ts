import 'server-only'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { formTemplate, formSubmission, patient } from '@/lib/db/schema/clinic'
import type { FormTemplate, FormSubmission } from '@/lib/db/schema/clinic'
import { newId, slugify } from '@/lib/utils'
import {
  type FormTemplateSchema,
  type FormSubmissionData,
  DEFAULT_INTAKE_TEMPLATE,
  prefillFromPriorData,
  buildIntakeTranscript,
} from '@/lib/types/forms'

/**
 * Intake form service. Templates are clinic-owned, the public site
 * surfaces them by slug for fill, submissions are stored per-org and
 * optionally linked to a patient + appointment for follow-up + prefill.
 */

export const FormTemplateInput = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  schema: z.object({
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(120),
        description: z.string().max(500).optional().nullable(),
        fields: z.array(z.any()),
      }),
    ),
  }),
  isDefault: z.boolean().optional(),
})

export interface TemplateSubmissionStats {
  count: number
  lastSubmittedAt: Date | null
}

/**
 * Per-template submission rollup for the intake-forms list. One grouped
 * query over the org's submissions so the list can show which forms are
 * actually being used (count) and how recently each was filled out —
 * the signal a clinic needs to tell a working form from a dead one.
 * Templates with zero submissions simply won't appear in the map.
 */
export async function getSubmissionStatsForTemplates(
  organizationId: string,
): Promise<Map<string, TemplateSubmissionStats>> {
  const rows = await db
    .select({
      formTemplateId: formSubmission.formTemplateId,
      count: sql<number>`count(*)::int`,
      lastSubmittedAt: sql<Date | string | null>`max(${formSubmission.submittedAt})`,
    })
    .from(formSubmission)
    .where(eq(formSubmission.organizationId, organizationId))
    .groupBy(formSubmission.formTemplateId)

  const map = new Map<string, TemplateSubmissionStats>()
  for (const r of rows) {
    map.set(r.formTemplateId, {
      count: Number(r.count) || 0,
      lastSubmittedAt: r.lastSubmittedAt ? new Date(r.lastSubmittedAt) : null,
    })
  }
  return map
}

export async function listFormTemplates(organizationId: string): Promise<FormTemplate[]> {
  return db
    .select()
    .from(formTemplate)
    .where(
      and(eq(formTemplate.organizationId, organizationId), isNull(formTemplate.archivedAt)),
    )
    .orderBy(desc(formTemplate.isDefault), desc(formTemplate.createdAt))
}

export async function getFormTemplate(
  organizationId: string,
  id: string,
): Promise<FormTemplate | null> {
  const [row] = await db
    .select()
    .from(formTemplate)
    .where(and(eq(formTemplate.id, id), eq(formTemplate.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

/** Public-site fetch by slug. Skips archived templates so a deleted form
 * doesn't keep accepting submissions. */
export async function getFormTemplateBySlug(
  organizationId: string,
  slug: string,
): Promise<FormTemplate | null> {
  const [row] = await db
    .select()
    .from(formTemplate)
    .where(
      and(
        eq(formTemplate.organizationId, organizationId),
        eq(formTemplate.slug, slug),
        isNull(formTemplate.archivedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/** First non-archived template marked default. Used to attach an intake
 * link to the booking confirmation email. */
export async function getDefaultFormTemplate(
  organizationId: string,
): Promise<FormTemplate | null> {
  const [row] = await db
    .select()
    .from(formTemplate)
    .where(
      and(
        eq(formTemplate.organizationId, organizationId),
        eq(formTemplate.isDefault, 1),
        isNull(formTemplate.archivedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

async function uniqueSlug(organizationId: string, baseTitle: string): Promise<string> {
  const root = slugify(baseTitle) || 'form'
  let attempt = root
  let n = 1
  while (true) {
    const [existing] = await db
      .select({ id: formTemplate.id })
      .from(formTemplate)
      .where(
        and(eq(formTemplate.organizationId, organizationId), eq(formTemplate.slug, attempt)),
      )
      .limit(1)
    if (!existing) return attempt
    n += 1
    attempt = `${root}-${n}`
  }
}

export async function createFormTemplate(
  organizationId: string,
  input: z.infer<typeof FormTemplateInput>,
): Promise<FormTemplate> {
  const data = FormTemplateInput.parse(input)
  const slug = await uniqueSlug(organizationId, data.title)
  if (data.isDefault) await clearDefaultFlag(organizationId)
  const [row] = await db
    .insert(formTemplate)
    .values({
      id: newId('form'),
      organizationId,
      title: data.title,
      description: data.description ?? null,
      slug,
      schema: data.schema as FormTemplateSchema,
      isDefault: data.isDefault ? 1 : 0,
    })
    .returning()
  return row
}

async function clearDefaultFlag(organizationId: string, exceptId?: string) {
  const where = exceptId
    ? and(eq(formTemplate.organizationId, organizationId), ne(formTemplate.id, exceptId))
    : eq(formTemplate.organizationId, organizationId)
  await db.update(formTemplate).set({ isDefault: 0 }).where(where)
}

export async function updateFormTemplate(
  organizationId: string,
  id: string,
  input: z.infer<typeof FormTemplateInput>,
): Promise<FormTemplate | null> {
  const data = FormTemplateInput.parse(input)
  if (data.isDefault) await clearDefaultFlag(organizationId, id)
  const [row] = await db
    .update(formTemplate)
    .set({
      title: data.title,
      description: data.description ?? null,
      schema: data.schema as FormTemplateSchema,
      isDefault: data.isDefault ? 1 : 0,
      updatedAt: new Date(),
    })
    .where(and(eq(formTemplate.id, id), eq(formTemplate.organizationId, organizationId)))
    .returning()
  return row ?? null
}

/** Soft delete — archived templates stay around for old submissions to
 * reference but won't accept new ones and won't show in the list. */
export async function archiveFormTemplate(
  organizationId: string,
  id: string,
): Promise<void> {
  await db
    .update(formTemplate)
    .set({ archivedAt: new Date(), isDefault: 0, updatedAt: new Date() })
    .where(and(eq(formTemplate.id, id), eq(formTemplate.organizationId, organizationId)))
}

export interface SubmitFormInput {
  organizationId: string
  formTemplateId: string
  data: FormSubmissionData
  patientId?: string | null
  appointmentId?: string | null
  submitterName?: string | null
  submitterEmail?: string | null
  submitterPhone?: string | null
}

export async function submitForm(input: SubmitFormInput): Promise<FormSubmission> {
  // Public submissions arrive with no patientId. If the submitter's email
  // matches a patient in this org, link it so the submission shows on that
  // patient's timeline + records instead of vanishing into an unattached row.
  let patientId = input.patientId ?? null
  let patientName: string | null = null
  if (!patientId && input.submitterEmail) {
    const [p] = await db
      .select({ id: patient.id, firstName: patient.firstName, lastName: patient.lastName })
      .from(patient)
      .where(and(eq(patient.organizationId, input.organizationId), eq(patient.email, input.submitterEmail)))
      .limit(1)
    patientId = p?.id ?? null
    if (p) patientName = `${p.firstName} ${p.lastName}`.trim()
  }
  const [row] = await db
    .insert(formSubmission)
    .values({
      id: newId('sub'),
      organizationId: input.organizationId,
      formTemplateId: input.formTemplateId,
      patientId,
      appointmentId: input.appointmentId ?? null,
      data: input.data,
      submitterName: input.submitterName ?? null,
      submitterEmail: input.submitterEmail ?? null,
      submitterPhone: input.submitterPhone ?? null,
    })
    .returning()

  // Ping the front desk so a fresh intake submission gets reviewed before the
  // visit. Best-effort — the submission row above is the source of truth.
  try {
    const who = patientName || input.submitterName || input.submitterEmail || 'a patient'
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      input.organizationId,
      {
        bucket: 'comments',
        type: 'intake_submitted',
        title: `Intake form submitted — ${who}`,
        body: 'A patient completed an intake form on your website.',
        linkPath: patientId ? `/patients/${patientId}` : '/intake-forms',
        meta: { submissionId: row.id, patientId },
      },
      { roles: ['owner', 'admin'] },
    )
  } catch (err) {
    console.warn('[forms.submitForm] notification failed', err)
  }

  // Mirror the completed form into the patient's Open Dental chart as a CommLog
  // note — the REAL answers as text, framed honestly as "a copy in your chart"
  // (NOT a fabricated structured field sync; uploads/signature live in DreamCRM).
  // Best-effort + only for a known patient + a two-way PMS connection (the
  // guard lives inside queueCommLogWriteBack).
  if (patientId) {
    try {
      const [tpl] = await db
        .select({ title: formTemplate.title, schema: formTemplate.schema })
        .from(formTemplate)
        .where(and(eq(formTemplate.organizationId, input.organizationId), eq(formTemplate.id, input.formTemplateId)))
        .limit(1)
      if (tpl) {
        const transcript = buildIntakeTranscript(tpl.schema as FormTemplateSchema, input.data)
        const header = `Patient completed the "${tpl.title}" intake form via DreamCRM.`
        const note = (transcript ? `${header}\n\n${transcript}` : `${header} Full responses + any uploaded photos are on file in DreamCRM.`).slice(0, 4000)
        const { queueCommLogWriteBack } = await import('@/lib/services/pms/sync')
        await queueCommLogWriteBack(input.organizationId, patientId, { note, mode: 'Email', sentOrReceived: 'Received' })
      }
    } catch (err) {
      console.warn('[forms.submitForm] OD chart mirror failed', err)
    }
  }

  return row
}

export async function listSubmissionsForPatient(
  organizationId: string,
  patientId: string,
): Promise<FormSubmission[]> {
  return db
    .select()
    .from(formSubmission)
    .where(
      and(
        eq(formSubmission.organizationId, organizationId),
        eq(formSubmission.patientId, patientId),
      ),
    )
    .orderBy(desc(formSubmission.submittedAt))
}

/**
 * Pre-fill values for a returning patient — the data from their most recent
 * submission of this template, minus file/insurance uploads (a fresh photo
 * should always be taken). Returns {} when there's no prior submission. The
 * returning patient then just confirms/updates instead of re-typing.
 */
export async function getReturnVisitPrefill(
  organizationId: string,
  patientId: string,
  formTemplateId: string,
): Promise<FormSubmissionData> {
  const [prior] = await db
    .select({ data: formSubmission.data, schema: formTemplate.schema })
    .from(formSubmission)
    .innerJoin(formTemplate, eq(formSubmission.formTemplateId, formTemplate.id))
    .where(
      and(
        eq(formSubmission.organizationId, organizationId),
        eq(formSubmission.patientId, patientId),
        eq(formSubmission.formTemplateId, formTemplateId),
      ),
    )
    .orderBy(desc(formSubmission.submittedAt))
    .limit(1)
  if (!prior) return {}
  return prefillFromPriorData(prior.schema as FormTemplateSchema, prior.data as FormSubmissionData)
}

export async function listSubmissionsForTemplate(
  organizationId: string,
  formTemplateId: string,
  limit = 50,
): Promise<FormSubmission[]> {
  return db
    .select()
    .from(formSubmission)
    .where(
      and(
        eq(formSubmission.organizationId, organizationId),
        eq(formSubmission.formTemplateId, formTemplateId),
      ),
    )
    .orderBy(desc(formSubmission.submittedAt))
    .limit(limit)
}

export interface SubmissionForReview {
  submission: FormSubmission
  template: FormTemplate
  patientId: string | null
  patientName: string | null
}

/** Load one submission (org-scoped) with its template + linked patient name,
 * for the read-only submission viewer. Null when not found in this org. */
export async function getSubmissionForReview(
  organizationId: string,
  submissionId: string,
): Promise<SubmissionForReview | null> {
  const [sub] = await db
    .select()
    .from(formSubmission)
    .where(and(eq(formSubmission.organizationId, organizationId), eq(formSubmission.id, submissionId)))
    .limit(1)
  if (!sub) return null
  const [tmpl] = await db
    .select()
    .from(formTemplate)
    .where(and(eq(formTemplate.organizationId, organizationId), eq(formTemplate.id, sub.formTemplateId)))
    .limit(1)
  if (!tmpl) return null
  let patientName: string | null = null
  if (sub.patientId) {
    const [p] = await db
      .select({ firstName: patient.firstName, lastName: patient.lastName })
      .from(patient)
      .where(and(eq(patient.organizationId, organizationId), eq(patient.id, sub.patientId)))
      .limit(1)
    if (p) patientName = `${p.firstName} ${p.lastName}`.trim()
  }
  return { submission: sub, template: tmpl, patientId: sub.patientId, patientName }
}

/** Used by demo seeder + future onboarding: seed a starter intake form
 * for a brand-new clinic so they have something to send patients
 * immediately. Idempotent on the (org, slug) unique index — if the
 * slug already exists we leave it alone. */
export async function seedDefaultIntakeForm(organizationId: string): Promise<void> {
  const slug = 'new-patient-intake'
  const [existing] = await db
    .select({ id: formTemplate.id })
    .from(formTemplate)
    .where(and(eq(formTemplate.organizationId, organizationId), eq(formTemplate.slug, slug)))
    .limit(1)
  if (existing) return
  await db.insert(formTemplate).values({
    id: newId('form'),
    organizationId,
    title: 'New Patient Intake',
    description:
      'A standard intake form for new patients — demographics, insurance, medical history, dental history, and consent. Edit anything you like.',
    slug,
    schema: DEFAULT_INTAKE_TEMPLATE,
    isDefault: 1,
  })
}
