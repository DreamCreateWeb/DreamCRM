import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track every call so we can assert insert/select payloads.
const insertedRows: Array<{ table: string; values: unknown }> = []
const selectStubs = {
  patient: null as { id: string } | null,
  profile: null as
    | {
        email: string | null
        displayName: string | null
        phone?: string | null
        addressLine1?: string | null
        addressLine2?: string | null
        city?: string | null
        state?: string | null
        postalCode?: string | null
        visitTypeSettings?: unknown
        selfBookingEnabled?: boolean
      }
    | null,
}

function chain(returnFn: () => unknown) {
  const obj: any = {}
  const passthrough = () => obj
  obj.from = passthrough
  obj.where = passthrough
  obj.limit = async () => {
    const out = returnFn()
    return out ? [out] : []
  }
  return obj
}

vi.mock('@/lib/db', async () => {
  const { patient, appointment, lead } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        // Dispatch by selected columns — patient lookup vs profile lookup.
        if (cols && 'id' in cols && Object.keys(cols).length === 1) {
          return chain(() => selectStubs.patient)
        }
        return chain(() => selectStubs.profile)
      },
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          let tableName = 'unknown'
          if (table === patient) tableName = 'patient'
          else if (table === appointment) tableName = 'appointment'
          else if (table === lead) tableName = 'lead'
          insertedRows.push({ table: tableName, values: vals })
        },
      }),
      // Patient "last activity" bump on rebook — we just need the chain
      // to resolve. The test doesn't assert on the bumped value.
      update: () => ({
        set: () => ({ where: async () => undefined }),
      }),
    },
    schema: { lead },
  }
})

vi.mock('@/lib/email', () => ({
  sendContactRequestEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}))

const { notifyOrgMembersMock } = vi.hoisted(() => ({
  notifyOrgMembersMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: notifyOrgMembersMock,
}))

// Slot availability is exercised in its own test file; the action tests
// only care that submitBookingRequest writes the right rows + sends the
// right email, so we stub the slot check to always pass.
const { slotAvailableMock } = vi.hoisted(() => ({
  slotAvailableMock: vi.fn(async () => true),
}))
vi.mock('@/lib/services/booking', async () => {
  const { db } = await import('@/lib/db')
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    isSlotAvailable: slotAvailableMock,
    // Atomic-book helper: route the insert through the same db mock so the
    // existing appointment-insert assertions keep working.
    insertAppointmentIfSlotFree: async (_o: string, _s: Date, _d: unknown, values: unknown) => {
      await db.insert(appointment).values(values as never)
      return true
    },
    SLOT_MINUTES: 30,
  }
})

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    name: 'Acme Dental',
    timeZone: 'America/New_York',
  })),
}))

// Default-form lookup for the booking confirmation's intake CTA. Controllable
// per test via `defaultForm`.
let defaultForm: { slug: string } | null = null
vi.mock('@/lib/services/forms', () => ({
  getDefaultFormTemplate: vi.fn(async () => defaultForm),
}))

// The actions now resolve the org from the public slug server-side instead of
// trusting a client-posted orgId. Map the test slug → org_1; anything else
// (missing/unknown slug) → null so the "not found" guards fire.
vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: () => 'https://clinic.test',
  resolveClinicOrgIdBySlug: async (slug?: string) => (slug && slug !== 'unknown' ? 'org_1' : null),
}))

import { submitContactRequest, submitBookingRequest } from '@/app/site/[slug]/actions'
import { sendContactRequestEmail, sendBookingConfirmationEmail, sendNotificationEmail } from '@/lib/email'

beforeEach(() => {
  insertedRows.length = 0
  selectStubs.patient = null
  selectStubs.profile = null
  defaultForm = null
  vi.clearAllMocks()
  slotAvailableMock.mockResolvedValue(true)
  notifyOrgMembersMock.mockResolvedValue(undefined)
})

describe('submitContactRequest', () => {
  function form(fields: Record<string, string | null>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
    return fd
  }

  it('rejects an unresolvable clinic (missing/unknown slug)', async () => {
    await expect(
      submitContactRequest(form({ name: 'A', phone: '555' })),
    ).rejects.toThrow(/clinic/i)
  })

  it('rejects missing name', async () => {
    await expect(
      submitContactRequest(form({ slug: 'acme', phone: '555' })),
    ).rejects.toThrow(/name/i)
  })

  it('rejects missing phone', async () => {
    await expect(
      submitContactRequest(form({ slug: 'acme', name: 'Jane' })),
    ).rejects.toThrow(/phone/i)
  })

  it('emails the clinic when profile.email is set', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental' }
    await submitContactRequest(
      form({
        slug: 'acme',
        name: 'Jane Doe',
        phone: '5551234',
        email: 'jane@example.com',
        message: 'Tooth hurts',
      }),
    )
    // Give the fire-and-forget .catch() a tick to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(sendContactRequestEmail).toHaveBeenCalledWith(
      'clinic@x.com',
      expect.objectContaining({
        clinicName: 'X Dental',
        patientName: 'Jane Doe',
        phone: '5551234',
        email: 'jane@example.com',
        message: 'Tooth hurts',
      }),
    )
  })

  it('does not email when clinic has no email configured', async () => {
    selectStubs.profile = { email: null, displayName: 'X Dental' }
    await submitContactRequest(
      form({ slug: 'acme', name: 'Jane', phone: '555' }),
    )
    expect(sendContactRequestEmail).not.toHaveBeenCalled()
  })

  it('persists the lead row even when email delivery is misconfigured', async () => {
    selectStubs.profile = null // simulates clinic with no profile/email
    await submitContactRequest(
      form({
        slug: 'acme',
        name: 'Jane Doe',
        phone: '5551234',
        email: 'jane@example.com',
        message: 'Tooth hurts',
      }),
    )
    // Lead row is the source of truth — DB write must happen even if
    // email never gets sent.
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect(leadInsert).toBeDefined()
    expect(leadInsert!.values).toMatchObject({
      organizationId: 'org_1',
      name: 'Jane Doe',
      phone: '5551234',
      email: 'jane@example.com',
      message: 'Tooth hurts',
    })
  })

  it('captures source-attribution fields from the form when present', async () => {
    selectStubs.profile = null
    await submitContactRequest(
      form({
        slug: 'acme',
        name: 'Tracked Lead',
        phone: '5552345',
        sourcePage: '/services',
        referrer: 'https://www.google.com/',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'fall_recall',
      }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect(leadInsert).toBeDefined()
    expect(leadInsert!.values).toMatchObject({
      sourcePage: '/services',
      referrer: 'https://www.google.com/',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'fall_recall',
    })
  })

  it('notifies org owners/admins of the new website lead → /leads', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitContactRequest(
      form({ slug: 'acme', name: 'Jane Doe', phone: '5551234', email: 'jane@example.com', message: 'Tooth hurts' }),
    )
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'website_lead',
        title: expect.stringContaining('Jane Doe'),
        linkPath: '/leads',
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('sends the patient a warm auto-acknowledgement when they leave an email', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitContactRequest(
      form({ slug: 'acme', name: 'Jane Doe', phone: '5551234', email: 'jane@example.com', message: 'Tooth hurts' }),
    )
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        title: expect.stringContaining('Acme Dental'), // clinic sender name
        body: expect.stringContaining('one business day'),
      }),
      expect.objectContaining({ from: 'Acme Dental <acme-dental@dreamcreatestudio.com>' }),
    )
  })

  it('skips the patient auto-acknowledgement when no email is supplied', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitContactRequest(form({ slug: 'acme', name: 'Jane', phone: '555' }))
    expect(sendNotificationEmail).not.toHaveBeenCalled()
    // …but the front desk is still pinged about the lead.
    expect(notifyOrgMembersMock).toHaveBeenCalled()
  })
})

describe('submitBookingRequest', () => {
  function form(fields: Record<string, string | null>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
    return fd
  }

  // Always-future startTime so the past-time guard never fires in tests.
  const futureStartTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const baseFields = {
    slug: 'acme',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@x.com',
    phone: '555',
    type: 'cleaning',
    startTime: futureStartTime,
    notes: null,
  }

  it('rejects an unresolvable clinic (missing/unknown slug)', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, slug: null })),
    ).rejects.toThrow(/clinic/i)
  })

  it('rejects missing first/last name', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, firstName: null })),
    ).rejects.toThrow(/name/i)
  })

  it('rejects missing startTime', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, startTime: null })),
    ).rejects.toThrow(/date/i)
  })

  it('rejects malformed startTime', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, startTime: 'not-a-date' })),
    ).rejects.toThrow(/Invalid/i)
  })

  it('rejects past startTime', async () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    await expect(
      submitBookingRequest(form({ ...baseFields, startTime: past })),
    ).rejects.toThrow(/future/i)
  })

  it('rejects when slot is no longer available (race condition)', async () => {
    slotAvailableMock.mockResolvedValueOnce(false)
    await expect(submitBookingRequest(form(baseFields))).rejects.toThrow(/no longer available/i)
  })

  it('refuses to create an appointment when the clinic disabled self-scheduling (stale tab)', async () => {
    selectStubs.profile = { email: null, displayName: 'Acme', selfBookingEnabled: false }
    await expect(submitBookingRequest(form(baseFields))).rejects.toThrow(/online booking isn/i)
    // No appointment written — the patient is steered to the request flow.
    expect(insertedRows.find((r) => r.table === 'appointment')).toBeUndefined()
  })

  it('creates a new patient when none exists with that email', async () => {
    selectStubs.patient = null
    selectStubs.profile = null
    await submitBookingRequest(form(baseFields))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')
    expect(patientInsert).toBeDefined()
    expect(appointmentInsert).toBeDefined()
    expect((patientInsert!.values as { firstName: string }).firstName).toBe('Jane')
  })

  it('reuses existing patient when email matches', async () => {
    selectStubs.patient = { id: 'pat_existing' }
    await submitBookingRequest(form(baseFields))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    expect(patientInsert).toBeUndefined()
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')
    expect(appointmentInsert).toBeDefined()
    expect((appointmentInsert!.values as { patientId: string }).patientId).toBe('pat_existing')
  })

  it("tags the booking with source='booking_widget' so the Appointments module can filter on it", async () => {
    selectStubs.patient = { id: 'pat_existing' }
    await submitBookingRequest(form(baseFields))
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')
    expect(appointmentInsert).toBeDefined()
    expect((appointmentInsert!.values as { source?: string }).source).toBe('booking_widget')
  })

  it('creates a new patient when no email is provided', async () => {
    await submitBookingRequest(form({ ...baseFields, email: null }))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    expect(patientInsert).toBeDefined()
  })

  it('sends a booking confirmation email to the patient', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitBookingRequest(form(baseFields))
    await new Promise((r) => setTimeout(r, 0))
    expect(sendBookingConfirmationEmail).toHaveBeenCalledWith(
      'jane@x.com',
      expect.objectContaining({
        patientName: 'Jane Doe',
        clinicName: 'Acme Dental', // from the mocked clinic sender identity
        appointmentType: 'cleaning',
      }),
      expect.objectContaining({ from: 'Acme Dental <acme-dental@dreamcreatestudio.com>' }),
    )
  })

  it('skips confirmation email when patient supplies no email', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X', phone: null }
    await submitBookingRequest(form({ ...baseFields, email: null }))
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled()
  })

  it('notifies org owners/admins of the new online booking → the patient record', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitBookingRequest(form(baseFields))
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'online_booking',
        title: expect.stringContaining('Jane Doe'),
        // Email/bell CTA opens the patient's record, not the agenda, with a
        // clear named action label.
        linkPath: expect.stringMatching(/^\/patients\/.+/),
        linkLabel: expect.stringContaining('Jane'),
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('persists the appointment status as scheduled and the type as provided', async () => {
    await submitBookingRequest(form({ ...baseFields, type: 'root_canal' }))
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')!
    const vals = appointmentInsert.values as { status: string; type: string; title: string }
    expect(vals.status).toBe('scheduled')
    expect(vals.type).toBe('root_canal')
    expect(vals.title).toMatch(/Root canal/)
  })

  // ── Optional front-desk-context questions (ride the notes, no schema) ──
  it('prefixes the appointment notes with new-patient + insurance context when answered', async () => {
    await submitBookingRequest(
      form({ ...baseFields, visitedBefore: 'new', hasInsurance: 'yes', notes: 'Nervous patient' }),
    )
    const vals = insertedRows.find((r) => r.table === 'appointment')!.values as { notes: string | null }
    expect(vals.notes).toContain('New patient (first visit)')
    expect(vals.notes).toContain('Has dental insurance')
    expect(vals.notes).toContain('Nervous patient')
  })

  it('records the returning-patient + no-insurance + unsure answers', async () => {
    await submitBookingRequest(form({ ...baseFields, visitedBefore: 'returning', hasInsurance: 'no' }))
    let vals = insertedRows.find((r) => r.table === 'appointment')!.values as { notes: string | null }
    expect(vals.notes).toContain('Returning patient')
    expect(vals.notes).toContain('No dental insurance')

    insertedRows.length = 0
    await submitBookingRequest(form({ ...baseFields, hasInsurance: 'unsure' }))
    vals = insertedRows.find((r) => r.table === 'appointment')!.values as { notes: string | null }
    expect(vals.notes).toContain('Unsure about dental insurance')
  })

  it('leaves notes null when both optional questions are skipped and no free-text note', async () => {
    await submitBookingRequest(form({ ...baseFields, notes: null }))
    const vals = insertedRows.find((r) => r.table === 'appointment')!.values as { notes: string | null }
    expect(vals.notes).toBeNull()
  })

  // ── Confirmation payload returned to the success screen ──
  it('returns a confirmation payload with the visit details, address + maps link', async () => {
    selectStubs.profile = {
      email: 'clinic@x.com',
      displayName: 'X Dental',
      phone: '555-clinic',
      addressLine1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
    }
    const conf = await submitBookingRequest(form({ ...baseFields, type: 'cleaning' }))
    expect(conf.patientName).toBe('Jane Doe')
    expect(conf.clinicName).toBe('Acme Dental') // sender identity name
    expect(conf.visitTypeLabel).toBe('Cleaning')
    expect(conf.timeZone).toBe('America/New_York')
    expect(conf.addressText).toContain('123 Main St')
    expect(conf.addressText).toContain('Springfield')
    expect(conf.mapsUrl).toContain('google.com/maps')
    expect(conf.emailSent).toBe(true)
    // endTime is after startTime.
    expect(new Date(conf.endTimeIso).getTime()).toBeGreaterThan(new Date(conf.startTimeIso).getTime())
  })

  it('returns emailSent=false and null address bits for a phone-only booker with no clinic address', async () => {
    selectStubs.profile = { email: null, displayName: 'X Dental', phone: '555-clinic' }
    const conf = await submitBookingRequest(form({ ...baseFields, email: null }))
    expect(conf.emailSent).toBe(false)
    expect(conf.addressText).toBeNull()
    expect(conf.mapsUrl).toBeNull()
  })

  it('surfaces the intake-form URL in the confirmation when the clinic has a default form', async () => {
    selectStubs.profile = { email: 'jane@x.com', displayName: 'X Dental', phone: '555' }
    defaultForm = { slug: 'new-patient' }
    const conf = await submitBookingRequest(form(baseFields))
    expect(conf.intakeFormUrl).toContain('/intake/new-patient')
  })

  it('confirmation intakeFormUrl is null when the clinic has no default form', async () => {
    selectStubs.profile = { email: 'jane@x.com', displayName: 'X Dental', phone: '555' }
    defaultForm = null
    const conf = await submitBookingRequest(form(baseFields))
    expect(conf.intakeFormUrl).toBeNull()
  })
})
