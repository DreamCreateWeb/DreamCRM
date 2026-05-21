import 'server-only'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId, slugify } from '@/lib/utils'
import { seedDefaultIntakeForm } from '@/lib/services/forms'

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
    // Self-heal: keep the demo on the current template defaults so it
    // always showcases the latest visual direction. Runs every time the
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
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, existing.id))
      .limit(1)

    const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
    if (profile?.brandColor === '#0ea5e9') patch.brandColor = '#9CAF9F'
    if (!profile?.stats) patch.stats = DEMO_STATS
    if (!profile?.testimonials) patch.testimonials = DEMO_TESTIMONIALS
    if (!profile?.officePhotos) patch.officePhotos = DEMO_OFFICE_PHOTOS
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

    const patientCount = (
      await db.select({ id: schema.patient.id }).from(schema.patient).where(eq(schema.patient.organizationId, existing.id))
    ).length
    const appointmentCount = (
      await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(eq(schema.appointment.organizationId, existing.id))
    ).length
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
    const start = new Date(now.getTime() + a.startOffsetMs)
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

  // A handful of orders (rendered as "Treatment Plans" in the clinic sidebar)
  // and invoices, evenly distributed across statuses.
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

  return {
    organizationId: orgId,
    organizationSlug: slug,
    organizationName: name,
    created: true,
    patientCount: patientIds.length,
    appointmentCount: apptCount,
  }
}
