import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId, slugify } from '@/lib/utils'

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
    // Self-heal: if the demo was seeded before the warm-neutral palette
    // shipped (sky-blue brand color), bump it forward so the demo always
    // showcases the current default template look.
    await db
      .update(schema.clinicProfile)
      .set({ brandColor: '#9CAF9F' })
      .where(
        and(
          eq(schema.clinicProfile.organizationId, existing.id),
          eq(schema.clinicProfile.brandColor, '#0ea5e9'),
        ),
      )
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

  // Seed 15 patients with varied demographics + insurance
  const patientIds: string[] = []
  for (let i = 0; i < 15; i++) {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const loc = pick(CITIES)
    const pid = newId('pat')
    patientIds.push(pid)
    await db.insert(schema.patient).values({
      id: pid,
      organizationId: orgId,
      firstName: first,
      lastName: last,
      dateOfBirth: randomDob(),
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      addressLine1: `${100 + Math.floor(Math.random() * 900)} ${pick(STREETS)}`,
      city: loc.city,
      state: loc.state,
      postalCode: loc.zip,
      insuranceProvider: pick(INSURERS),
      insurancePolicyNumber:
        pick(INSURERS) === null ? null : `POL-${Math.floor(Math.random() * 9_000_000) + 1_000_000}`,
      notes:
        i % 4 === 0 ? 'Prefers morning appointments.' : i % 5 === 0 ? 'Allergic to penicillin.' : null,
      isActive: 1,
    })
  }

  // Seed appointments — 6 past (completed/no_show), 6 future (scheduled/confirmed)
  let apptCount = 0
  const dayMs = 24 * 60 * 60 * 1000

  for (let i = 0; i < 6; i++) {
    const start = new Date(now.getTime() - (i + 1) * 3 * dayMs)
    start.setHours(9 + (i % 6), 0, 0, 0)
    const end = new Date(start.getTime() + 45 * 60 * 1000)
    await db.insert(schema.appointment).values({
      id: newId('appt'),
      organizationId: orgId,
      patientId: pick(patientIds),
      locationId,
      title: `${pick(APPT_TYPES).replace('_', ' ')} — past`,
      startTime: start,
      endTime: end,
      type: pick(APPT_TYPES),
      status: i % 5 === 0 ? 'no_show' : 'completed',
      notes: null,
    })
    apptCount++
  }
  for (let i = 0; i < 6; i++) {
    const start = new Date(now.getTime() + (i + 1) * 2 * dayMs)
    start.setHours(10 + (i % 6), 0, 0, 0)
    const end = new Date(start.getTime() + 45 * 60 * 1000)
    await db.insert(schema.appointment).values({
      id: newId('appt'),
      organizationId: orgId,
      patientId: pick(patientIds),
      locationId,
      title: `${pick(APPT_TYPES).replace('_', ' ')}`,
      startTime: start,
      endTime: end,
      type: pick(APPT_TYPES),
      status: i % 3 === 0 ? 'confirmed' : 'scheduled',
      notes: null,
    })
    apptCount++
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

  // CRM-style customers (these populate the legacy /ecommerce/customers table
  // until the dedicated Patients module ships). 10 sample leads with mixed
  // pipeline stages so the marketing module also has something to look at.
  const STAGES = ['new', 'contacted', 'qualified', 'opportunity', 'won']
  const customerRows = Array.from({ length: 10 }, (_, i) => {
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
      lifecycleStage: i < 4 ? 'lead' : 'customer',
      lastActivityAt: new Date(now.getTime() - i * dayMs),
    }
  })
  const insertedCustomers = await db.insert(schema.customers).values(customerRows).returning({ id: schema.customers.id })

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

  const invoiceStatuses = ['paid', 'paid', 'pending', 'overdue', 'draft'] as const
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.invoices).values({
      organizationId: orgId,
      invoiceNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[i % insertedCustomers.length]?.id ?? null,
      status: invoiceStatuses[i % invoiceStatuses.length],
      totalCents: 20000 + i * 7500,
      currency: 'USD',
      paidAt:
        invoiceStatuses[i % invoiceStatuses.length] === 'paid'
          ? new Date(now.getTime() - i * dayMs)
          : null,
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
