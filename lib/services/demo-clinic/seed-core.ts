import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { DEFAULT_INTAKE_TEMPLATE } from '@/lib/types/forms'
import type { PatientTagColor } from '@/lib/types/patient-tags'
import { todayYmd } from '@/lib/types/followups'
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/services/message-templates'
import { DEMO_FORM_ES, DEMO_INTAKE_FILE_DATA, DEMO_INTAKE_SUMMARY } from './clinic-config'
import { DEMO_HERO_IMAGE_2_URL, DEMO_OFFICE_PHOTOS } from './media'

// The everyday scaffolding of a demo clinic: goal, AI usage, patient tags,
// message templates, documents, follow-ups, patient views, intake forms, and
// the booking-attribution backfill.

/**
 * Seed a modest AI-rewrite usage count for the current month so the Website
 * Editor's tier-baked allowance meter shows a realistic non-zero value
 * (e.g. "188 of 200 left"). Demo-scoped + idempotent — pins a fixed value on
 * conflict so a resync always presents the same illustrative number.
 */
/**
 * THE DREAM TEAM's GOAL (docs/ai-operations.md, D6/D7c). One active goal so
 * the demo's /dream-team opens on a practice that has POINTED its team
 * somewhere — the goals section's populated state, the status band's
 * "pointed at your goal" line, and the ancestry line the generators read.
 *
 * Seed-if-absent: the owner tests goal-setting in the demo like everything
 * else, so a resync must never wipe a goal a person typed. `isDemo` marks
 * it for the same reason every other seeded artifact carries a marker.
 */
export async function seedDemoGoal(orgId: string): Promise<void> {
  const [existing] = await db
    .select({ id: schema.goal.id })
    .from(schema.goal)
    .where(eq(schema.goal.organizationId, orgId))
    .limit(1)
  if (existing) return
  const now = new Date()
  // Baselined three weeks back so the card shows a real running count
  // rather than "early days" on a demo that resyncs every deploy.
  const baselineAt = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
  await db.insert(schema.goal).values({
    id: newId('goal'),
    organizationId: orgId,
    objective: 'more implant patients',
    serviceFocus: 'dental-implants',
    status: 'active',
    createdByUserId: null,
    baselineNewPatients: 0,
    baselineAt,
    isDemo: 1,
    createdAt: baselineAt,
    updatedAt: baselineAt,
  })
}

export async function seedDemoAiUsage(orgId: string) {
  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  // Seed-if-absent (non-destructive): leave any real usage the demo has
  // accrued this month alone; only plant the illustrative value on a fresh
  // month / fresh demo.
  await db
    .insert(schema.aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period, kind: 'website_rewrite', count: 12 })
    .onConflictDoNothing()
}

// Curated demo tags + which personas (by name) carry them — so the Patients
// list chips, the detail tags editor, the tag filter, and the audience tag
// picker all showcase populated state. Matched by name so it works for both a
// fresh seed and a legacy self-heal (patient ids differ each seed).
const DEMO_PATIENT_TAGS: Array<{ name: string; color: PatientTagColor; patients: Array<[string, string]> }> = [
  { name: 'VIP', color: 'amber', patients: [['Mia', 'Hayes'], ['Sophia', 'Iverson']] },
  { name: 'Anxious', color: 'rose', patients: [['Marcus', 'Johnson'], ['Noah', 'Mitchell']] },
  { name: 'Needs follow-up', color: 'indigo', patients: [['Marcus', 'Johnson'], ['Aiden', 'Kim']] },
  { name: 'Cosmetic interest', color: 'violet', patients: [['Liam', 'Brooks'], ['Charlotte', 'Diaz']] },
]

/**
 * Seed the demo's patient tags + assignments. Idempotent: bails if the org has
 * no patients (nothing to tag) or already has any tag. Patients are matched by
 * name so the same call seeds a fresh demo and back-fills a legacy one.
 */
export async function seedDemoPatientTags(orgId: string): Promise<void> {
  const patients = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  if (patients.length === 0) return
  const [existing] = await db
    .select({ id: schema.patientTag.id })
    .from(schema.patientTag)
    .where(eq(schema.patientTag.organizationId, orgId))
    .limit(1)
  if (existing) return

  const idByName = new Map(patients.map((p) => [`${p.firstName} ${p.lastName}`, p.id]))
  for (const t of DEMO_PATIENT_TAGS) {
    const tagId = newId('ptag')
    await db.insert(schema.patientTag).values({ id: tagId, organizationId: orgId, name: t.name, color: t.color })
    const assignments = t.patients
      .map(([f, l]) => idByName.get(`${f} ${l}`))
      .filter((id): id is string => !!id)
      .map((patientId) => ({ patientId, tagId, organizationId: orgId }))
    if (assignments.length > 0) {
      await db.insert(schema.patientTagAssignment).values(assignments).onConflictDoNothing()
    }
  }
}

/**
 * Seed the demo's editable /messages reply templates: the 3 starters + one
 * custom example so the demo showcases the "add your own" state. Name-keyed
 * idempotent; bails on a demo with no patients (the exhausted-queue path) so it
 * never inserts on the seeder-test no-data run.
 */
export async function seedDemoMessageTemplates(orgId: string): Promise<void> {
  const patients = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
    .limit(1)
  if (patients.length === 0) return

  const existing = await db
    .select({ name: schema.emailSnippet.name })
    .from(schema.emailSnippet)
    .where(eq(schema.emailSnippet.organizationId, orgId))
  const have = new Set(existing.map((r) => r.name))
  const want: Array<{ name: string; body: string }> = [
    ...DEFAULT_MESSAGE_TEMPLATES,
    {
      name: 'Post-op check-in',
      body: `Hi {{firstName}}, just checking in after your visit — how are you feeling? A little soreness is normal for a day or two. If anything's worrying you, reply here or give us a call and we'll take care of it. — The team`,
    },
  ]
  const missing = want.filter((t) => !have.has(t.name))
  if (missing.length === 0) return
  let order = existing.length
  await db.insert(schema.emailSnippet).values(
    missing.map((t) => ({
      id: newId('snip'),
      organizationId: orgId,
      name: t.name,
      body: t.body,
      sortOrder: order++,
    })),
  )
}

/**
 * Seed a couple of patient documents so the detail "Documents" panel showcases
 * populated state. Uses the demo's own dental photos (real S3 images that
 * resolve) as before/after photos on the cosmetic-interest persona. Idempotent
 * (bails if any document exists); bails on a demo with no patients.
 */
export async function seedDemoPatientDocuments(orgId: string): Promise<void> {
  const patients = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  if (patients.length === 0) return
  const [existing] = await db
    .select({ id: schema.patientDocument.id })
    .from(schema.patientDocument)
    .where(eq(schema.patientDocument.organizationId, orgId))
    .limit(1)
  if (existing) return

  // Liam Brooks carries the "Cosmetic interest" tag — before/after photos fit.
  const target =
    patients.find((p) => p.firstName === 'Liam' && p.lastName === 'Brooks') ?? patients[0]
  const now = Date.now()
  const docs = [
    {
      label: 'Before photo — whitening consult',
      fileName: 'before-consult.jpg',
      fileUrl: DEMO_HERO_IMAGE_2_URL,
      sizeBytes: 184_320,
      createdAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
    },
    {
      label: 'After photo — 2-week follow-up',
      fileName: 'after-followup.jpg',
      fileUrl: DEMO_OFFICE_PHOTOS[0].url,
      sizeBytes: 211_904,
      createdAt: new Date(now - 12 * 24 * 60 * 60 * 1000),
    },
  ]
  await db.insert(schema.patientDocument).values(
    docs.map((d) => ({
      id: newId('pdoc'),
      organizationId: orgId,
      patientId: target.id,
      uploadedBy: null,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      contentType: 'image/jpeg',
      sizeBytes: d.sizeBytes,
      label: d.label,
      createdAt: d.createdAt,
    })),
  )
}

/**
 * Seed staff follow-ups across the personas so the Overview "Follow-ups due"
 * card, the /followups list, and the patient detail panel all showcase
 * populated state (overdue + today + upcoming + a done one). Name-keyed +
 * idempotent (bails if any follow-up exists / no patients). Left unassigned so
 * it never references a user that isn't a member of the demo org.
 */
export async function seedDemoFollowups(orgId: string): Promise<void> {
  const patients = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  if (patients.length === 0) return
  const [existing] = await db
    .select({ id: schema.patientFollowup.id })
    .from(schema.patientFollowup)
    .where(eq(schema.patientFollowup.organizationId, orgId))
    .limit(1)
  if (existing) return

  const byName = (first: string, last: string) =>
    patients.find((p) => p.firstName === first && p.lastName === last)?.id ?? null
  const now = new Date()
  const seed: Array<{
    first: string; last: string; title: string; dueOffsetDays: number | null; done?: boolean
  }> = [
    { first: 'Marcus', last: 'Johnson', title: 'Call about the crown estimate — he had questions', dueOffsetDays: -3 },
    { first: 'Aiden', last: 'Kim', title: 'Rebook Aiden after no-show', dueOffsetDays: 0 },
    { first: 'Charlotte', last: 'Diaz', title: 'Post-perio check-in (how are the gums feeling?)', dueOffsetDays: 5 },
    { first: 'Sophia', last: 'Iverson', title: 'Send whitening pricing she asked about', dueOffsetDays: 2 },
    { first: 'Mia', last: 'Hayes', title: 'Confirmed insurance — close out', dueOffsetDays: -6, done: true },
  ]
  const rows = seed
    .map((s) => {
      const patientId = byName(s.first, s.last)
      if (!patientId) return null
      const due =
        s.dueOffsetDays == null
          ? null
          : todayYmd(new Date(now.getTime() + s.dueOffsetDays * 24 * 60 * 60 * 1000))
      return {
        id: newId('pfu'),
        organizationId: orgId,
        patientId,
        title: s.title,
        dueDate: due,
        assignedUserId: null,
        status: s.done ? 'done' : 'open',
        createdBy: null,
        completedAt: s.done ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (rows.length > 0) await db.insert(schema.patientFollowup).values(rows)
}

/**
 * Seed a few saved patient-list views so the "Views" bar showcases populated
 * state. Idempotent (bails if any view exists / no patients); resolves the VIP
 * tag id (seeded by seedDemoPatientTags) so a tag-based view is real.
 */
export async function seedDemoPatientViews(orgId: string): Promise<void> {
  const patients = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
    .limit(1)
  if (patients.length === 0) return
  const [existing] = await db
    .select({ id: schema.patientView.id })
    .from(schema.patientView)
    .where(eq(schema.patientView.organizationId, orgId))
    .limit(1)
  if (existing) return

  const [vipTag] = await db
    .select({ id: schema.patientTag.id })
    .from(schema.patientTag)
    .where(and(eq(schema.patientTag.organizationId, orgId), eq(schema.patientTag.name, 'VIP')))
    .limit(1)

  const views: Array<{ name: string; filters: Record<string, unknown>; sortOrder: number }> = [
    { name: 'Recall due', filters: { status: 'recall_due' }, sortOrder: 0 },
    { name: 'Has a balance', filters: { hasBalance: true }, sortOrder: 1 },
    { name: 'Birthdays this month', filters: { birthdayThisMonth: true }, sortOrder: 2 },
  ]
  if (vipTag) views.push({ name: 'VIP patients', filters: { tagIds: [vipTag.id] }, sortOrder: 3 })

  await db.insert(schema.patientView).values(
    views.map((v) => ({
      id: newId('pview'),
      organizationId: orgId,
      name: v.name,
      filters: v.filters,
      createdBy: null,
      sortOrder: v.sortOrder,
    })),
  )
}

/**
 * A SECOND (non-default) intake form so the demo exercises the "pick which
 * form" dropdown on the patient detail "Send intake" control — which only
 * appears when a clinic has more than one form. Idempotent by slug.
 */
export async function seedSecondDemoIntakeForm(orgId: string) {
  // Idempotent on the (org, slug) unique index — no pre-select needed.
  await db
    .insert(schema.formTemplate)
    .values({
      id: newId('form'),
      organizationId: orgId,
      title: 'Returning Patient Update',
      description: "A short check-in for returning patients — what's changed since their last visit.",
      slug: 'returning-patient-update',
      autoSendAudience: 'returning',
      schema: {
        sections: [
          {
            id: 'updates',
            title: 'Since your last visit',
            fields: [
              { id: 'changes_health', type: 'yes_no', label: 'Any changes to your health or medications?', required: true },
              { id: 'changes_insurance', type: 'yes_no', label: 'Any changes to your dental insurance?', required: true },
              { id: 'concerns', type: 'textarea', label: "Anything you'd like us to know before your visit?", required: false },
            ],
          },
        ],
      },
      isDefault: 0,
    })
    .onConflictDoNothing({ target: [schema.formTemplate.organizationId, schema.formTemplate.slug] })
}

/**
 * Self-heal: bring a legacy demo's default intake form up to the latest
 * DEFAULT_INTAKE_TEMPLATE so it showcases the new field types (insurance-card
 * capture / photo upload / instructions block), and backfill the file/insurance
 * photos onto one submission so the upload render path is populated. Demo-
 * scoped, idempotent: the schema refresh only runs when an expected new field
 * is absent; the submission backfill only when no submission has file data yet.
 */
export async function upgradeDemoIntakeForm(orgId: string): Promise<void> {
  const [form] = await db
    .select({ id: schema.formTemplate.id, schema: schema.formTemplate.schema, translations: schema.formTemplate.translations })
    .from(schema.formTemplate)
    .where(and(eq(schema.formTemplate.organizationId, orgId), eq(schema.formTemplate.slug, 'new-patient-intake')))
    .limit(1)
  if (!form) return

  const hasNewTypes = JSON.stringify(form.schema ?? {}).includes('insurance_card')
  if (!hasNewTypes) {
    await db
      .update(schema.formTemplate)
      .set({ schema: DEFAULT_INTAKE_TEMPLATE, updatedAt: new Date() })
      .where(eq(schema.formTemplate.id, form.id))
  }

  // Seed the hand-written Spanish translation so the language toggle showcases.
  if (!(form.translations as { es?: unknown } | null)?.es) {
    await db
      .update(schema.formTemplate)
      .set({ translations: { es: DEMO_FORM_ES }, updatedAt: new Date() })
      .where(eq(schema.formTemplate.id, form.id))
  }

  // Backfill file/insurance photos onto the newest submission for this form
  // when none carry uploads yet.
  const subs = await db
    .select({ id: schema.formSubmission.id, data: schema.formSubmission.data })
    .from(schema.formSubmission)
    .where(eq(schema.formSubmission.formTemplateId, form.id))
    .orderBy(desc(schema.formSubmission.submittedAt))
    .limit(20)
  const anyHasFiles = subs.some((s) => JSON.stringify(s.data ?? {}).includes('"insurance_card"'))
  if (!anyHasFiles && subs[0]) {
    await db
      .update(schema.formSubmission)
      .set({
        data: { ...(subs[0].data as Record<string, unknown>), ...DEMO_INTAKE_FILE_DATA },
        aiSummary: DEMO_INTAKE_SUMMARY,
        aiSummaryAt: new Date(),
      })
      .where(eq(schema.formSubmission.id, subs[0].id))
  }
}

// ── Booking attribution backfill (demo) ─────────────────────────────────────
// Populates referrer/UTM on the demo's public-booking appointments so the SEO
// module's organic→booking funnel shows a realistic mix. Idempotent (only
// touches booking_widget rows that have no referrer yet). Runs on both the
// fresh-seed and self-heal paths.
export async function backfillDemoBookingAttribution(orgId: string) {
  const rows = await db
    .select({ id: schema.appointment.id })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, orgId),
        eq(schema.appointment.source, 'booking_widget'),
        isNull(schema.appointment.referrer),
      ),
    )
  const mix = [
    { sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic' },
    { sourcePage: '/book', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic' },
    { sourcePage: '/', referrer: 'https://www.instagram.com/', utmSource: 'instagram', utmMedium: 'social' },
    { sourcePage: '/book', referrer: null, utmSource: null, utmMedium: null },
  ]
  for (let i = 0; i < rows.length; i++) {
    await db.update(schema.appointment).set(mix[i % mix.length]).where(eq(schema.appointment.id, rows[i].id))
  }
}
