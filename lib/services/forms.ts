import 'server-only'
import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { formTemplate, formSubmission, formPacket, patient } from '@/lib/db/schema/clinic'
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
  autoSendAudience: z.enum(['all', 'new', 'returning']).optional(),
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

// ----- 8-week heartbeat series -------------------------------------------

export interface FormsCompletedPerWeekPoint {
  bucket: string
  value: number
}

/**
 * Forms completed per clinic-local week over the trailing 8 weeks (current
 * week included, oldest first) — the Intake Forms page's single heartbeat
 * sparkline (Design System law 7). "Completed" buckets by
 * `form_submission.submittedAt`: a submission row only exists once the
 * patient finishes and submits (there is no draft state), so `submittedAt`
 * IS the completion moment — the module's win.
 *
 * Week boundaries are CLINIC-LOCAL via `clinicWeekStart` (the server runs
 * UTC; a Saturday-night Central submission is already Sunday in UTC and must
 * not jump a week). Boundaries walk back via "the instant just before this
 * week's start" so every one is a true clinic-local Sunday midnight across
 * DST — never naive -7*24h math. One org-scoped range scan (rides the
 * form_submission_org_template_idx composite); bucketing in JS. Bucket
 * labels read like 'Jun 2' (the week's Sunday). `now` is injectable for
 * tests only. Mirrors lib/services/patients.ts → getNewPatientsPerWeek12.
 */
export async function getFormsCompletedPerWeek8(
  organizationId: string,
  now: Date = new Date(),
): Promise<FormsCompletedPerWeekPoint[]> {
  const tz = await getClinicTimeZone(organizationId)

  // The 8 clinic-local week starts, oldest first (DST-safe walk-back).
  const boundaries: Date[] = []
  let cursor = clinicWeekStart(now, tz)
  for (let i = 0; i < 8; i++) {
    boundaries.unshift(cursor)
    cursor = clinicWeekStart(new Date(cursor.getTime() - 1), tz)
  }

  const rows = await db
    .select({ submittedAt: formSubmission.submittedAt })
    .from(formSubmission)
    .where(
      and(
        eq(formSubmission.organizationId, organizationId),
        gte(formSubmission.submittedAt, boundaries[0]),
      ),
    )

  const counts = new Array<number>(8).fill(0)
  for (const r of rows) {
    if (!r.submittedAt) continue
    const t = r.submittedAt.getTime()
    // Last boundary <= submittedAt owns the submission.
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (t >= boundaries[i].getTime()) {
        counts[i] += 1
        break
      }
    }
  }

  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  return boundaries.map((b, i) => ({ bucket: label.format(b), value: counts[i] }))
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
      autoSendAudience: data.autoSendAudience ?? 'all',
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
      ...(data.autoSendAudience ? { autoSendAudience: data.autoSendAudience } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(formTemplate.id, id), eq(formTemplate.organizationId, organizationId)))
    .returning()
  return row ?? null
}

/**
 * Pick the form to send with a booking confirmation for a given patient. An
 * audience-specific match ('new' / 'returning') wins over an 'all' form, which
 * wins over the org default. Returns null when there's nothing to send.
 */
export async function getBookingIntakeForm(
  organizationId: string,
  isNewPatient: boolean,
): Promise<FormTemplate | null> {
  const forms = await db
    .select()
    .from(formTemplate)
    .where(and(eq(formTemplate.organizationId, organizationId), isNull(formTemplate.archivedAt)))
  if (forms.length === 0) return null
  const want = isNewPatient ? 'new' : 'returning'
  const specific = forms.filter((f) => f.autoSendAudience === want)
  if (specific.length > 0) return mostRecent(specific)
  const all = forms.filter((f) => f.autoSendAudience === 'all')
  if (all.length > 0) {
    // Prefer the default among the 'all' forms.
    return all.find((f) => f.isDefault === 1) ?? mostRecent(all)
  }
  return forms.find((f) => f.isDefault === 1) ?? null
}

function mostRecent(forms: FormTemplate[]): FormTemplate {
  return [...forms].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}

// ── Form packets (a bundle of forms completed in one sitting) ───────────────

export interface FormPacketRow {
  id: string
  title: string
  slug: string
  formIds: string[]
}

/** Create a packet from an ordered list of (existing, non-archived) form ids. */
export async function createPacket(
  organizationId: string,
  input: { title: string; formIds: string[] },
): Promise<FormPacketRow> {
  const title = input.title.trim() || 'Form packet'
  const slug = await uniquePacketSlug(organizationId, title)
  // Keep only ids that actually belong to this org (defense against a stale/
  // foreign id), preserving order + dropping dupes.
  const owned = await db
    .select({ id: formTemplate.id })
    .from(formTemplate)
    .where(and(eq(formTemplate.organizationId, organizationId), isNull(formTemplate.archivedAt)))
  const ownedSet = new Set(owned.map((f) => f.id))
  const formIds = Array.from(new Set(input.formIds)).filter((id) => ownedSet.has(id))
  const [row] = await db
    .insert(formPacket)
    .values({ id: newId('pkt'), organizationId, title, slug, formIds })
    .returning()
  return { id: row.id, title: row.title, slug: row.slug, formIds: row.formIds as string[] }
}

export async function listPackets(organizationId: string): Promise<FormPacketRow[]> {
  const rows = await db
    .select()
    .from(formPacket)
    .where(and(eq(formPacket.organizationId, organizationId), isNull(formPacket.archivedAt)))
    .orderBy(desc(formPacket.createdAt))
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, formIds: r.formIds as string[] }))
}

export async function deletePacket(organizationId: string, id: string): Promise<void> {
  await db
    .update(formPacket)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(formPacket.id, id), eq(formPacket.organizationId, organizationId)))
}

/** A packet + its ordered, non-archived forms — for the public sequential fill.
 *  null when the packet or all its forms are gone. */
export async function getPacketWithForms(
  organizationId: string,
  slug: string,
): Promise<{ packet: FormPacketRow; forms: FormTemplate[] } | null> {
  const [pkt] = await db
    .select()
    .from(formPacket)
    .where(and(eq(formPacket.organizationId, organizationId), eq(formPacket.slug, slug), isNull(formPacket.archivedAt)))
    .limit(1)
  if (!pkt) return null
  const ids = (pkt.formIds as string[]) ?? []
  if (ids.length === 0) return null
  // Fetch only the packet's own forms (was: SELECT * over EVERY org template,
  // dragging each form's schema + translations jsonb on a public page render).
  const all = await db
    .select()
    .from(formTemplate)
    .where(
      and(
        eq(formTemplate.organizationId, organizationId),
        isNull(formTemplate.archivedAt),
        inArray(formTemplate.id, ids),
      ),
    )
  const byId = new Map(all.map((f) => [f.id, f]))
  // Preserve packet order; drop any form that's since been archived/deleted.
  const forms = ids.map((id) => byId.get(id)).filter((f): f is FormTemplate => !!f)
  if (forms.length === 0) return null
  return { packet: { id: pkt.id, title: pkt.title, slug: pkt.slug, formIds: ids }, forms }
}

async function uniquePacketSlug(organizationId: string, baseTitle: string): Promise<string> {
  const root = slugify(baseTitle) || 'packet'
  let attempt = root
  let n = 1
  for (;;) {
    const [hit] = await db
      .select({ id: formPacket.id })
      .from(formPacket)
      .where(and(eq(formPacket.organizationId, organizationId), eq(formPacket.slug, attempt)))
      .limit(1)
    if (!hit) return attempt
    n += 1
    attempt = `${root}-${n}`
  }
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
      // The submitter must never receive the staff alert about their own
      // submission (owner-as-patient / platform-admin-demoing case).
      { roles: ['owner', 'admin'], excludeEmail: input.submitterEmail ?? null },
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

export interface SubmissionListItem {
  id: string
  submitterName: string | null
  submitterEmail: string | null
  submittedAt: Date
}

/** Recent submissions for the form-edit list. Narrowed to the columns the list
 *  renders — the `data` jsonb (the whole answer blob) is never read there, so
 *  fetching up to 50 of them was pure waste. */
export async function listSubmissionsForTemplate(
  organizationId: string,
  formTemplateId: string,
  limit = 50,
): Promise<SubmissionListItem[]> {
  return db
    .select({
      id: formSubmission.id,
      submitterName: formSubmission.submitterName,
      submitterEmail: formSubmission.submitterEmail,
      submittedAt: formSubmission.submittedAt,
    })
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

/** True total submission count for a template (the list above is capped, so its
 *  length can't be trusted for the header count). */
export async function countSubmissionsForTemplate(
  organizationId: string,
  formTemplateId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(formSubmission)
    .where(
      and(
        eq(formSubmission.organizationId, organizationId),
        eq(formSubmission.formTemplateId, formTemplateId),
      ),
    )
  return Number(row?.count) || 0
}

export interface RecentSubmission {
  id: string
  submittedAt: Date
  templateId: string
  templateTitle: string
  patientId: string | null
  patientName: string | null
  submitterName: string | null
  submitterEmail: string | null
}

/**
 * Recent submissions ACROSS every template — the cross-template index the
 * list page's "Completed · 8 weeks" heartbeat drills into. One org-scoped
 * query (rides form_submission_org_template_idx's org prefix): inner-join
 * the template for its title, left-join the patient for a linkable name —
 * public fills can be anonymous (patientId null), so the patient side is
 * nullable and callers fall back to submitterName/Email. Narrowed to the
 * columns the index renders; the `data` jsonb blob is never fetched.
 */
export async function listRecentSubmissions(
  organizationId: string,
  limit = 50,
): Promise<RecentSubmission[]> {
  const rows = await db
    .select({
      id: formSubmission.id,
      submittedAt: formSubmission.submittedAt,
      templateId: formTemplate.id,
      templateTitle: formTemplate.title,
      patientId: formSubmission.patientId,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      submitterName: formSubmission.submitterName,
      submitterEmail: formSubmission.submitterEmail,
    })
    .from(formSubmission)
    .innerJoin(formTemplate, eq(formSubmission.formTemplateId, formTemplate.id))
    .leftJoin(patient, eq(formSubmission.patientId, patient.id))
    .where(eq(formSubmission.organizationId, organizationId))
    .orderBy(desc(formSubmission.submittedAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    submittedAt: r.submittedAt,
    templateId: r.templateId,
    templateTitle: r.templateTitle,
    patientId: r.patientId,
    patientName:
      r.patientId && (r.patientFirstName || r.patientLastName)
        ? `${r.patientFirstName ?? ''} ${r.patientLastName ?? ''}`.trim()
        : null,
    submitterName: r.submitterName,
    submitterEmail: r.submitterEmail,
  }))
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
  // The template + patient lookups both depend only on the loaded submission and
  // are independent of each other — fire them together instead of in series.
  const [[tmpl], patientRow] = await Promise.all([
    db
      .select()
      .from(formTemplate)
      .where(and(eq(formTemplate.organizationId, organizationId), eq(formTemplate.id, sub.formTemplateId)))
      .limit(1),
    sub.patientId
      ? db
          .select({ firstName: patient.firstName, lastName: patient.lastName })
          .from(patient)
          .where(and(eq(patient.organizationId, organizationId), eq(patient.id, sub.patientId)))
          .limit(1)
      : Promise.resolve([]),
  ])
  if (!tmpl) return null
  const p = patientRow[0]
  const patientName = p ? `${p.firstName} ${p.lastName}`.trim() : null
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
