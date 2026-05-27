import 'server-only'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId, slugify } from '@/lib/utils'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { seedSystemTemplates, SYSTEM_TEMPLATES } from '@/lib/services/marketing-templates'
import { STARTER_BLOG_TOPICS } from '@/lib/services/blog'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import { seedDemoPms } from '@/lib/services/pms'

/**
 * Demo-clinic seeder. Creates a fully-populated clinic org so platform
 * admins can flip into the clinic dashboard via the demo-mode cookie
 * and see real-looking data — patients with insurance, an appointment
 * book, a few tasks.
 *
 * Idempotent by display name: if a clinic with the resolved slug
 * already exists we return that instead of creating a duplicate.
 *
 * Not seeded yet (will be filled in as the matching modules ship):
 * treatment plans, procedures, charts, claims, recall.
 */
export interface DemoClinicResult {
  organizationId: string
  organizationSlug: string
  organizationName: string
  created: boolean
  patientCount: number
  appointmentCount: number
}

const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Emma',
  'Noah',
  'Ava',
  'Ethan',
  'Sophia',
  'Mason',
  'Isabella',
  'James',
  'Mia',
  'Lucas',
  'Charlotte',
  'Aiden',
  'Amelia',
]
const LAST_NAMES = [
  'Anderson',
  'Brooks',
  'Carter',
  'Diaz',
  'Evans',
  'Fischer',
  'Garza',
  'Hayes',
  'Iverson',
  'Johnson',
  'Kim',
  'Lopez',
  'Mitchell',
  'Nguyen',
  'Owens',
]
const STREETS = ['Maple St', 'Oak Ave', 'Cedar Ln', 'Elm Rd', 'Pine Blvd']
const CITIES = [
  { city: 'Austin', state: 'TX', zip: '78701' },
  { city: 'Dallas', state: 'TX', zip: '75201' },
  { city: 'Houston', state: 'TX', zip: '77001' },
]
const INSURERS = ['Delta Dental', 'Cigna', 'Aetna', 'MetLife', 'Guardian', null]
const APPT_TYPES = [
  'checkup',
  'cleaning',
  'filling',
  'extraction',
  'root_canal',
  'consultation',
] as const

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function randomDob(): string {
  const year = 1950 + Math.floor(Math.random() * 60)
  const month = 1 + Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 27)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function phoneNumber(): string {
  return `(512) 555-${String(1000 + Math.floor(Math.random() * 9000))}`
}

interface PatientPersona {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  addressLine1: string
  city: string
  state: string
  postalCode: string
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  notes: string | null
  isActive: number
  source: string | null
  lifecycle: string
  firstSeenAt: Date
  lastActivityAt: Date | null
}

// Builds a curated set of 15 patients with deterministic glyph + lifecycle
// coverage for the demo. Each index has a meaning — see callers.
function buildPatientPersonas(now: Date): PatientPersona[] {
  const dayMs = 24 * 60 * 60 * 1000
  const austin = CITIES[0]
  function persona(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    extras: Partial<PatientPersona>,
  ): PatientPersona {
    return {
      firstName,
      lastName,
      dateOfBirth,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      addressLine1: `${100 + Math.floor(Math.random() * 900)} ${pick(STREETS)}`,
      city: austin.city,
      state: austin.state,
      postalCode: austin.zip,
      insuranceProvider: 'Delta Dental',
      insurancePolicyNumber: `POL-${Math.floor(Math.random() * 9_000_000) + 1_000_000}`,
      notes: null,
      isActive: 1,
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 365 * dayMs),
      lastActivityAt: new Date(now.getTime() - 30 * dayMs),
      ...extras,
    }
  }
  // Build a birthday string that falls within the next 6 days for the
  // birthday-this-week glyph. Year is held fixed at 1992 so the rest of
  // the date math doesn't drift.
  const bdayDate = new Date(now.getTime() + 3 * dayMs)
  const bday = `1992-${String(bdayDate.getMonth() + 1).padStart(2, '0')}-${String(bdayDate.getDate()).padStart(2, '0')}`

  return [
    // [0] Happy-path active patient
    persona('Mia', 'Hayes', '1988-03-12', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 800 * dayMs),
      lastActivityAt: new Date(now.getTime() - 7 * dayMs),
      notes: 'Prefers morning appointments.',
    }),
    // [1] New patient (★) + missing intake before future visit (📝!)
    persona('Liam', 'Brooks', '1995-08-22', {
      source: 'booking',
      lifecycle: 'new',
      firstSeenAt: new Date(now.getTime() - 9 * dayMs),
      lastActivityAt: new Date(now.getTime() - 9 * dayMs),
    }),
    // [2] Birthday this week (🎂)
    persona('Charlotte', 'Diaz', bday, {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 450 * dayMs),
    }),
    // [3] Outstanding overdue balance ($)
    persona('Marcus', 'Johnson', '1979-11-05', {
      source: 'manual',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 600 * dayMs),
      notes: 'Insurance pre-auth is a pain — call ahead next time.',
    }),
    // [4] Confirmed next-24h appointment (puts them on Today's chair)
    persona('Sophia', 'Iverson', '1991-02-14', {
      source: 'booking',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 200 * dayMs),
    }),
    // [5] Lapsed (💤) — 11 months since last visit, no future
    persona('Aiden', 'Kim', '1965-06-30', {
      source: 'referral',
      lifecycle: 'lapsed',
      firstSeenAt: new Date(now.getTime() - 1500 * dayMs),
      lastActivityAt: new Date(now.getTime() - 330 * dayMs),
    }),
    // [6] At-risk — 7 months since last visit
    persona('Emma', 'Lopez', '1983-12-01', {
      source: 'walk_in',
      lifecycle: 'at_risk',
      firstSeenAt: new Date(now.getTime() - 720 * dayMs),
      lastActivityAt: new Date(now.getTime() - 210 * dayMs),
    }),
    // [7] Has relationship notes + intake on file
    persona('Noah', 'Mitchell', '1972-04-18', {
      source: 'referral',
      lifecycle: 'active',
      firstSeenAt: new Date(now.getTime() - 900 * dayMs),
      lastActivityAt: new Date(now.getTime() - 14 * dayMs),
      notes: 'Anxious patient — see relationship notes.',
    }),
    // [8..13] Filler active patients
    persona('Olivia', 'Anderson', '1990-09-09', { source: 'booking' }),
    persona('Ethan', 'Carter', '1985-07-25', { source: 'referral' }),
    persona('Isabella', 'Evans', '1978-10-11', { source: 'manual' }),
    persona('Mason', 'Garza', '1996-01-30', { source: 'lead_form', lifecycle: 'lead' }),
    persona('Ava', 'Fischer', '1982-05-19', { source: 'booking' }),
    persona('James', 'Owens', '1969-08-08', { source: 'invite' }),
    // [14] Archived (filter-only)
    persona('Lucas', 'Nguyen', '1955-03-03', {
      isActive: 0,
      lifecycle: 'archived',
      lastActivityAt: new Date(now.getTime() - 700 * dayMs),
    }),
  ]
}

// Demo content — pulled out so the create path and the self-heal path
// for already-seeded demos share one source of truth.
const DEMO_STATS = [
  { id: 'st1', value: '8,000+', label: 'five-star reviews' },
  { id: 'st2', value: 'Same-week', label: 'appointments available' },
  { id: 'st3', value: 'Most', label: 'insurance accepted' },
]

const DEMO_TESTIMONIALS = [
  {
    id: 't1',
    quote:
      "I dreaded the dentist for years. Acme treated me like a person, not a tooth. I actually look forward to my cleanings now — I can't believe I'm saying that.",
    authorName: 'Sarah K.',
    authorLocation: 'Austin, TX',
    authorPhotoUrl: null,
  },
  {
    id: 't2',
    quote:
      "Booked online at 11pm on a Sunday, sat in the chair Tuesday morning. The team explained every step of my treatment plan before any work — no surprises, no upsells.",
    authorName: 'Marcus T.',
    authorLocation: 'Round Rock, TX',
    authorPhotoUrl: null,
  },
  {
    id: 't3',
    quote:
      "My kids actually ASK to go to Acme. The hygienist remembered that Lily likes the bubblegum fluoride. Small thing — huge difference for a six-year-old.",
    authorName: 'Jen R.',
    authorLocation: 'Cedar Park, TX',
    authorPhotoUrl: null,
  },
]

/**
 * Round a Date down to the nearest :00 or :30 minute boundary. Used when
 * seeding demo appointments so times look like a real clinic schedule
 * regardless of when the seeder runs.
 */
function snapToHalfHour(d: Date): Date {
  const r = new Date(d)
  r.setMinutes(r.getMinutes() < 30 ? 0 : 30, 0, 0)
  return r
}

// Logo + hero image for the demo clinic. Unsplash assets keep us
// dependency-free and consistent with how DEMO_OFFICE_PHOTOS works.
const DEMO_LOGO_URL =
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=200&h=200&fit=crop&q=80'
const DEMO_HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=2000&q=80'

const DEMO_OFFICE_PHOTOS = [
  {
    id: 'op1',
    url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80',
    alt: 'Modern dental treatment room with natural light',
    caption: null,
  },
  {
    id: 'op2',
    url: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&q=80',
    alt: 'Reception area with warm wood and plants',
    caption: null,
  },
  {
    id: 'op3',
    url: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80',
    alt: 'Hygienist working with a patient',
    caption: null,
  },
  {
    id: 'op4',
    url: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1200&q=80',
    alt: 'Comfortable waiting lounge',
    caption: null,
  },
]

export async function createDemoClinic(): Promise<DemoClinicResult> {
  const name = 'Acme Dental Demo'
  const slug = slugify(name)

  // Idempotent: bail early if the slug already exists.
  const [existing] = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  if (existing) {
    // Self-heal: flag legacy demos (seeded before the is_demo column
    // existed) so they're excluded from platform business metrics.
    await db
      .update(schema.organization)
      .set({ isDemo: true })
      .where(eq(schema.organization.id, existing.id))

    // Keep the demo on the current template defaults so it always
    // showcases the latest visual direction. Runs every time the
    // "Create demo clinic" button is hit on an already-seeded demo.
    //
    // - bump sky-blue brand to sage if still on the pre-warm-neutral default
    // - backfill stats / testimonials / officePhotos when columns are null
    //   (e.g. demo seeded before those fields existed)
    const [profile] = await db
      .select({
        brandColor: schema.clinicProfile.brandColor,
        stats: schema.clinicProfile.stats,
        testimonials: schema.clinicProfile.testimonials,
        officePhotos: schema.clinicProfile.officePhotos,
        logoUrl: schema.clinicProfile.logoUrl,
        heroImageUrl: schema.clinicProfile.heroImageUrl,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, existing.id))
      .limit(1)

    const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
    if (profile?.brandColor === '#0ea5e9') patch.brandColor = '#9CAF9F'
    if (!profile?.stats) patch.stats = DEMO_STATS
    if (!profile?.testimonials) patch.testimonials = DEMO_TESTIMONIALS
    if (!profile?.officePhotos) patch.officePhotos = DEMO_OFFICE_PHOTOS
    if (!profile?.logoUrl) patch.logoUrl = DEMO_LOGO_URL
    if (!profile?.heroImageUrl) patch.heroImageUrl = DEMO_HERO_IMAGE_URL
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.clinicProfile)
        .set(patch)
        .where(eq(schema.clinicProfile.organizationId, existing.id))
    }
    // Seed the default intake form if the demo predates the forms feature.
    await seedDefaultIntakeForm(existing.id)

    // Self-heal patient_note + form_submission rows when missing. We can't
    // re-pick the original persona indices (those IDs are gone), so we
    // just attach a few generic samples to the first patients we find.
    // A full reset still requires the "Create demo clinic" flow on a wiped
    // demo — but this at least makes the Notes + Forms tabs non-empty.
    const existingPatientsForHeal = await db
      .select({ id: schema.patient.id, email: schema.patient.email, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, existing.id))
      .limit(8)
    if (existingPatientsForHeal.length > 0) {
      const [noteFound] = await db
        .select({ id: schema.patientNote.id })
        .from(schema.patientNote)
        .where(eq(schema.patientNote.organizationId, existing.id))
        .limit(1)
      if (!noteFound) {
        const noteBodies = [
          'Prefers Dr. Patel for cleanings. Loves the warm towels.',
          'Tried to reach in 2024-09 — left voicemail. Try again next quarter.',
          'Highly anxious. Always pre-medicate with halcion + use nitrous.',
        ]
        for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
          await db.insert(schema.patientNote).values({
            id: newId('pnote'),
            organizationId: existing.id,
            patientId: existingPatientsForHeal[i].id,
            authorId: null,
            body: noteBodies[i],
          })
        }
      }

      const [subFound] = await db
        .select({ id: schema.formSubmission.id })
        .from(schema.formSubmission)
        .where(eq(schema.formSubmission.organizationId, existing.id))
        .limit(1)
      if (!subFound) {
        const [defaultForm] = await db
          .select({ id: schema.formTemplate.id })
          .from(schema.formTemplate)
          .where(eq(schema.formTemplate.organizationId, existing.id))
          .limit(1)
        if (defaultForm) {
          for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
            const p = existingPatientsForHeal[i]
            await db.insert(schema.formSubmission).values({
              id: newId('sub'),
              organizationId: existing.id,
              formTemplateId: defaultForm.id,
              patientId: p.id,
              appointmentId: null,
              data: { intake: 'sample' },
              submitterName: `${p.firstName} ${p.lastName}`,
              submitterEmail: p.email,
              submitterPhone: null,
              submittedAt: new Date(Date.now() - (60 + i * 30) * 24 * 60 * 60 * 1000),
            })
          }
        }
      }
    }

    // Appointments module v1 self-heal: clinic_provider + reminder log +
    // appointment.source + appointment.providerId backfill. Existing
    // demos predate these columns.
    const [providerFound] = await db
      .select({ id: schema.clinicProvider.id })
      .from(schema.clinicProvider)
      .where(eq(schema.clinicProvider.organizationId, existing.id))
      .limit(1)
    const dentistId = providerFound?.id ?? newId('prov')
    const hygienistId = newId('prov')
    if (!providerFound) {
      await db.insert(schema.clinicProvider).values([
        { id: dentistId, organizationId: existing.id, displayName: 'Dr. Jordan Reyes', role: 'dentist', email: 'jordan@acme-dental.example' },
        { id: hygienistId, organizationId: existing.id, displayName: 'Maria Vega, RDH', role: 'hygienist', email: 'maria@acme-dental.example' },
      ])

      // Backfill providerId on existing appointments: cleanings go to the
      // hygienist, everything else to the dentist. Only touches rows that
      // currently have no provider attached so this is idempotent if the
      // self-heal re-runs.
      await db
        .update(schema.appointment)
        .set({ providerId: hygienistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            eq(schema.appointment.type, 'cleaning'),
            isNull(schema.appointment.providerId),
          ),
        )
      await db
        .update(schema.appointment)
        .set({ providerId: dentistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            isNull(schema.appointment.providerId),
          ),
        )
    }

    // Backfill appointment.source = 'manual' on rows that lack one. Cheap
    // and idempotent (rows that already have a source are untouched).
    await db
      .update(schema.appointment)
      .set({ source: 'manual' })
      .where(
        and(
          eq(schema.appointment.organizationId, existing.id),
          isNull(schema.appointment.source),
        ),
      )

    // SEO module: give the demo's public-booking visits a realistic
    // traffic-source mix so the organic→booking funnel is populated.
    await backfillDemoBookingAttribution(existing.id)

    // Seed one reminder log row against an existing future appointment so
    // the drawer's reminder-activity stripe isn't empty.
    const [reminderFound] = await db
      .select({ id: schema.appointmentReminderLog.id })
      .from(schema.appointmentReminderLog)
      .where(eq(schema.appointmentReminderLog.organizationId, existing.id))
      .limit(1)
    if (!reminderFound) {
      const [futureAppt] = await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            gte(schema.appointment.startTime, new Date()),
          ),
        )
        .limit(1)
      if (futureAppt) {
        await db.insert(schema.appointmentReminderLog).values({
          id: newId('rem'),
          organizationId: existing.id,
          appointmentId: futureAppt.id,
          channel: 'email',
          template: 'default_reminder',
        })
      }
    }

    // Leads module self-heal: top up to the full 6 curated leads so the
    // demo always showcases every glyph state on /leads — fresh / aging
    // / stale / contacted / converted / archived. Additive + idempotent:
    // checks existing lead names + only inserts the ones that are
    // missing. Legacy demos previously seeded with the sparse 3-lead set
    // get topped up to 6 on the next "View as clinic" entry.
    const existingLeads = await db
      .select({ name: schema.lead.name })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, existing.id))
    const existingLeadNames = new Set(existingLeads.map((r) => r.name))
    // Look up Emma Lopez patient by name so the converted-lead seed can
    // point at her. `null` if she doesn't exist on this demo (older
    // demo predates persona 6) — convert link just stays unset then.
    const [emmaPatient] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, existing.id),
          eq(schema.patient.firstName, 'Emma'),
          eq(schema.patient.lastName, 'Lopez'),
        ),
      )
      .limit(1)
    await seedLeadsForOrg(existing.id, new Date(), emmaPatient?.id ?? null, existingLeadNames)

    // Recall & Outreach self-heal: top up to the full audience + campaign
    // + events set. Additive + idempotent. Each pre-fetch is one query.
    const existingAudienceRows = await db
      .select({ id: schema.audiences.id, name: schema.audiences.name })
      .from(schema.audiences)
      .where(eq(schema.audiences.organizationId, existing.id))
    const existingAudiencesByName = new Map(existingAudienceRows.map((r) => [r.name, r.id]))
    const existingCampaignRows = await db
      .select({ id: schema.campaigns.id, name: schema.campaigns.name })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.organizationId, existing.id))
    const existingCampaignsByName = new Map(existingCampaignRows.map((r) => [r.name, r.id]))
    const existingPatientRows = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, existing.id))
    const existingPatientIds = existingPatientRows.map((r) => r.id)
    await seedRecallOutreachForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingAudiencesByName,
      existingCampaignsByName,
    )

    // Patient Communications self-heal: top up to the seeded thread set.
    // Additive + idempotent — checks existing thread patient ids before
    // inserting.
    const existingThreadRows = await db
      .select({ patientId: schema.patientThread.patientId })
      .from(schema.patientThread)
      .where(eq(schema.patientThread.organizationId, existing.id))
    const existingThreadPatientIds = new Set(existingThreadRows.map((r) => r.patientId))
    await seedPatientMessagesForOrg(existing.id, new Date(), existingPatientIds, existingThreadPatientIds)

    // Reviews self-heal: top up config + review requests for legacy demos.
    const existingReviewConfigRows = await db
      .select({ id: schema.clinicReviewConfig.organizationId })
      .from(schema.clinicReviewConfig)
      .where(eq(schema.clinicReviewConfig.organizationId, existing.id))
    const existingReviewRequestRows = await db
      .select({ patientId: schema.reviewRequest.patientId })
      .from(schema.reviewRequest)
      .where(eq(schema.reviewRequest.organizationId, existing.id))
    const existingReviewPatients = new Set(existingReviewRequestRows.map((r) => r.patientId))
    await seedReviewsForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingReviewConfigRows.length > 0,
      existingReviewPatients,
    )

    // Blog self-heal: top up the curated post set. Additive + idempotent —
    // checks existing slugs so legacy demos pick up the blog on next entry.
    const existingBlogRows = await db
      .select({ slug: schema.blogPost.slug })
      .from(schema.blogPost)
      .where(eq(schema.blogPost.organizationId, existing.id))
    await seedBlogPostsForOrg(existing.id, new Date(), new Set(existingBlogRows.map((r) => r.slug)))

    const patientCount = (
      await db.select({ id: schema.patient.id }).from(schema.patient).where(eq(schema.patient.organizationId, existing.id))
    ).length
    const appointmentCount = (
      await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(eq(schema.appointment.organizationId, existing.id))
    ).length

    // Careers self-heal: seed once if the legacy demo has no job postings.
    // Placed after the count selects so it doesn't shift the seeder test's
    // queue positions. locationId=null is fine — the public JobPosting
    // location is derived from the clinic's primary location at render time.
    const [existingJob] = await db
      .select({ id: schema.jobPosting.id })
      .from(schema.jobPosting)
      .where(eq(schema.jobPosting.organizationId, existing.id))
      .limit(1)
    if (!existingJob) await seedDemoCareers(existing.id, null, new Date())

    // Shop self-heal: seed the catalog once if the legacy demo has none.
    const [existingProduct] = await db
      .select({ id: schema.shopProduct.id })
      .from(schema.shopProduct)
      .where(eq(schema.shopProduct.organizationId, existing.id))
      .limit(1)
    if (!existingProduct) await seedDemoShop(existing.id, new Date())

    // Membership self-heal: seed plans (+ members for existing patients) once.
    const [existingPlan] = await db
      .select({ id: schema.membershipPlan.id })
      .from(schema.membershipPlan)
      .where(eq(schema.membershipPlan.organizationId, existing.id))
      .limit(1)
    if (!existingPlan) {
      const memberPatients = await db
        .select({ id: schema.patient.id })
        .from(schema.patient)
        .where(eq(schema.patient.organizationId, existing.id))
        .limit(3)
      await seedDemoMemberships(existing.id, new Date(), memberPatients.map((p) => p.id))
    }

    // PMS Integrations self-heal: seed the sandbox connection + entity maps +
    // sync/write-back history once (idempotent — no-op if already connected).
    await seedDemoPms(existing.id)

    return {
      organizationId: existing.id,
      organizationSlug: existing.slug,
      organizationName: existing.name,
      created: false,
      patientCount,
      appointmentCount,
    }
  }

  const orgId = newId('org')
  const now = new Date()

  await db.insert(schema.organization).values({
    id: orgId,
    name,
    slug,
    type: 'clinic',
    isDemo: true,
    createdAt: now,
  })

  await db.insert(schema.clinicProfile).values({
    organizationId: orgId,
    legalName: 'Acme Dental, PLLC',
    displayName: 'Acme Dental',
    tagline: 'Bright smiles, gentle care',
    about:
      'Acme Dental is a demonstration clinic seeded by the DreamCRM platform admin to preview the clinic dashboard. All patient data shown is fictional.',
    brandColor: '#9CAF9F',
    template: 'modern',
    phone: '(512) 555-0100',
    email: 'hello@acme-dental.example',
    logoUrl: DEMO_LOGO_URL,
    heroImageUrl: DEMO_HERO_IMAGE_URL,
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    hours: {
      mon: { open: '08:00', close: '17:00' },
      tue: { open: '08:00', close: '17:00' },
      wed: { open: '08:00', close: '17:00' },
      thu: { open: '08:00', close: '17:00' },
      fri: { open: '08:00', close: '15:00' },
      sat: { open: null, close: null },
      sun: { open: null, close: null },
    },
    services: [
      { id: 's1', name: 'Routine Cleanings', description: 'Twice-yearly hygiene visits' },
      { id: 's2', name: 'Cosmetic Whitening', description: 'In-office and take-home options' },
      { id: 's3', name: 'Invisalign', description: 'Clear aligners with monthly check-ins' },
      { id: 's4', name: 'Implants', description: 'Single-tooth and full-arch restorations' },
    ],
    staff: [
      { id: 'p1', name: 'Dr. Jordan Reyes', title: 'Lead Dentist', bio: '15 years of general dentistry' },
      { id: 'p2', name: 'Dr. Sam Patel', title: 'Cosmetic Specialist' },
      { id: 'p3', name: 'Maria Vega, RDH', title: 'Lead Hygienist' },
    ],
    stats: DEMO_STATS,
    testimonials: DEMO_TESTIMONIALS,
    officePhotos: DEMO_OFFICE_PHOTOS,
    planTier: 'premium',
    subscriptionStatus: 'active',
  })

  // Primary location
  const locationId = newId('loc')
  await db.insert(schema.clinicLocation).values({
    id: locationId,
    organizationId: orgId,
    name: 'Acme Dental — Downtown',
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    phone: '(512) 555-0100',
    isPrimary: 1,
  })

  // Seed 15 patients with curated personas so every Patients-module
  // glyph + lifecycle stage shows up somewhere in the demo. Each persona
  // index below is referenced later for invoices, form submissions, notes.
  //
  // - [0] Mia Hayes — happy-path active patient with intake on file
  // - [1] Liam Brooks — new (★), booking source, future visit + no intake (📝!)
  // - [2] Charlotte Diaz — birthday this week (🎂)
  // - [3] Marcus Johnson — outstanding overdue invoice ($)
  // - [4] Sophia Iverson — confirmed appt in next 24h (warms the chair view)
  // - [5] Aiden Kim — lapsed, 11 months since last visit (💤 + lifecycle=lapsed)
  // - [6] Emma Lopez — at_risk, 7 months since last visit
  // - [7] Noah Mitchell — relationship notes + intake on file
  // - [8..13] Filler active patients (randomized within persona shape)
  // - [14] Olivia Nguyen — archived (isActive=0)
  const personas = buildPatientPersonas(now)
  const patientIds: string[] = []
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i]
    const pid = newId('pat')
    patientIds.push(pid)
    // Marketing opt-in distribution: most personas are opted-in (the
    // realistic case — patients gave us their email knowing we're a clinic
    // and the unsub link sits in every footer). Persona 9 (one filler)
    // demos the explicitly-opted-out state for the 🔕 glyph; persona 14
    // (archived Olivia) is also opted-out as a natural side-effect.
    const marketingEmailOptIn = i === 9 || i === 14 ? 0 : 1
    const marketingEmailOptInAt = marketingEmailOptIn === 1 ? p.firstSeenAt : null
    const marketingEmailOptOutAt = marketingEmailOptIn === 0 ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : null
    // SMS opt-in is rarer (TCPA requires explicit opt-in). Two personas
    // opted in via the intake form so the Phase B SMS audience has rows.
    const marketingSmsOptIn = i === 0 || i === 4 ? 1 : 0
    const marketingSmsOptInAt = marketingSmsOptIn === 1 ? p.firstSeenAt : null
    await db.insert(schema.patient).values({
      id: pid,
      organizationId: orgId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      email: p.email,
      phone: p.phone,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      postalCode: p.postalCode,
      insuranceProvider: p.insuranceProvider,
      insurancePolicyNumber: p.insurancePolicyNumber,
      notes: p.notes,
      isActive: p.isActive,
      source: p.source,
      lifecycle: p.lifecycle,
      firstSeenAt: p.firstSeenAt,
      lastActivityAt: p.lastActivityAt,
      marketingEmailOptIn,
      marketingEmailOptInAt,
      marketingEmailOptOutAt,
      marketingSmsOptIn,
      marketingSmsOptInAt,
      marketingOptInSource: marketingEmailOptIn === 1 ? 'backfill' : 'manual',
    })
  }

  // Staff members for the Appointments module — CRM-side display labels.
  // NOT clinical providers (per DESIGN.md out-of-scope). Each appointment
  // below attaches to one so the "with [Staff]" line and provider filter
  // chip have something to filter against.
  const providerDentistId = newId('prov')
  const providerHygienistId = newId('prov')
  await db.insert(schema.clinicProvider).values([
    {
      id: providerDentistId,
      organizationId: orgId,
      displayName: 'Dr. Jordan Reyes',
      role: 'dentist',
      email: 'jordan@acme-dental.example',
    },
    {
      id: providerHygienistId,
      organizationId: orgId,
      displayName: 'Maria Vega, RDH',
      role: 'hygienist',
      email: 'maria@acme-dental.example',
    },
  ])

  // Curated appointments so personas trigger the right glyphs.
  // Past: most personas (except [1] new + [5] lapsed) have completed visits.
  // Future: persona [1] has a new-patient cleaning in 5 days (no intake →
  // 📝!), persona [4] has a confirmed appt in 22h, persona [3] has an
  // unconfirmed appt in 30h (⚠️ + $ overlap), persona [0] [2] [7] all
  // have scheduled future visits, persona [5] (lapsed Aiden) just rebooked
  // → triggers 💤 lapsed-returning glyph, persona [6] (Emma) has an
  // appointment created 20 minutes ago → triggers 🆕 booked-just-now,
  // persona [0] (Mia) has a rescheduled appointment → triggers 📅.
  let apptCount = 0
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000

  // Phantom cancelled "from" row for Mia's reschedule — establishes the
  // audit trail (rescheduledFromAppointmentId points back at this id).
  const miaOriginalId = newId('appt')

  const apptsToSeed: Array<{
    id: string
    patientIdx: number
    startOffsetMs: number
    type: typeof APPT_TYPES[number]
    status: 'scheduled' | 'confirmed' | 'completed' | 'no_show' | 'cancelled'
    notes: string | null
    providerId: string
    source: 'booking_widget' | 'manual' | 'recall_campaign' | 'phone' | 'invite'
    confirmedAt?: Date
    confirmedVia?: 'sms' | 'email' | 'manual' | 'auto_sms_keyword'
    rescheduledFromAppointmentId?: string
    cancelledAt?: Date
    createdAtOverride?: Date
  }> = [
    // ── Past visits ──
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -60 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -240 * dayMs, type: 'checkup', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: -90 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: -45 * dayMs, type: 'filling', status: 'completed', notes: 'MOD on #14, 2 carpules lido', providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 5, startOffsetMs: -330 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 6, startOffsetMs: -210 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: -150 * dayMs, type: 'consultation', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 8, startOffsetMs: -30 * dayMs, type: 'cleaning', status: 'no_show', notes: null, providerId: providerHygienistId, source: 'manual' },
    // Phantom cancelled "from" row — original time Mia was booked before reschedule.
    { id: miaOriginalId, patientIdx: 0, startOffsetMs: 7 * dayMs + 10 * hourMs, type: 'cleaning', status: 'cancelled', notes: 'Originally booked here — patient asked to move.', providerId: providerHygienistId, source: 'booking_widget', cancelledAt: new Date(now.getTime() - 2 * dayMs) },
    // ── Future visits ──
    { id: newId('appt'), patientIdx: 1, startOffsetMs: 5 * dayMs + 9 * hourMs, type: 'cleaning', status: 'confirmed', notes: 'New patient cleaning', providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 1 * dayMs), confirmedVia: 'email' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: 14 * dayMs + 10 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Rescheduled from earlier slot', providerId: providerHygienistId, source: 'manual', rescheduledFromAppointmentId: miaOriginalId },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: 21 * dayMs + 11 * hourMs, type: 'checkup', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 4, startOffsetMs: 22 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 4 * hourMs), confirmedVia: 'sms' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: 30 * hourMs, type: 'filling', status: 'scheduled', notes: 'Patient called to ask about pre-auth status', providerId: providerDentistId, source: 'phone' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: 9 * dayMs + 14 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'manual', confirmedAt: new Date(now.getTime() - 12 * hourMs), confirmedVia: 'manual' },
    // 💤 lapsed-returning — Aiden (persona 5) just rebooked after 11 months
    { id: newId('appt'), patientIdx: 5, startOffsetMs: 3 * dayMs + 13 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Welcome back! First visit in almost a year.', providerId: providerHygienistId, source: 'recall_campaign' },
    // 🆕 booked-just-now — Emma (persona 6) booked 20 min ago
    { id: newId('appt'), patientIdx: 6, startOffsetMs: 11 * dayMs + 15 * hourMs, type: 'consultation', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'booking_widget', createdAtOverride: new Date(now.getTime() - 20 * 60 * 1000) },
  ]
  for (const a of apptsToSeed) {
    // Snap seeded start time to the nearest 30-min boundary so demo
    // appointments read like a real clinic schedule (9:00, 9:30, 10:00…)
    // rather than inheriting whatever minute/second `now` happens to be
    // when the seeder runs (which leaves every demo appointment ending in
    // `:20` or `:43`).
    const start = snapToHalfHour(new Date(now.getTime() + a.startOffsetMs))
    const end = new Date(start.getTime() + 45 * 60 * 1000)
    await db.insert(schema.appointment).values({
      id: a.id,
      organizationId: orgId,
      patientId: patientIds[a.patientIdx],
      locationId,
      providerId: a.providerId,
      title: `${a.type.replace('_', ' ')} — ${personas[a.patientIdx].firstName} ${personas[a.patientIdx].lastName}`,
      startTime: start,
      endTime: end,
      type: a.type,
      status: a.status,
      notes: a.notes,
      source: a.source,
      confirmedAt: a.confirmedAt ?? null,
      confirmedVia: a.confirmedVia ?? null,
      cancelledAt: a.cancelledAt ?? null,
      rescheduledFromAppointmentId: a.rescheduledFromAppointmentId ?? null,
      ...(a.createdAtOverride ? { createdAt: a.createdAtOverride } : {}),
    })
    apptCount++
  }

  // Reminder log — gives the drawer's "Reminder activity" stripe real
  // rows + triggers the ⏱ "reminder sent recently" glyph on a couple of
  // futures. Patterns:
  //  - Sophia [4] (confirmed in 22h): email sent 6h ago, patient replied
  //  - Mia [0]   (scheduled 14d out): email sent 5 days ago (no ⏱)
  //  - Liam [1]  (confirmed 5d out): email sent 6h ago (⏱), no reply yet
  //  - Marcus [3] (scheduled 30h out): email sent 90 min ago (⏱), no reply
  const apptByIdx = (idx: number, when: 'future' | 'past' = 'future') => {
    const matches = apptsToSeed.filter((a) => a.patientIdx === idx && (when === 'future' ? a.startOffsetMs > 0 : a.startOffsetMs <= 0))
    return matches[0]?.id
  }
  const reminderSeeds: Array<{
    apptId: string | undefined
    minutesAgo: number
    channel: 'sms' | 'email'
    repliedMinutesAgo?: number
    replyBody?: string
  }> = [
    { apptId: apptByIdx(4), minutesAgo: 6 * 60, channel: 'email', repliedMinutesAgo: 5 * 60 + 50, replyBody: 'Confirmed, see you then.' },
    { apptId: apptByIdx(0), minutesAgo: 5 * 24 * 60, channel: 'email' },
    { apptId: apptByIdx(1), minutesAgo: 6 * 60, channel: 'email' },
    { apptId: apptByIdx(3), minutesAgo: 90, channel: 'email' },
  ]
  for (const r of reminderSeeds) {
    if (!r.apptId) continue
    await db.insert(schema.appointmentReminderLog).values({
      id: newId('rem'),
      organizationId: orgId,
      appointmentId: r.apptId,
      channel: r.channel,
      template: 'default_reminder',
      sentAt: new Date(now.getTime() - r.minutesAgo * 60 * 1000),
      repliedAt: r.repliedMinutesAgo ? new Date(now.getTime() - r.repliedMinutesAgo * 60 * 1000) : null,
      replyBody: r.replyBody ?? null,
    })
  }

  // A couple of tasks to populate the Tasks board
  await db.insert(schema.tasks).values([
    {
      organizationId: orgId,
      title: 'Order Invisalign supplies',
      description: 'Box of aligner trays running low',
      status: 'todo',
      priority: 'medium',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Call insurance re: claim #4421',
      description: 'Patient escalation, pending 14 days',
      status: 'in_progress',
      priority: 'high',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Quarterly equipment maintenance',
      status: 'todo',
      priority: 'low',
      position: 1,
    },
  ])

  // Customer rows — half derived from patients (so invoices link via
  // customers.patientId and surface on patient timelines), half generic
  // "leads" (so the platform-side /ecommerce/customers + marketing
  // pipeline modules also have something to show).
  //
  // Personas with a customers row: [0] Mia (LTV history), [3] Marcus
  // (overdue $), [4] Sophia (paid history), [7] Noah (paid history).
  const patientLinkedCustomers = [0, 3, 4, 7].map((idx) => ({
    organizationId: orgId,
    patientId: patientIds[idx],
    name: `${personas[idx].firstName} ${personas[idx].lastName}`,
    email: personas[idx].email!,
    phone: personas[idx].phone,
    location: `${personas[idx].city}, ${personas[idx].state}`,
    pipelineStage: 'won',
    lifecycleStage: 'customer',
    lastActivityAt: new Date(now.getTime() - dayMs),
  }))
  const STAGES = ['new', 'contacted', 'qualified', 'opportunity', 'won']
  const leadCustomers = Array.from({ length: 6 }, (_, i) => {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const loc = pick(CITIES)
    return {
      organizationId: orgId,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      location: `${loc.city}, ${loc.state}`,
      pipelineStage: STAGES[i % STAGES.length],
      lifecycleStage: i < 3 ? 'lead' : 'customer',
      lastActivityAt: new Date(now.getTime() - i * dayMs),
    }
  })
  const insertedCustomers = await db
    .insert(schema.customers)
    .values([...patientLinkedCustomers, ...leadCustomers])
    .returning({ id: schema.customers.id })

  // Sample products (treatments offered as "products" in the catalog).
  const productRows = [
    { name: 'Routine Cleaning', priceCents: 15000, stock: 999 },
    { name: 'Comprehensive Exam', priceCents: 9500, stock: 999 },
    { name: 'Composite Filling', priceCents: 22500, stock: 999 },
    { name: 'Teeth Whitening', priceCents: 45000, stock: 50 },
  ].map((p) => ({
    organizationId: orgId,
    name: p.name,
    slug: slugify(p.name) + '-' + newId().slice(0, 4),
    priceCents: p.priceCents,
    currency: 'USD',
    stock: p.stock,
    active: true,
  }))
  await db.insert(schema.products).values(productRows)

  // A handful of product orders + invoices, evenly distributed across statuses.
  const orderStatuses = ['pending', 'processing', 'delivered', 'delivered', 'shipped'] as const
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.orders).values({
      organizationId: orgId,
      orderNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[i % insertedCustomers.length]?.id ?? null,
      status: orderStatuses[i % orderStatuses.length],
      totalCents: 9500 + i * 5000,
      currency: 'USD',
      items: [
        { name: 'Treatment plan phase ' + (i + 1), quantity: 1, priceCents: 9500 + i * 5000 },
      ],
    })
  }

  // Invoices — curated so each patient-linked customer has a realistic
  // history. Patient-linked customer IDs are the first N of insertedCustomers
  // (in the same order as patientLinkedCustomers above).
  // [0] Mia: 2 paid invoices (LTV history)
  // [1] Marcus: 1 paid + 1 overdue (drives the $ glyph + balance pill)
  // [2] Sophia: 1 paid
  // [3] Noah: 1 paid
  const invoiceSeeds: Array<{
    customerIdx: number
    status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled'
    totalCents: number
    daysAgo: number
  }> = [
    { customerIdx: 0, status: 'paid', totalCents: 22500, daysAgo: 90 },
    { customerIdx: 0, status: 'paid', totalCents: 18000, daysAgo: 30 },
    { customerIdx: 1, status: 'paid', totalCents: 15000, daysAgo: 120 },
    { customerIdx: 1, status: 'overdue', totalCents: 45000, daysAgo: 21 },
    { customerIdx: 2, status: 'paid', totalCents: 9500, daysAgo: 60 },
    { customerIdx: 3, status: 'paid', totalCents: 30000, daysAgo: 150 },
  ]
  for (const inv of invoiceSeeds) {
    const created = new Date(now.getTime() - inv.daysAgo * dayMs)
    await db.insert(schema.invoices).values({
      organizationId: orgId,
      invoiceNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[inv.customerIdx]?.id ?? null,
      status: inv.status,
      totalCents: inv.totalCents,
      currency: 'USD',
      createdAt: created,
      paidAt: inv.status === 'paid' ? new Date(created.getTime() + 2 * dayMs) : null,
    })
  }

  // Default intake form template — the standard dental new-patient form.
  await seedDefaultIntakeForm(orgId)

  // Form submissions — one per persona that already filled out the intake.
  // Persona [1] (new patient, future visit) is intentionally *missing* a
  // submission so the 📝! "missing intake before next visit" glyph triggers.
  const [defaultForm] = await db
    .select({ id: schema.formTemplate.id })
    .from(schema.formTemplate)
    .where(eq(schema.formTemplate.organizationId, orgId))
    .limit(1)
  if (defaultForm) {
    const submissionSeeds: Array<{ patientIdx: number; daysAgo: number }> = [
      { patientIdx: 0, daysAgo: 240 },
      { patientIdx: 2, daysAgo: 95 },
      { patientIdx: 3, daysAgo: 50 },
      { patientIdx: 6, daysAgo: 220 },
      { patientIdx: 7, daysAgo: 160 },
    ]
    for (const s of submissionSeeds) {
      const p = personas[s.patientIdx]
      await db.insert(schema.formSubmission).values({
        id: newId('sub'),
        organizationId: orgId,
        formTemplateId: defaultForm.id,
        patientId: patientIds[s.patientIdx],
        appointmentId: null,
        data: {
          first_name: p.firstName,
          last_name: p.lastName,
          email: p.email,
          phone: p.phone,
          dob: p.dateOfBirth,
          insurance: p.insuranceProvider ?? 'None',
          anxious: s.patientIdx === 7 ? 'Yes — I prefer nitrous oxide' : 'A little — please go slow',
        },
        submitterName: `${p.firstName} ${p.lastName}`,
        submitterEmail: p.email,
        submitterPhone: p.phone,
        submittedAt: new Date(now.getTime() - s.daysAgo * dayMs),
      })
    }
  }

  // Patient notes — relationship notes (NOT clinical) on a few personas
  // so the Notes panel on the detail page renders real content.
  const noteSeeds: Array<{ patientIdx: number; body: string; daysAgo: number }> = [
    { patientIdx: 0, body: 'Prefers Dr. Patel for cleanings. Loves the warm towels.', daysAgo: 90 },
    { patientIdx: 5, body: 'Tried to reach 2024-09 — left voicemail, no callback. Try again next quarter.', daysAgo: 240 },
    { patientIdx: 5, body: 'Confirmed wants to come back, life got busy. Sending recall email week of demo.', daysAgo: 12 },
    { patientIdx: 7, body: 'Highly anxious. Always pre-medicate with halcion + use nitrous. Spouse usually drives.', daysAgo: 150 },
    { patientIdx: 3, body: 'Balance dispute: insurance kicked back the May filling — call to walk through EOB.', daysAgo: 18 },
  ]
  for (const n of noteSeeds) {
    await db.insert(schema.patientNote).values({
      id: newId('pnote'),
      organizationId: orgId,
      patientId: patientIds[n.patientIdx],
      authorId: null, // demo notes have no author — UI shows "Staff"
      body: n.body,
      createdAt: new Date(now.getTime() - n.daysAgo * dayMs),
    })
  }

  // ── Website leads — public contact-form submissions ─────────────────
  // Lookup Emma Lopez's patient id so the converted-lead seed can point
  // back at the persona. Falls back to `null` if she's not in patientIds
  // (shouldn't happen — Emma is persona 6 — but defensive).
  const emmaPatientId = patientIds[6] ?? null
  await seedLeadsForOrg(orgId, now, emmaPatientId, new Set())

  // SEO: realistic traffic-source mix on the public-booking appointments.
  await backfillDemoBookingAttribution(orgId)

  // Careers: open roles + applicants across the pipeline (pure inserts).
  await seedDemoCareers(orgId, locationId, now)

  // Shop: catalog of dental products + sample orders (pure inserts).
  await seedDemoShop(orgId, now, patientIds)

  // Membership plans + members.
  await seedDemoMemberships(orgId, now, patientIds)

  // ── Recall & Outreach — audiences + campaigns + events ──────────────
  // Seeded after patients/appointments so the audience filters resolve to
  // realistic counts AND so the "Sent" campaign can attribute Aiden's
  // recall_campaign booking back to itself via a 'booked' event.
  await seedRecallOutreachForOrg(orgId, now, patientIds, new Map(), new Map())

  // ── Patient Communications — threads + messages ─────────────────────
  // Seeded after patients so threads can be tied to the right persona.
  // Mix of in-app + email messages, mix of inbound/outbound, one snoozed
  // thread, one with high unread count for the red-rot border state.
  await seedPatientMessagesForOrg(orgId, now, patientIds, new Set())

  // ── Reviews & Reputation — config + review requests ─────────────────
  // Seeded after patients + appointments so requests can be tied to
  // real completed visits. Mix of funnel states so the dashboard shows
  // every status pill + the per-platform breakdown.
  await seedReviewsForOrg(orgId, now, patientIds, false, new Set())

  // ── Blog — curated posts covering every state ───────────────────────
  // 2 published (bylined to demo staff), 1 plain draft, 1 AI draft pending
  // review — so /blog + the public blog index both show real content.
  await seedBlogPostsForOrg(orgId, now, new Set())

  // ── PMS Integrations — sandbox Open Dental connection ───────────────
  // Seeded last so every provider/patient/appointment exists to map. Builds
  // the connection + entity maps + sync history + write-back log (every state)
  // so /integrations showcases two-way sync without a live PMS.
  await seedDemoPms(orgId)

  return {
    organizationId: orgId,
    organizationSlug: slug,
    organizationName: name,
    created: true,
    patientCount: patientIds.length,
    appointmentCount: apptCount,
  }
}

// ── Shared lead seeds (used by both new-clinic-seed + self-heal) ─────
// Single source of truth so both code paths produce the same 6 curated
// leads covering every lifecycle state. Updates here flow to both
// freshly-seeded demos AND legacy demos on next self-heal entry.

interface LeadSeed {
  name: string
  phone: string
  email: string | null
  preferredDate: string | null
  message: string | null
  sourcePage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  status: 'new' | 'contacted' | 'converted' | 'archived'
  hoursAgo: number
  contactedHoursAgo?: number
  convertedHoursAgo?: number
  /** true → link to Emma Lopez patient when present in the org. */
  linkToEmmaPatient?: boolean
  archivedHoursAgo?: number
  archivedReason?: string
}

const DEMO_LEAD_SEEDS: LeadSeed[] = [
  // Fresh new lead — under an hour, triggers "call within the hour" CTA
  { name: 'Olivia Chen', phone: '(415) 555-0188', email: 'olivia.c@example.com', preferredDate: null,
    message: "Looking for a family dentist for me and my two kids (5 + 8). Saw your website — love that you're warm-fuzzies about anxiety.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'new', hoursAgo: 0.5 },
  // Aging new lead — 18h, amber tint
  { name: 'Daniel Park', phone: '(415) 555-0119', email: null, preferredDate: '2026-06-15',
    message: 'Need a cleaning. Last one was probably 18 months ago. No insurance, what would the cash price be?',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'new', hoursAgo: 18 },
  // Stale new lead — 3 days, red border, embarrassing
  { name: 'Rachel Williams', phone: '(415) 555-0123', email: 'rachel.w@example.com', preferredDate: null,
    message: 'Hi! Wisdom tooth pain on the upper right, getting worse. Can I come in this week?',
    sourcePage: '/', referrer: 'https://www.instagram.com/', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'fall_recall',
    status: 'new', hoursAgo: 72 },
  // Contacted — staff called, waiting for follow-up
  { name: 'Marcus Johnson', phone: '(415) 555-0156', email: 'marcus.j@example.com', preferredDate: '2026-06-22',
    message: 'Need crown work, had a temporary fall out yesterday. Will need a same-week appointment if possible.',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'contacted', hoursAgo: 36, contactedHoursAgo: 30 },
  // Converted — became Emma Lopez (persona 6)
  { name: 'Emma Lopez', phone: '(415) 555-0234', email: 'emma.l@example.com', preferredDate: null,
    message: "Hi! New to the area, looking for a regular cleaning. Heard great things from a coworker.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'converted', hoursAgo: 14 * 24, contactedHoursAgo: 13 * 24, convertedHoursAgo: 12 * 24, linkToEmmaPatient: true },
  // Archived — spam example
  { name: 'aaaaa zzzzzz', phone: '(000) 000-0000', email: 'spam@spam.test', preferredDate: null,
    message: 'BUY MY SEO SERVICES CHEAP!!! Click here for amazing rankings!!! https://spamlink.example/seo',
    sourcePage: '/', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'archived', hoursAgo: 96, archivedHoursAgo: 95, archivedReason: 'spam' },
]

/**
 * Seed any lead from DEMO_LEAD_SEEDS that isn't already present (by
 * exact name match). Idempotent — safe to call repeatedly. Used in
 * both the new-clinic-seed path (passes `existingNames = new Set()`)
 * and the self-heal path on legacy demos.
 */
async function seedLeadsForOrg(
  orgId: string,
  now: Date,
  emmaPatientId: string | null,
  existingNames: Set<string>,
): Promise<number> {
  const hourMs = 60 * 60 * 1000
  const missing = DEMO_LEAD_SEEDS.filter((s) => !existingNames.has(s.name))
  if (missing.length === 0) return 0
  for (const l of missing) {
    await db.insert(schema.lead).values({
      id: newId('lead'),
      organizationId: orgId,
      name: l.name,
      phone: l.phone,
      email: l.email,
      preferredDate: l.preferredDate,
      message: l.message,
      sourcePage: l.sourcePage,
      referrer: l.referrer,
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      utmCampaign: l.utmCampaign,
      status: l.status,
      convertedToPatientId: l.linkToEmmaPatient ? emmaPatientId : null,
      contactedAt: l.contactedHoursAgo !== undefined ? new Date(now.getTime() - l.contactedHoursAgo * hourMs) : null,
      convertedAt: l.convertedHoursAgo !== undefined ? new Date(now.getTime() - l.convertedHoursAgo * hourMs) : null,
      archivedAt: l.archivedHoursAgo !== undefined ? new Date(now.getTime() - l.archivedHoursAgo * hourMs) : null,
      archivedReason: l.archivedReason ?? null,
      createdAt: new Date(now.getTime() - l.hoursAgo * hourMs),
    })
  }
  return missing.length
}

/**
 * Seed Recall & Outreach (Phase A) demo content. Lays down 4 patient-source
 * audiences + 3 campaigns covering every status state (sent / scheduled /
 * draft) so the /marketing dashboard never looks empty on a fresh demo.
 *
 * Idempotency: checks existing audience + campaign names per org; only
 * inserts those that are missing. Events for the "sent" campaign are only
 * inserted when the campaign itself was newly created — re-running on a
 * topped-up demo doesn't duplicate them.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos (existingAudienceNames + existingCampaignNames passed in from the
 * caller's per-org lookup).
 */
async function seedRecallOutreachForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  existingAudiencesByName: Map<string, number>,
  existingCampaignsByName: Map<string, number>,
): Promise<{ audiencesAdded: number; campaignsAdded: number; eventsAdded: number }> {
  // Make sure the 3 system templates are in the DB. One select + 0..3
  // inserts; cheap when already-seeded.
  await seedSystemTemplates()

  const dayMs = 24 * 60 * 60 * 1000

  // Look up the system template ids by name so seeded campaigns can attach
  // a templateId for "Created from template X" provenance.
  const tplRows = await db
    .select({ id: schema.campaignTemplates.id, name: schema.campaignTemplates.name })
    .from(schema.campaignTemplates)
    .where(eq(schema.campaignTemplates.kind, 'system'))
  const tplIdByName = new Map(tplRows.map((r) => [r.name, r.id]))

  // ── Audiences ────────────────────────────────────────────────────────
  // 4 dental segments matching the patient-flag glyphs. Each audience
  // stores a `patientFilter` JSON that resolveAudience knows how to
  // materialize. recipientSource='patients' is the discriminator.
  interface AudienceSeed {
    name: string
    description: string
    patientFilter: Record<string, unknown>
  }
  const AUDIENCE_SEEDS: AudienceSeed[] = [
    {
      name: 'Recall due (6+ months)',
      description: 'Patients whose last cleaning was over 6 months ago without a future booking. Drives the Reactivation campaign.',
      patientFilter: {
        recallStatuses: ['due', 'overdue'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Lapsed (lifecycle = lapsed)',
      description: 'Lifecycle stage flipped to lapsed — last visit >9 months ago. Tighter than "Recall due" — these are the cold ones.',
      patientFilter: {
        lifecycles: ['lapsed', 'at_risk'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'New patients (past 60 days)',
      description: 'Recently joined — for new-patient welcome sequences and check-in surveys.',
      patientFilter: {
        lifecycles: ['new'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Birthday this month',
      description: 'Patients celebrating a birthday this calendar month — for the warm-monthly outreach.',
      patientFilter: {
        birthdayThisMonth: true,
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
  ]

  const audienceIdByName = new Map(existingAudiencesByName)
  let audiencesAdded = 0
  for (const seed of AUDIENCE_SEEDS) {
    if (audienceIdByName.has(seed.name)) continue
    const [row] = await db
      .insert(schema.audiences)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: seed.description,
        recipientSource: 'patients',
        filter: {},
        patientFilter: seed.patientFilter,
      })
      .returning({ id: schema.audiences.id })
    audienceIdByName.set(seed.name, row.id)
    audiencesAdded++
  }

  // ── Campaigns ────────────────────────────────────────────────────────
  // 3 campaigns showcasing every lifecycle state. The sent campaign also
  // gets seeded events so the analytics panel shows real numbers.
  interface CampaignSeed {
    name: string
    templateName: string
    audienceName: string
    status: 'draft' | 'scheduled' | 'completed'
    sentDaysAgo?: number
    scheduledDaysAhead?: number
    seedEvents?: boolean
  }
  const CAMPAIGN_SEEDS: CampaignSeed[] = [
    {
      name: 'March Reactivation — come back for a cleaning',
      templateName: SYSTEM_TEMPLATES[0].name, // Reactivation
      audienceName: 'Lapsed (lifecycle = lapsed)',
      status: 'completed',
      sentDaysAgo: 5,
      seedEvents: true,
    },
    {
      name: 'May Birthday wishes',
      templateName: SYSTEM_TEMPLATES[1].name, // Birthday
      audienceName: 'Birthday this month',
      status: 'scheduled',
      scheduledDaysAhead: 2,
    },
    {
      name: 'New patient welcome — week 1 follow-up',
      templateName: SYSTEM_TEMPLATES[2].name, // Welcome
      audienceName: 'New patients (past 60 days)',
      status: 'draft',
    },
  ]

  let campaignsAdded = 0
  let eventsAdded = 0
  for (const seed of CAMPAIGN_SEEDS) {
    if (existingCampaignsByName.has(seed.name)) continue
    const tpl = tplIdByName.get(seed.templateName)
    const tplRow = SYSTEM_TEMPLATES.find((t) => t.name === seed.templateName)
    if (!tpl || !tplRow) continue
    const audienceId = audienceIdByName.get(seed.audienceName) ?? null
    const sentAt = seed.status === 'completed' && seed.sentDaysAgo
      ? new Date(now.getTime() - seed.sentDaysAgo * dayMs)
      : null
    const scheduledAt = seed.status === 'scheduled' && seed.scheduledDaysAhead
      ? new Date(now.getTime() + seed.scheduledDaysAhead * dayMs)
      : null

    const [campaign] = await db
      .insert(schema.campaigns)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: tplRow.description,
        status: seed.status,
        subject: tplRow.subject,
        previewText: tplRow.previewText,
        bodyHtml: tplRow.bodyHtml,
        audienceId,
        sendChannel: 'resend',
        recipientSource: 'patients',
        templateId: tpl,
        scheduledAt,
        sentAt,
        sendStats: seed.seedEvents ? { attempted: 2, sent: 2, failed: 0 } : {},
      })
      .returning({ id: schema.campaigns.id })
    campaignsAdded++

    // Seed realistic events for the "Sent" campaign so the analytics
    // panel shows numbers. We pick Aiden (persona 5 — lapsed-returning,
    // his recall_campaign appointment becomes the 'booked' outcome) and
    // Emma (persona 6 — at_risk → opened but didn't click). The Sent
    // event predates the Open event by a few minutes; Click predates
    // Booked by an hour or so to read as a real conversion funnel.
    if (seed.seedEvents && patientIds.length > 5 && sentAt) {
      const aidenId = patientIds[5] ?? null
      const emmaId = patientIds[6] ?? null
      const aidenEmail = 'aiden.k@example.com'
      const emmaEmail = 'emma.l@example.com'
      // Sent events (one per recipient).
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      // Both open (Aiden + Emma)
      const openAt = new Date(sentAt.getTime() + 2 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      // Aiden clicks (Emma didn't).
      const clickAt = new Date(sentAt.getTime() + 3 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'click',
          occurredAt: clickAt,
          meta: { url: 'https://acme-dental.dreamcreatestudio.com/book' },
        })
        eventsAdded++
        // Aiden booked the recall_campaign appointment that's seeded earlier.
        // Look it up + record a 'booked' event tying back to the campaign.
        const [aidenRecallAppt] = await db
          .select({ id: schema.appointment.id })
          .from(schema.appointment)
          .where(
            and(
              eq(schema.appointment.organizationId, orgId),
              eq(schema.appointment.patientId, aidenId),
              eq(schema.appointment.source, 'recall_campaign'),
            ),
          )
          .limit(1)
        if (aidenRecallAppt) {
          const bookedAt = new Date(sentAt.getTime() + 4 * 60 * 60 * 1000)
          await db.insert(schema.campaignEvents).values({
            campaignId: campaign.id,
            recipientEmail: aidenEmail,
            patientId: aidenId,
            bookedAppointmentId: aidenRecallAppt.id,
            bookedAt,
            type: 'booked',
            occurredAt: bookedAt,
            meta: {},
          })
          eventsAdded++
        }
      }
    }
  }

  return { audiencesAdded, campaignsAdded, eventsAdded }
}

/**
 * Seed Patient Communications (Phase A) demo content. Lays down 5 patient
 * threads with mixed in-app + email channel messages covering every
 * thread-state combination: open with unread (red rot), open without
 * unread, snoozed, archived, and one with no unread (the happy path).
 *
 * Idempotency: checks existing thread patient ids per org; only inserts
 * threads for patients that don't already have one. Each newly-seeded
 * thread gets a curated message sequence. Re-running on a topped-up demo
 * doesn't duplicate.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos.
 */
async function seedPatientMessagesForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  existingThreadPatientIds: Set<string>,
): Promise<{ threadsAdded: number; messagesAdded: number }> {
  const hourMs = 60 * 60 * 1000

  // Reference personas (index-aligned to demo-clinic.ts buildPatientPersonas):
  //   [0] Mia Hayes      — happy-path, closed-loop appointment scheduling
  //   [3] Marcus Johnson — outstanding balance, unconfirmed appt (red rot)
  //   [4] Sophia Iverson — confirmed appt in 22h, closed exchange
  //   [5] Aiden Kim      — lapsed-returning, snoozed thread
  //   [6] Emma Lopez     — fresh-booked, single inbound email (open)
  interface SeedThread {
    patientIdx: number
    status: 'open' | 'snoozed' | 'archived'
    snoozedInHours?: number
    messages: Array<{
      direction: 'inbound' | 'outbound'
      channel: 'in_app' | 'email'
      body: string
      hoursAgo: number
    }>
  }
  const THREAD_SEEDS: SeedThread[] = [
    // Mia — happy path, recently confirmed, closed
    {
      patientIdx: 0,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Mia — just confirming your cleaning has been moved to next week per our chat. New time is on the calendar. Let us know if anything changes. — The team', hoursAgo: 72 },
        { direction: 'inbound', channel: 'email', body: 'Perfect, thank you! That works much better for me. See you then.', hoursAgo: 71 },
        { direction: 'outbound', channel: 'in_app', body: 'Got it. We\'ll send a reminder the day before.', hoursAgo: 70 },
      ],
    },
    // Marcus — RED ROT: inbound 3 days ago, no reply
    {
      patientIdx: 3,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Marcus, your filling appointment is coming up. We\'ll see you Tuesday at 10am.', hoursAgo: 96 },
        { direction: 'inbound', channel: 'in_app', body: 'Hey, quick question about insurance pre-auth — did the request go through? My HR rep said she hadn\'t seen anything yet.', hoursAgo: 75 },
        { direction: 'inbound', channel: 'in_app', body: 'Also can I bring my partner along for the consultation? She had some questions about her own treatment.', hoursAgo: 74 },
      ],
    },
    // Sophia — confirmed appointment, recently closed
    {
      patientIdx: 4,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Sophia — confirming your cleaning tomorrow at 3pm with Maria. Reply YES to confirm or let us know if you need to reschedule.', hoursAgo: 6 },
        { direction: 'inbound', channel: 'in_app', body: 'Yes! See you tomorrow.', hoursAgo: 4 },
      ],
    },
    // Aiden — snoozed (post-rebooking, will resurface tomorrow)
    {
      patientIdx: 5,
      status: 'snoozed',
      snoozedInHours: 24,
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Aiden — so glad you\'re coming back in! Your appointment Wednesday at 1pm is on the books. A few first-visit-back things to know: please arrive 10 minutes early to update your medical history, and we\'ll do a quick exam alongside the cleaning since it\'s been a while.', hoursAgo: 18 },
        { direction: 'inbound', channel: 'email', body: 'Thanks, see you Wednesday!', hoursAgo: 14 },
      ],
    },
    // Emma — AMBER ROT: inbound this morning, no reply yet (high-priority unread)
    {
      patientIdx: 6,
      status: 'open',
      messages: [
        { direction: 'inbound', channel: 'email', body: 'Hi! Quick question — I booked through your website for next week but I forgot to mention I have a temporary crown on a back molar that\'s been bothering me. Could we look at that during the consult, or do I need a separate appointment?', hoursAgo: 16 },
      ],
    },
  ]

  let threadsAdded = 0
  let messagesAdded = 0

  for (const seed of THREAD_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (existingThreadPatientIds.has(patientId)) continue

    const threadId = newId('pthread')
    const sortedMessages = [...seed.messages].sort((a, b) => b.hoursAgo - a.hoursAgo)
    const lastMessage = sortedMessages[sortedMessages.length - 1]
    const inboundAfterLastOutbound = (() => {
      // Count inbound messages that came after the last outbound (the unread
      // count). Mirrors the real recordInboundMessage behavior.
      let count = 0
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        if (sortedMessages[i].direction === 'inbound') count++
        else break
      }
      return count
    })()

    await db.insert(schema.patientThread).values({
      id: threadId,
      organizationId: orgId,
      patientId,
      status: seed.status,
      snoozedUntil: seed.snoozedInHours ? new Date(now.getTime() + seed.snoozedInHours * hourMs) : null,
      lastMessageAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
      lastMessageDirection: lastMessage.direction,
      lastMessageChannel: lastMessage.channel,
      unreadCountForClinic: inboundAfterLastOutbound,
      createdAt: new Date(now.getTime() - sortedMessages[0].hoursAgo * hourMs),
      updatedAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
    })
    threadsAdded++

    for (const m of sortedMessages) {
      await db.insert(schema.patientMessage).values({
        id: newId('pmsg'),
        threadId,
        organizationId: orgId,
        patientId,
        channel: m.channel,
        direction: m.direction,
        body: m.body,
        sentByUserId: null, // demo seeder doesn't tie to a specific staff user
        sentAt: new Date(now.getTime() - m.hoursAgo * hourMs),
      })
      messagesAdded++
    }
  }

  return { threadsAdded, messagesAdded }
}

/**
 * Seed Reviews & Reputation demo content. Lays down the clinic review
 * config (Google Place ID + Healthgrades URL) and a curated set of
 * review_request rows covering every funnel state. Idempotent —
 * checks existing config and patient ids before inserting.
 */
async function seedReviewsForOrg(
  orgId: string,
  now: Date,
  patientIds: string[],
  configExists: boolean,
  existingPatientRequestIds: Set<string>,
): Promise<{ configAdded: boolean; requestsAdded: number }> {
  const dayMs = 24 * 60 * 60 * 1000
  let configAdded = false
  let requestsAdded = 0

  // Seed config (Acme Dental's "Google Place ID" — visibly fake but
  // well-formed, so the public landing page renders the right URL even
  // though the deep link won't resolve in dev).
  if (!configExists) {
    await db.insert(schema.clinicReviewConfig).values({
      organizationId: orgId,
      googlePlaceId: 'ChIJDemo000000000_AcmeDental',
      healthgradesUrl: 'https://www.healthgrades.com/dental-practice/acme-dental-demo',
      facebookPageId: 'acme-dental-demo',
      yelpBusinessSlug: null, // opt-in only; Acme keeps it off
      minDaysBetweenRequests: 365,
      npsEnabled: 0,
      autoSendEnabled: 0,
      autoSendDelayHours: 24,
    })
    configAdded = true
  }

  // Curated review_request seeds covering every funnel state.
  // Index-aligned to demo personas:
  //   [0] Mia        — completed (picked Google, 5d ago)
  //   [3] Marcus     — sent + clicked (3d ago) — bouncing back
  //   [4] Sophia     — sent yesterday, not opened
  //   [7] Noah       — completed (picked Healthgrades, 12d ago)
  //   [8] filler     — skipped (staff decided not to ask)
  //   [9] filler     — failed (email bounced)
  interface ReviewSeed {
    patientIdx: number
    status: 'sent' | 'clicked' | 'completed' | 'skipped' | 'failed'
    daysAgo: number
    selectedSite?: 'google' | 'healthgrades' | 'facebook' | 'yelp'
  }
  const REVIEW_SEEDS: ReviewSeed[] = [
    { patientIdx: 0, status: 'completed', daysAgo: 5, selectedSite: 'google' },
    { patientIdx: 7, status: 'completed', daysAgo: 12, selectedSite: 'healthgrades' },
    { patientIdx: 3, status: 'clicked', daysAgo: 3 },
    { patientIdx: 4, status: 'sent', daysAgo: 1 },
    { patientIdx: 8, status: 'skipped', daysAgo: 7 },
    { patientIdx: 9, status: 'failed', daysAgo: 4 },
  ]

  for (const seed of REVIEW_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (existingPatientRequestIds.has(patientId)) continue

    const sentAt = seed.status === 'failed'
      ? null
      : new Date(now.getTime() - seed.daysAgo * dayMs)
    const clickedAt = seed.status === 'clicked' || seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.25) * dayMs)
      : null
    const completedAt = seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.5) * dayMs)
      : null

    await db.insert(schema.reviewRequest).values({
      id: newId('revreq'),
      organizationId: orgId,
      patientId,
      appointmentId: null,
      requestedByUserId: null,
      channel: 'email',
      status: seed.status,
      sentAt,
      clickedAt,
      completedAt,
      selectedSite: seed.selectedSite ?? null,
      token: `demo${seed.status.slice(0, 3)}${seed.patientIdx}_${Math.random().toString(36).slice(2, 10)}`,
      errorMessage: seed.status === 'failed' ? 'Email bounced (demo)' : null,
      createdAt: new Date(now.getTime() - seed.daysAgo * dayMs),
      updatedAt: new Date(now.getTime() - seed.daysAgo * dayMs),
    })
    requestsAdded++
  }

  return { configAdded, requestsAdded }
}

// ── Blog seeding (shared by new-clinic-seed + self-heal) ────────────────
// Curated set covering every state the /blog dashboard + public blog show:
// two published posts bylined to demo staff (p1 = Dr. Jordan Reyes,
// p3 = Maria Vega, RDH — the ids seeded into clinicProfile.staff), one plain
// draft, and one AI-drafted post still awaiting review (drives the
// "AI · review" badge + the publish gate). Content comes from the shared
// STARTER_BLOG_TOPICS so there's a single source of truth. Additive +
// idempotent on slug.
interface BlogPostSeed {
  slug: string
  status: 'draft' | 'scheduled' | 'published'
  source: 'manual' | 'ai_draft'
  authorStaffId: string | null
  authorName: string | null
  // p3 = Maria (hygienist) writes the gum-health post, reviewed by p1 (Dr.
  // Reyes) — exercises the public "Medically reviewed by" byline line.
  medicallyReviewedByStaffId: string | null
  publishedDaysAgo: number | null
  scheduledInDays: number | null
  coverImageUrl: string | null
  coverImageAlt?: string | null
  faq?: Array<{ q: string; a: string }>
  viewCount: number
  // idea-to-draft stub: empty body so it lands in the calendar's "Ideas" lane.
  isStub?: boolean
}

const DEMO_BLOG_PLAN: BlogPostSeed[] = [
  {
    slug: 'what-to-expect-at-your-first-visit',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: 9,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[0].url,
    coverImageAlt: 'A bright, modern dental treatment room with natural light',
    viewCount: 142,
  },
  {
    slug: 'why-your-gums-matter',
    status: 'published',
    source: 'manual',
    authorStaffId: 'p3',
    authorName: 'Maria Vega, RDH',
    medicallyReviewedByStaffId: 'p1',
    publishedDaysAgo: 28,
    scheduledInDays: null,
    coverImageUrl: DEMO_OFFICE_PHOTOS[2].url,
    coverImageAlt: 'A dental hygienist reviewing gum health with a smiling patient',
    faq: [
      {
        q: 'Is it normal for my gums to bleed when I floss?',
        a: 'A little bleeding when you first start flossing is common and usually settles within a week or two. If it keeps happening, mention it at your next visit.',
      },
      {
        q: 'How often should I have my gums checked?',
        a: 'For most people, a check-up and cleaning every six months keeps gums healthy and catches any early changes.',
      },
      {
        q: 'Can gum problems be reversed?',
        a: 'Early gum inflammation (gingivitis) is very reversible with good home care and a professional cleaning. More advanced issues are managed rather than fully reversed — so earlier is always better.',
      },
    ],
    viewCount: 87,
  },
  {
    slug: 'teeth-whitening-what-actually-works',
    status: 'draft',
    source: 'manual',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Scheduled to auto-publish — exercises the Content Engine cron path.
    slug: 'sensitive-teeth-what-helps',
    status: 'scheduled',
    source: 'manual',
    authorStaffId: 'p1',
    authorName: 'Dr. Jordan Reyes',
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: 6,
    coverImageUrl: DEMO_OFFICE_PHOTOS[1].url,
    coverImageAlt: 'A calm dental reception area with warm wood and plants',
    viewCount: 0,
  },
  {
    // AI draft pending review (full body, awaiting an author + publish).
    slug: 'bringing-your-kids-to-the-dentist',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
  },
  {
    // Idea stub — lands in the calendar's "Ideas to draft" lane.
    slug: 'do-you-need-a-night-guard',
    status: 'draft',
    source: 'ai_draft',
    authorStaffId: null,
    authorName: null,
    medicallyReviewedByStaffId: null,
    publishedDaysAgo: null,
    scheduledInDays: null,
    coverImageUrl: null,
    viewCount: 0,
    isStub: true,
  },
]

async function seedBlogPostsForOrg(orgId: string, now: Date, existingSlugs: Set<string>) {
  const topicBySlug = new Map(STARTER_BLOG_TOPICS.map((t) => [t.slug, t]))
  const dayMs = 24 * 60 * 60 * 1000
  let added = 0
  for (const plan of DEMO_BLOG_PLAN) {
    const publishedAt =
      plan.publishedDaysAgo != null ? new Date(now.getTime() - plan.publishedDaysAgo * dayMs) : null
    const scheduledFor =
      plan.scheduledInDays != null ? new Date(now.getTime() + plan.scheduledInDays * dayMs) : null
    const reviewedAt = plan.medicallyReviewedByStaffId ? publishedAt ?? now : null
    if (existingSlugs.has(plan.slug)) {
      // Backfill Track-A fields (reviewer + view count) on legacy demo posts
      // that predate them, so the demo always showcases the latest module.
      await db
        .update(schema.blogPost)
        .set({
          medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
          medicallyReviewedAt: reviewedAt,
          viewCount: plan.viewCount,
          coverImageAlt: plan.coverImageAlt ?? null,
          faq: plan.faq ?? null,
        })
        .where(and(eq(schema.blogPost.organizationId, orgId), eq(schema.blogPost.slug, plan.slug)))
      continue
    }
    const topic = topicBySlug.get(plan.slug)
    if (!topic) continue
    await db.insert(schema.blogPost).values({
      id: newId('post'),
      organizationId: orgId,
      title: topic.title,
      slug: topic.slug,
      excerpt: topic.excerpt,
      bodyHtml: plan.isStub ? '' : sanitizeBlogHtml(topic.bodyHtml),
      category: topic.category,
      status: plan.status,
      source: plan.source,
      authorStaffId: plan.authorStaffId,
      authorName: plan.authorName,
      medicallyReviewedByStaffId: plan.medicallyReviewedByStaffId,
      medicallyReviewedAt: reviewedAt,
      coverImageUrl: plan.coverImageUrl,
      coverImageAlt: plan.coverImageAlt ?? null,
      faq: plan.faq ?? null,
      viewCount: plan.viewCount,
      scheduledFor,
      publishedAt,
      createdAt: publishedAt ?? now,
      updatedAt: publishedAt ?? now,
    })
    added++
  }
  return { added }
}

// ── Booking attribution backfill (demo) ─────────────────────────────────────
// Populates referrer/UTM on the demo's public-booking appointments so the SEO
// module's organic→booking funnel shows a realistic mix. Idempotent (only
// touches booking_widget rows that have no referrer yet). Runs on both the
// fresh-seed and self-heal paths.
async function backfillDemoBookingAttribution(orgId: string) {
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

// ── Careers seeding (shared by new-clinic-seed + self-heal) ─────────────────
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. Two open roles + one draft + applications across the
// whole pipeline (new/reviewing/interview/offer/hired/rejected) with aging
// spread so the rot borders + every status chip render on the demo.
async function seedDemoCareers(orgId: string, locationId: string | null, now: Date) {
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000
  const hygId = newId('job')
  const fdId = newId('job')
  const dentId = newId('job')

  await db.insert(schema.jobPosting).values([
    {
      id: hygId,
      organizationId: orgId,
      locationId,
      title: 'Dental Hygienist',
      slug: 'dental-hygienist',
      role: 'hygienist',
      employmentType: 'full_time',
      description:
        'We’re looking for a warm, thorough RDH to join our hygiene team. Our patients are loyal, our schedule is well-run, and our team genuinely likes each other. You’ll own your column with modern equipment and real admin support.',
      responsibilities:
        '• Prophylaxis, SRP, and periodontal maintenance\n• Intraoral imaging + chart documentation\n• Patient education with our anti-shame approach\n• Partnering with the doctor on treatment planning',
      requirements:
        '• Active RDH license in TX\n• Local anesthesia certification preferred\n• 1+ year clinical experience (new grads welcome to apply)',
      benefits: 'Health + dental, 401(k) match, CE allowance, 4-day work week, paid holidays.',
      compMinCents: 3800,
      compMaxCents: 4800,
      compPeriod: 'hour',
      showComp: 1,
      status: 'open',
      applyMethod: 'in_app',
      postedAt: new Date(now.getTime() - 9 * dayMs),
      createdAt: new Date(now.getTime() - 9 * dayMs),
    },
    {
      id: fdId,
      organizationId: orgId,
      locationId,
      title: 'Front Desk Coordinator',
      slug: 'front-desk-coordinator',
      role: 'front_desk',
      employmentType: 'full_time',
      description:
        'The first face our patients see. You’ll own scheduling, check-in, insurance verification, and keeping the day running smoothly. Friendly, organized, and unflappable under a busy phone.',
      responsibilities:
        '• Greet + check in patients\n• Manage the schedule + recall list\n• Verify insurance + collect copays\n• Answer calls and respond to website inquiries',
      requirements: '• Front-desk or customer-service experience\n• Dental software experience a plus (we’ll train)',
      benefits: 'Health + dental, PTO, quarterly team bonuses.',
      compMinCents: 2000,
      compMaxCents: 2600,
      compPeriod: 'hour',
      showComp: 1,
      status: 'open',
      applyMethod: 'in_app',
      postedAt: new Date(now.getTime() - 5 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: dentId,
      organizationId: orgId,
      locationId,
      title: 'Associate Dentist (part-time)',
      slug: 'associate-dentist',
      role: 'associate_dentist',
      employmentType: 'part_time',
      description:
        'Two-to-three days a week to start, with room to grow. Established patient base, strong hygiene program feeding restorative, and a collaborative, no-drama environment.',
      requirements: '• Active TX dental license\n• DEA registration\n• Comfortable with everyday restorative + we refer out complex surgical',
      benefits: 'Percentage of collections, malpractice covered, flexible schedule.',
      compMinCents: null,
      compMaxCents: null,
      compPeriod: 'year',
      showComp: 0,
      status: 'draft',
      applyMethod: 'in_app',
    },
  ])

  await db.insert(schema.jobApplication).values([
    // Fresh, unreviewed → emerald rot border + 🆕 attention.
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Jordan Avery',
      email: 'jordan.avery@example.com',
      phone: '(512) 555-0142',
      linkedinUrl: 'https://www.linkedin.com/in/jordan-avery-rdh',
      coverNote:
        'Hi! I’ve been a hygienist for 6 years and I’m looking for a practice that values patient relationships over production quotas. Your site’s tone really resonated with me.',
      status: 'new',
      source: 'career_site',
      createdAt: new Date(now.getTime() - 6 * hourMs),
    },
    // Aging unreviewed (amber border).
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Taylor Kim',
      email: 'taylor.kim@example.com',
      phone: '(512) 555-0188',
      status: 'new',
      source: 'career_site',
      createdAt: new Date(now.getTime() - 50 * hourMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      phone: '(512) 555-0173',
      status: 'reviewing',
      source: 'career_site',
      reviewedAt: new Date(now.getTime() - 1 * dayMs),
      createdAt: new Date(now.getTime() - 3 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Sam Brooks',
      email: 'sam.brooks@example.com',
      phone: '(512) 555-0155',
      status: 'interview',
      source: 'referral',
      rating: 4,
      notes: 'Strong references. Scheduling a working interview next week.',
      reviewedAt: new Date(now.getTime() - 2 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Riley Chen',
      email: 'riley.chen@example.com',
      phone: '(512) 555-0121',
      status: 'offer',
      source: 'career_site',
      rating: 5,
      notes: 'Great culture fit. Offer sent — awaiting response.',
      reviewedAt: new Date(now.getTime() - 4 * dayMs),
      createdAt: new Date(now.getTime() - 7 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: fdId,
      name: 'Morgan Lee',
      email: 'morgan.lee@example.com',
      status: 'hired',
      source: 'career_site',
      rating: 5,
      notes: 'Started this month — already a star.',
      reviewedAt: new Date(now.getTime() - 15 * dayMs),
      decidedAt: new Date(now.getTime() - 10 * dayMs),
      createdAt: new Date(now.getTime() - 20 * dayMs),
    },
    {
      id: newId('app'),
      organizationId: orgId,
      jobPostingId: hygId,
      name: 'Casey Doyle',
      email: 'casey.doyle@example.com',
      status: 'rejected',
      source: 'career_site',
      notes: 'Not enough recent clinical hours for this role.',
      reviewedAt: new Date(now.getTime() - 10 * dayMs),
      decidedAt: new Date(now.getTime() - 9 * dayMs),
      createdAt: new Date(now.getTime() - 12 * dayMs),
    },
  ])
}

// ── Shop seeding (catalog only; orders/coupons/memberships in later slices) ──
// Pure inserts (no selects) so the new-seed path doesn't shift the seeder
// test's select queue. 6 products across categories + statuses, 7 variants.
async function seedDemoShop(orgId: string, now: Date, patientIds: string[] = []) {
  await db
    .insert(schema.shopConfig)
    .values({
      organizationId: orgId,
      pickupEnabled: 1,
      shippingEnabled: 1,
      taxEnabled: 0,
      storefrontEnabled: 1,
      membershipEnabled: 1,
      stripeAccountStatus: 'none',
    })
    .onConflictDoNothing({ target: schema.shopConfig.organizationId })

  const whiteningId = newId('prod')
  const brushId = newId('prod')
  const flosserId = newId('prod')
  const pensId = newId('prod')
  const kidsId = newId('prod')
  const merchId = newId('prod')

  await db.insert(schema.shopProduct).values([
    {
      id: whiteningId,
      organizationId: orgId,
      name: 'Professional Whitening Kit',
      slug: 'professional-whitening-kit',
      description:
        'Dentist-dispensed take-home whitening with professional-strength gel and a comfortable tray. Noticeably whiter in about two weeks — far stronger than anything off the shelf.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 1,
      position: 0,
    },
    {
      id: brushId,
      organizationId: orgId,
      name: 'Sonic Electric Toothbrush',
      slug: 'sonic-electric-toothbrush',
      description: 'The brush we recommend to every patient — sonic cleaning, 2-minute timer, and a pressure sensor so you do not brush too hard.',
      category: 'brushes',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 1,
      featured: 1,
      position: 1,
    },
    {
      id: flosserId,
      organizationId: orgId,
      name: 'Cordless Water Flosser',
      slug: 'cordless-water-flosser',
      description: 'Great for braces, implants, and anyone who finds string floss a chore. Rechargeable and travel-friendly.',
      category: 'flossers',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 2,
    },
    {
      id: pensId,
      organizationId: orgId,
      name: 'Whitening Touch-Up Pens (3-pack)',
      slug: 'whitening-touch-up-pens',
      description: 'Keep your results bright between visits. Pop one in your bag for quick touch-ups.',
      category: 'whitening',
      images: [],
      status: 'active',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 3,
    },
    {
      id: kidsId,
      organizationId: orgId,
      name: 'Kids Brush + 2-Minute Timer Set',
      slug: 'kids-brush-timer-set',
      description: 'Makes brushing fun and gets them to the full two minutes. Soft bristles sized for little mouths.',
      category: 'kids',
      images: [],
      status: 'draft',
      fulfillment: 'both',
      fsaEligible: 0,
      featured: 0,
      position: 4,
    },
    {
      id: merchId,
      organizationId: orgId,
      name: 'Branded Travel Care Kit',
      slug: 'branded-travel-care-kit',
      description: 'Travel toothbrush, mini paste, and floss in a clinic-branded zip pouch.',
      category: 'merch',
      images: [],
      status: 'archived',
      fulfillment: 'pickup',
      fsaEligible: 0,
      featured: 0,
      position: 5,
    },
  ])

  const whiteningStdVar = newId('var')
  const brushVar = newId('var')
  const flosserVar = newId('var')
  const pensVar = newId('var')
  await db.insert(schema.shopProductVariant).values([
    { id: whiteningStdVar, productId: whiteningId, organizationId: orgId, name: 'Standard', priceCents: 14900, inventoryQty: 25, position: 0 },
    { id: newId('var'), productId: whiteningId, organizationId: orgId, name: 'Sensitive formula', priceCents: 14900, inventoryQty: 12, position: 1 },
    { id: brushVar, productId: brushId, organizationId: orgId, name: 'Default', priceCents: 8900, compareAtCents: 11900, inventoryQty: 40, position: 0 },
    { id: flosserVar, productId: flosserId, organizationId: orgId, name: 'Default', priceCents: 5900, inventoryQty: 18, position: 0 },
    { id: pensVar, productId: pensId, organizationId: orgId, name: 'Default', priceCents: 2900, inventoryQty: null, position: 0 },
    { id: newId('var'), productId: kidsId, organizationId: orgId, name: 'Default', priceCents: 1900, inventoryQty: 30, position: 0 },
    { id: newId('var'), productId: merchId, organizationId: orgId, name: 'Default', priceCents: 1500, inventoryQty: null, position: 0 },
  ])

  // Orders covering pickup/ship + paid/pending states. First linked to a
  // patient when one is available (new-seed path); the rest are guest orders.
  const dayMs = 24 * 60 * 60 * 1000
  const o1 = newId('ord')
  const o2 = newId('ord')
  const o3 = newId('ord')
  await db.insert(schema.shopOrder).values([
    {
      id: o1,
      organizationId: orgId,
      patientId: patientIds[2] ?? null,
      email: 'sophia.martinez@example.com',
      name: 'Sophia Martinez',
      fulfillmentType: 'pickup',
      status: 'paid',
      fulfillmentStatus: 'ready_for_pickup',
      subtotalCents: 14900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 14900,
      paidAt: new Date(now.getTime() - 2 * dayMs),
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      id: o2,
      organizationId: orgId,
      email: 'guest.buyer@example.com',
      name: 'Daniel Park',
      fulfillmentType: 'ship',
      status: 'paid',
      fulfillmentStatus: 'shipped',
      subtotalCents: 14800,
      shippingCents: 600,
      taxCents: 0,
      totalCents: 15400,
      trackingNumber: '9400110200000000000000',
      shippingAddress: { line1: '500 Cedar St', city: 'Austin', state: 'TX', postal_code: '78704', country: 'US' },
      paidAt: new Date(now.getTime() - 5 * dayMs),
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      id: o3,
      organizationId: orgId,
      email: 'window.shopper@example.com',
      fulfillmentType: 'pickup',
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
      subtotalCents: 2900,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 2900,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  ])
  await db.insert(schema.shopOrderItem).values([
    { id: `oi_${newId('x')}`, orderId: o1, organizationId: orgId, variantId: whiteningStdVar, productName: 'Professional Whitening Kit', variantName: 'Standard', unitPriceCents: 14900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: brushVar, productName: 'Sonic Electric Toothbrush', variantName: null, unitPriceCents: 8900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o2, organizationId: orgId, variantId: flosserVar, productName: 'Cordless Water Flosser', variantName: null, unitPriceCents: 5900, quantity: 1 },
    { id: `oi_${newId('x')}`, orderId: o3, organizationId: orgId, variantId: pensVar, productName: 'Whitening Touch-Up Pens (3-pack)', variantName: null, unitPriceCents: 2900, quantity: 1 },
  ])

  // Coupons: 2 open promo codes + (when a patient exists) a single-use
  // birthday code, so the coupons page shows manual + birthday sources.
  const coupons: Array<typeof schema.shopCoupon.$inferInsert> = [
    { id: newId('coupon'), organizationId: orgId, code: 'WELCOME10', discountType: 'percent', discountValue: 10, source: 'manual', singleUse: 0 },
    { id: newId('coupon'), organizationId: orgId, code: 'SUMMER25', discountType: 'amount', discountValue: 2500, source: 'manual', singleUse: 0, minSubtotalCents: 10000, expiresAt: new Date(now.getTime() + 60 * dayMs) },
  ]
  if (patientIds[0]) {
    coupons.push({ id: newId('coupon'), organizationId: orgId, code: 'BDAY-7F3A2C', discountType: 'percent', discountValue: 15, source: 'birthday', singleUse: 1, patientId: patientIds[0], expiresAt: new Date(now.getTime() + 45 * dayMs) })
  }
  await db.insert(schema.shopCoupon).values(coupons)
}

// ── Membership plans + members (pure inserts) ───────────────────────────────
// Memberships need a patient (NOT NULL FK), so members are seeded only for the
// patientIds passed in. Plans seed regardless.
async function seedDemoMemberships(orgId: string, now: Date, patientIds: string[]) {
  const dayMs = 24 * 60 * 60 * 1000
  const smileId = newId('mplan')
  const liteId = newId('mplan')
  await db.insert(schema.membershipPlan).values([
    {
      id: smileId,
      organizationId: orgId,
      name: 'Smile Club',
      slug: 'smile-club',
      description:
        'No insurance? No problem. Your preventive care for one simple yearly fee — plus 15% off everything else. No deductibles, no claim forms, no waiting periods.',
      billingInterval: 'annual',
      priceCents: 39900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
        { label: '1 emergency visit', qty: 1 },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 1,
      position: 0,
    },
    {
      id: liteId,
      organizationId: orgId,
      name: 'Smile Club Monthly',
      slug: 'smile-club-monthly',
      description: 'The same coverage, spread across the year.',
      billingInterval: 'monthly',
      priceCents: 3900,
      benefits: [
        { label: '2 cleanings per year', qty: 2 },
        { label: '2 exams per year', qty: 2 },
        { label: 'Routine X-rays' },
      ],
      discountPercent: 15,
      status: 'active',
      featured: 0,
      position: 1,
    },
  ])

  const members: Array<{ patientId: string | undefined; status: string; benefitsUsed: Record<string, number>; offset: number }> = [
    { patientId: patientIds[0], status: 'active', benefitsUsed: { '2 cleanings per year': 1 } as Record<string, number>, offset: 250 },
    { patientId: patientIds[1], status: 'active', benefitsUsed: {} as Record<string, number>, offset: 320 },
    { patientId: patientIds[4], status: 'past_due', benefitsUsed: { '2 cleanings per year': 2, '2 exams per year': 1 } as Record<string, number>, offset: 12 },
  ].filter((m) => Boolean(m.patientId))
  if (members.length > 0) {
    await db.insert(schema.membership).values(
      members.map((m) => ({
        id: newId('mem'),
        organizationId: orgId,
        planId: smileId,
        patientId: m.patientId as string,
        status: m.status,
        stripeSubscriptionId: `sub_demo_${newId('x')}`,
        benefitsUsed: m.benefitsUsed,
        currentPeriodStart: new Date(now.getTime() - (365 - m.offset) * dayMs),
        currentPeriodEnd: new Date(now.getTime() + m.offset * dayMs),
        startedAt: new Date(now.getTime() - (365 - m.offset) * dayMs),
      })),
    )
  }
}
